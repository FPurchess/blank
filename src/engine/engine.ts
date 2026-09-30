import { sendNotification } from "@tauri-apps/plugin-notification";
import type { Node } from "prosemirror-model";
import { shallowRef } from "vue";

import type { DocumentFields } from "../layout/bands";
import { type Layout, pageGeometry } from "../layout/resolve";
import {
  type Change,
  diff,
  flattenBlocks,
  type FlatRecord,
  type FrozenWidths,
  type ImageSizes,
} from "./flatten";
import { type FallbackFont, fallbackFonts } from "./fallback";
import { FONT_URLS } from "./fonts";
import init, { initSync, LayoutEngine } from "./wasm/blank_layout.js";
import wasmUrl from "./wasm/blank_layout_bg.wasm?url";
import { bootMark } from "./perf";
import { packFonts } from "./pdfJob";
import type { EngineItem } from "./types";

// The layout engine (src-tauri/layout, built for the webview by
// scripts/build-engine.sh) and what it needs: its fonts, the document as
// flattened items, and the page. One layout is what the page view paints and
// what the PDF holds.

// a hit of a point or a movement: a caret position, or a node to select
export interface Hit {
  node: boolean;
  pos: number;
}

// a move of the caret: where it lands, and, where a line ends at the
// position the next one starts, whether it's painted at the end of the line
// before (`after`, as caret takes it)
export interface Move extends Hit {
  after: boolean;
}

const toHit = (values: Float64Array): Hit | null =>
  values.length === 2 ? { node: values[0] === 1, pos: values[1] } : null;

// a box on a page, in points from its top left corner
export interface PageBox {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

// a table as laid out: where each column starts on the page and where the
// last ends, and each row placed on a page
export interface EngineTableGrid {
  columns: number[];
  rows: {
    page: number;
    row: number;
    y: number;
    height: number;
    // a header row repeated on a page the table continues on
    repeat: boolean;
  }[];
}

const rectsOf = (values: Float32Array): PageBox[] => {
  const rects: PageBox[] = [];
  for (let index = 0; index + 4 < values.length; index += 5) {
    rects.push({
      page: values[index],
      x: values[index + 1],
      y: values[index + 2],
      width: values[index + 3],
      height: values[index + 4],
    });
  }
  return rects;
};

// what a page shows, as the engine writes it (see wasm.rs `page`)
export interface PageDisplay {
  // rectangles: x, y, width, height, role
  r: number[][];
  // images: src, x, y, width, height
  i: [string, number, number, number, number][];
  // links: href, x, y, width, height
  l: [string, number, number, number, number][];
  // glyph runs: font, size, role, then id, x, y for each glyph
  g: number[][];
}

/**
 * settingsOf turns a layout and what the fields stand for into the engine's
 * settings, see model.rs
 */
export const settingsOf = (layout: Layout, fields: DocumentFields) => {
  const { width, height, margins } = pageGeometry(layout);
  return {
    width,
    height,
    margins,
    newPageBefore: layout.newPageBefore,
    header: layout.header,
    footer: layout.footer,
    firstPage: layout.firstPage,
    evenPages: layout.evenPages,
    numberStyle: layout.numberStyle,
    startNumber: layout.startNumber,
    fields,
  };
};

// Whether the engine runs: "off" when the user switched it off (see
// bootEngine), "unavailable" when it couldn't load, and "failed" when it
// stopped working while Blank ran. Without it, the editor shows the text
// itself (body.without-engine), as before the page view.
export type EngineStatus = "ready" | "off" | "unavailable" | "failed";
let status: EngineStatus = "ready";

export const engineStatus = () => status;

/**
 * engineless tells whether Blank runs without the engine, as a plain editor
 */
export const engineless = () => status !== "ready";

/**
 * useFallbackEditor lets the editor show the text itself, without the engine
 */
export const useFallbackEditor = (reason: Exclude<EngineStatus, "ready">) => {
  status = reason;
  document.body.classList.add("without-engine");
};

// what the user reads once the engine stopped working
export const ENGINE_FAILED =
  "The page layout stopped working. Your text is safe: Blank shows it without pages until you restart it.";

// whether the wasm instance trapped, after which the PDF export uses one of
// its own (see pdf.ts)
let instanceBroken = false;
export const engineInstanceBroken = () => instanceBroken;

let notified = false;

/**
 * forgetEngineFailure forgets that the engine failed, e.g. between tests
 */
export const forgetEngineFailure = () => {
  status = "ready";
  instanceBroken = false;
  notified = false;
  document.body.classList.remove("without-engine");
};

const EMPTY_DISPLAY: PageDisplay = { r: [], i: [], l: [], g: [] };

// what changed in a document since the one the engine laid out
export interface Changes {
  // the document the ranges count from
  from: Node;
  // the parts of the new document that changed since, from and to
  ranges: readonly (readonly [number, number])[];
}

export interface SyncOptions {
  // flattens the whole document again, even the same one
  force?: boolean;
  frozen?: FrozenWidths | null;
  // lays out a long document's first pages first, see FIRST_ITEMS
  progressive?: boolean;
  changes?: Changes | null;
  // what else the images' sizes depend on, e.g. the room for the text and
  // the document's folder; a new one flattens the whole document again
  sizesKey?: string;
  // top-level blocks to flatten again, e.g. those whose image loaded
  blocks?: readonly number[];
}

// flattening more blocks than this again costs about as much as flattening
// all of them, which then compares cheaper
const MAX_BLOCKS = 64;

/**
 * blockAt returns the top-level block at a position of `doc`, or the one
 * after it at a boundary
 */
const blockAt = (doc: Node, pos: number) =>
  doc.resolve(Math.max(0, Math.min(pos, doc.content.size))).index(0);

// where each block's records start, from `start`, and where the last ends
const startsOf = (blocks: FlatRecord[][], start: number) => {
  const starts = [start];
  for (const block of blocks)
    starts.push(starts[starts.length - 1] + block.length);
  return starts;
};

// the size of the top-level blocks of `doc` from `from` to before `to`
const sizeOf = (doc: Node, from: number, to: number) => {
  let size = 0;
  for (let index = from; index < to; index++) size += doc.child(index).nodeSize;
  return size;
};

// the blocks from `from` to `to` of the new document, which replace those
// from `oldFrom` to `oldTo` of the old one
interface Group {
  from: number;
  to: number;
  oldFrom: number;
  oldTo: number;
}

/**
 * matchGroups joins the touched blocks of `doc` that meet into groups, and
 * finds the blocks of `old` each replaces. The blocks between the groups
 * must be the same nodes in both, as ProseMirror keeps the nodes a change
 * left alone.
 * @returns null when they aren't
 */
const matchGroups = (
  old: Node,
  doc: Node,
  touched: [number, number][],
): Group[] | null => {
  const count = doc.childCount;
  const clamp = (index: number) => Math.max(0, Math.min(index, count - 1));
  const joined: [number, number][] = [];
  for (const [from, to] of touched
    .map(([from, to]): [number, number] => [
      clamp(Math.min(from, to)),
      clamp(Math.max(from, to)),
    ])
    .sort((a, b) => a[0] - b[0])) {
    const last = joined[joined.length - 1];
    if (last && from <= last[1] + 1) last[1] = Math.max(last[1], to);
    else joined.push([from, to]);
  }
  // the last block of `old` a group ending at `to` replaces: the one before
  // the next block, which is the same in both
  const oldEnd = (oldFrom: number, to: number) => {
    if (to + 1 >= count) return old.childCount - 1;
    const next = doc.child(to + 1);
    for (let index = oldFrom; index < old.childCount; index++)
      if (old.child(index) === next) return index - 1;
    return null;
  };
  const groups: Group[] = [];
  let at = 0;
  let oldAt = 0;
  for (let index = 0; index < joined.length; index++) {
    const from = joined[index][0];
    let to = joined[index][1];
    for (let block = at; block < from; block++)
      if (old.maybeChild(oldAt + block - at) !== doc.child(block)) return null;
    const oldFrom = oldAt + from - at;
    let oldTo = oldEnd(oldFrom, to);
    if (oldTo === null) return null;
    // the space above a heading depends on the block before it
    for (;;) {
      const next = doc.maybeChild(to + 1);
      if (
        next?.type.name !== "heading" ||
        (to - from === oldTo - oldFrom &&
          old.maybeChild(oldTo)?.type === doc.child(to).type)
      )
        break;
      to++;
      while (index + 1 < joined.length && joined[index + 1][0] <= to + 1)
        to = Math.max(to, joined[++index][1]);
      oldTo = oldEnd(oldFrom, to);
      if (oldTo === null) return null;
    }
    if (oldTo < oldFrom - 1) return null;
    groups.push({ from, to, oldFrom, oldTo });
    at = to + 1;
    oldAt = oldTo + 1;
  }
  if (count - at !== old.childCount - oldAt) return null;
  for (let block = at; block < count; block++)
    if (old.child(oldAt + block - at) !== doc.child(block)) return null;
  return groups;
};

// how many items the first layout of a long document lays out before the
// pages show, a few pages' worth, and then at a time
const FIRST_ITEMS = 60;
const CHUNK_ITEMS = 80;

/**
 * PageEngine keeps the engine in step with a document: only what changed
 * is handed to it. Every call into the engine goes through `call`, so an
 * error in it (a trap of the wasm, say) never reaches the editor or the
 * painters: the engine is given up, and the editor shows the text itself.
 */
export class PageEngine {
  private records: FlatRecord[] = [];
  // where the records of each top-level block start, and where the last ends
  private blockStarts: number[] = [];
  private doc: Node | null = null;
  // what the sizes of the images depend on, see SyncOptions
  private sizesKey = "";
  private settings = "";
  private frozen = "";
  private displays = new Map<
    number,
    { version: number; display: PageDisplay }
  >();
  // what each page's body and bands show, by their own versions
  private bodies = new Map<number, { version: number; display: PageDisplay }>();
  private bandsShown = new Map<
    number,
    { version: number; display: PageDisplay }
  >();
  private paths = new Map<number, Path2D>();
  private upems = new Map<number, number>();

  // the fallback fonts added, see fallback.ts
  private added = new Set<FallbackFont>();

  // set once a call failed, after which each call returns its fallback
  broken = false;
  // for a test: the next call fails, as if the wasm trapped
  private breakNext = false;

  /**
   * @param strict throws the error of a failed call instead of returning
   *   the fallback, e.g. for the PDF export, which must not write an empty
   *   document
   */
  constructor(
    readonly raw: LayoutEngine,
    private readonly strict = false,
  ) {}

  /**
   * call runs `run`, which calls the engine, and returns `fallback` if it
   * fails or the engine failed before
   */
  private call<T>(fallback: T, run: () => T): T {
    if (this.broken) {
      if (this.strict) throw new Error("the page layout failed before");
      return fallback;
    }
    try {
      if (this.breakNext) {
        this.breakNext = false;
        throw new WebAssembly.RuntimeError("unreachable (blankBreakEngine)");
      }
      return run();
    } catch (error) {
      this.fail(error);
      if (this.strict) throw error;
      return fallback;
    }
  }

  // gives the engine up after its first error
  private fail(error: unknown) {
    this.broken = true;
    instanceBroken = true;
    clearTimeout(this.timer);
    this.pending = null;
    this.onProgress = null;
    console.error("the layout engine failed", error);
    if (this !== pageEngine) return;
    useFallbackEditor("failed");
    setPageEngine(null);
    if (notified) return;
    notified = true;
    try {
      sendNotification(ENGINE_FAILED);
    } catch (notifyError) {
      console.error("failed to send notification", notifyError);
    }
  }

  /**
   * sharing makes another engine with this one's fonts, which the wasm
   * shares instead of copying them: its files and the fallbacks added
   * @param strict see the constructor
   */
  sharing(strict = false) {
    const raw = this.call(null, () => LayoutEngine.withFontsOf(this.raw));
    if (!raw) throw new Error("the page layout failed");
    const engine = new PageEngine(raw, strict);
    for (const font of this.added) engine.added.add(font);
    return engine;
  }

  /**
   * breakForTest makes the next call fail, as if the wasm trapped
   */
  breakForTest() {
    this.breakNext = true;
  }

  /**
   * addFonts adds the fallback fonts it hasn't got yet, and lays out again
   * with them
   * @returns whether it added any
   */
  addFonts(fonts: readonly FallbackFont[]) {
    return this.call(false, () => this.addNewFonts(fonts));
  }

  private addNewFonts(fonts: readonly FallbackFont[]) {
    let added = false;
    for (const font of fonts) {
      if (this.added.has(font)) continue;
      this.added.add(font);
      this.raw.addFont(font.bytes, font.family);
      added = true;
    }
    if (added) {
      this.displays.clear();
      this.bodies.clear();
      this.bandsShown.clear();
    }
    return added;
  }

  /**
   * missing returns the characters of the document no font has
   */
  missing() {
    return this.call("", () => this.raw.missing());
  }

  /**
   * setSettings sets the page, and lays out again if it changed
   * @returns whether it changed
   */
  setSettings(layout: Layout, fields: DocumentFields) {
    return this.call(false, () => {
      const json = JSON.stringify(settingsOf(layout, fields));
      if (json === this.settings) return false;
      this.settings = json;
      this.raw.setSettings(json);
      return true;
    });
  }

  /**
   * sync hands the engine what changed in the document since the last sync:
   * with `changes`, only the top-level blocks they touch are flattened
   * again, and the engine moves the items after them; without, or when
   * something else the items depend on changed, the whole document is
   * flattened and compared with what the engine has
   * @returns whether anything changed
   */
  sync(doc: Node, sizes: ImageSizes, options: SyncOptions = {}) {
    return this.call(false, () => this.syncNow(doc, sizes, options));
  }

  /**
   * syncedDoc is the document the engine last laid out, which `changes`
   * count from
   */
  get syncedDoc() {
    return this.doc;
  }

  private syncNow(
    doc: Node,
    sizes: ImageSizes,
    {
      force = false,
      frozen = null,
      progressive = false,
      changes = null,
      sizesKey = "",
      blocks = [],
    }: SyncOptions,
  ) {
    const frozenKey = frozen ? `${frozen.pos}:${frozen.widths.join(" ")}` : "";
    const same =
      !force && frozenKey === this.frozen && sizesKey === this.sizesKey;
    if (doc === this.doc && same && blocks.length === 0) return false;
    this.frozen = frozenKey;
    this.sizesKey = sizesKey;
    // what is still to lay out goes first, so the engine has all of it
    this.finish();
    const ranges = doc === this.doc ? [] : changes?.ranges;
    if (
      same &&
      ranges &&
      (doc === this.doc || changes?.from === this.doc) &&
      this.syncBlocks(doc, ranges, blocks, sizes, frozen)
    )
      return true;
    this.syncAll(doc, sizes, frozen, progressive);
    return true;
  }

  // flattens the whole document, and hands the engine what differs
  private syncAll(
    doc: Node,
    sizes: ImageSizes,
    frozen: FrozenWidths | null,
    progressive: boolean,
  ) {
    const blocks = flattenBlocks(doc, 0, doc.childCount, sizes, frozen);
    const records = blocks.flat();
    if (this.doc === null) {
      const first = progressive ? records.slice(0, FIRST_ITEMS) : records;
      this.raw.setItems(JSON.stringify(first.map((record) => record.build())));
      if (first.length < records.length) {
        this.pending = { records, next: first.length };
        this.later();
      }
    } else {
      const shift = doc.content.size - this.doc.content.size;
      this.send(diff(this.records, records, shift), 0);
    }
    this.records = records;
    this.blockStarts = startsOf(blocks, 0);
    this.doc = doc;
  }

  /**
   * syncBlocks flattens only the top-level blocks the changed ranges of
   * `doc` touch, and the `extra` ones, and keeps the records of all others.
   * Blocks apart are handed over as separate changes in one call; the
   * engine moves the items after each itself.
   * @returns false when that isn't cheaper than flattening it all, or the
   *   blocks between the changes aren't the same
   */
  private syncBlocks(
    doc: Node,
    ranges: Changes["ranges"],
    extra: readonly number[],
    sizes: ImageSizes,
    frozen: FrozenWidths | null,
  ) {
    const old = this.doc!;
    const touched: [number, number][] = [
      ...ranges.map(([start, end]): [number, number] => [
        blockAt(doc, start),
        blockAt(doc, end),
      ]),
      ...extra.map((index): [number, number] => [index, index]),
    ];
    if (touched.length === 0) {
      // e.g. only the frontmatter changed, which the settings bring
      if (doc.childCount !== old.childCount) return false;
      this.doc = doc;
      return true;
    }
    const groups = matchGroups(old, doc, touched);
    if (!groups) return false;
    const flattened = groups.reduce(
      (sum, group) => sum + group.to - group.from + 1,
      0,
    );
    if (flattened > Math.max(MAX_BLOCKS, doc.childCount / 2)) return false;

    const entries: [number, number, EngineItem[], number][] = [];
    // how many blocks the groups before added, to find the next one's
    let moved = 0;
    for (const { from, to, oldFrom, oldTo } of groups) {
      const fresh = flattenBlocks(doc, from, to + 1, sizes, frozen);
      const records = fresh.flat();
      const start = this.blockStarts[oldFrom + moved];
      const end = this.blockStarts[oldTo + 1 + moved];
      const shift = sizeOf(doc, from, to + 1) - sizeOf(old, oldFrom, oldTo + 1);
      const change = diff(this.records.slice(start, end), records, shift);
      if (change.delete > 0 || change.records.length > 0 || shift !== 0) {
        entries.push([
          start + change.start,
          change.delete,
          change.records.map((record) => record.build()),
          shift,
        ]);
      }
      // the records after them keep what they are, at their new positions;
      // they are never built again, since the engine has them already
      for (let index = end; index < this.records.length; index++)
        this.records[index].pos += shift;
      this.records.splice(start, end - start, ...records);
      const added = records.length - (end - start);
      this.blockStarts = [
        ...this.blockStarts.slice(0, oldFrom + moved),
        // the end of the fresh blocks is where the next block starts
        ...startsOf(fresh, start).slice(0, -1),
        ...this.blockStarts
          .slice(oldTo + 1 + moved)
          .map((index) => index + added),
      ];
      moved += to - from - (oldTo - oldFrom);
    }
    if (entries.length === 1) {
      const [start, count, items, shift] = entries[0];
      this.raw.update(start, count, JSON.stringify(items), shift);
    } else if (entries.length > 1) {
      this.raw.updateMany(JSON.stringify(entries));
    }
    this.doc = doc;
    return true;
  }

  // hands the engine a change, whose records start at `offset`
  private send(change: Change, offset: number) {
    if (
      change.delete === 0 &&
      change.records.length === 0 &&
      change.shift === 0
    )
      return;
    this.raw.update(
      offset + change.start,
      change.delete,
      JSON.stringify(change.records.map((record) => record.build())),
      change.shift,
    );
  }

  // the first layout of a long document, laid out a chunk at a time after
  // its first pages (see sync), and a callback after each chunk
  private pending: { records: FlatRecord[]; next: number } | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  onProgress: (() => void) | null = null;

  /**
   * laying tells whether the engine is still laying out the rest of the
   * document, after its first pages
   */
  get laying() {
    return this.pending !== null;
  }

  // lays out the next `count` records of the rest
  private append(count: number) {
    const pending = this.pending;
    if (!pending) return;
    const chunk = pending.records.slice(pending.next, pending.next + count);
    this.raw.update(
      pending.next,
      0,
      JSON.stringify(chunk.map((record) => record.build())),
      0,
    );
    pending.next += chunk.length;
    if (pending.next >= pending.records.length) this.pending = null;
  }

  // lays out the rest a chunk at a time, between the webview's other work
  private later() {
    this.timer = setTimeout(() => {
      this.call(undefined, () => this.append(CHUNK_ITEMS));
      if (this.broken) return;
      this.onProgress?.();
      if (this.pending) this.later();
    });
  }

  /**
   * finish lays out the rest of the document now
   */
  finish() {
    clearTimeout(this.timer);
    if (this.pending) this.call(undefined, () => this.append(Infinity));
  }

  pages() {
    return this.call(0, () => this.raw.pageCount());
  }

  // changes when what a page shows changes
  versions() {
    return this.call(new Uint32Array(), () => this.raw.versions());
  }

  // where the text of each page ends
  bottoms() {
    return this.call(new Float32Array(), () => this.raw.bottoms());
  }

  addImage(src: string, bytes: Uint8Array, jpeg: boolean) {
    this.call(undefined, () => this.raw.addImage(src, bytes, jpeg));
  }

  pdf(title: string, author: string) {
    return this.call(new Uint8Array(), () => this.raw.pdf(title, author));
  }

  /**
   * free gives the engine's memory back; it can't be used after
   */
  free() {
    try {
      this.raw.free();
    } catch (error) {
      // a trapped engine may not free, which leaves its memory to the wasm
      console.error("failed to free the layout engine", error);
    }
  }

  /**
   * display returns what a page shows, read again only when it changed
   * @deprecated paint bodyDisplay and bandDisplay, which change apart
   */
  display(page: number, version: number): PageDisplay {
    const cached = this.displays.get(page);
    if (cached?.version === version) return cached.display;
    return this.call(EMPTY_DISPLAY, () => {
      const display = JSON.parse(this.raw.page(page)) as PageDisplay;
      this.displays.set(page, { version, display });
      return display;
    });
  }

  /**
   * bodyDisplay returns what a page's body shows, without its header and
   * footer, read again only when its body version changed
   */
  bodyDisplay(page: number, version: number): PageDisplay {
    return this.cachedDisplay(this.bodies, page, version, () =>
      this.raw.pageBody(page),
    );
  }

  /**
   * bandDisplay returns what a page's header and footer show, read again
   * only when its band version changed
   */
  bandDisplay(page: number, version: number): PageDisplay {
    return this.cachedDisplay(this.bandsShown, page, version, () =>
      this.raw.pageBands(page),
    );
  }

  private cachedDisplay(
    cache: Map<number, { version: number; display: PageDisplay }>,
    page: number,
    version: number,
    read: () => string,
  ): PageDisplay {
    const cached = cache.get(page);
    if (cached?.version === version) return cached.display;
    return this.call(EMPTY_DISPLAY, () => {
      const display = JSON.parse(read()) as PageDisplay;
      cache.set(page, { version, display });
      return display;
    });
  }

  // the versions of each page's body, and of its header and footer
  bodyVersions() {
    return this.call(new Uint32Array(), () => this.raw.bodyVersions());
  }

  bandVersions() {
    return this.call(new Uint32Array(), () => this.raw.bandVersions());
  }

  /**
   * glyph returns a glyph's outline, in font units with y up
   */
  glyph(font: number, id: number): Path2D {
    const key = font * 0x10000 + id;
    const cached = this.paths.get(key);
    if (cached) return cached;
    return this.call(new Path2D(), () => {
      const path = new Path2D(this.raw.glyphPath(font, id));
      this.paths.set(key, path);
      return path;
    });
  }

  unitsPerEm(font: number) {
    const cached = this.upems.get(font);
    if (cached !== undefined) return cached;
    return this.call(1000, () => {
      const upem = this.raw.unitsPerEm(font);
      this.upems.set(font, upem);
      return upem;
    });
  }

  bands(page: number): string[] {
    return this.call<string[]>(
      [],
      () => JSON.parse(this.raw.bands(page)) as string[],
    );
  }

  caret(pos: number, after = false) {
    return this.call(null, () => {
      const values = this.raw.caret(pos, after);
      if (values.length !== 4) return null;
      const [page, x, y, height] = values;
      return { page, x, y, width: 0, height };
    });
  }

  selection(from: number, to: number) {
    return this.call([], () => rectsOf(this.raw.selection(from, to)));
  }

  /**
   * boxes returns the boxes of the blocks from `from` to `to`, one for each
   * page they are on, in points
   */
  boxes(from: number, to: number): PageBox[] {
    return this.call([], () => rectsOf(this.raw.boxes(from, to)));
  }

  /**
   * tableGrid returns where the columns of the table at `pos` are, and each
   * of its rows placed on a page, in points, or null for no table there
   */
  tableGrid(pos: number): EngineTableGrid | null {
    return this.call(null, () => this.readTableGrid(pos));
  }

  private readTableGrid(pos: number): EngineTableGrid | null {
    const values = this.raw.tableGrid(pos);
    if (values.length === 0) return null;
    const count = values[0];
    const columns = Array.from(values.subarray(1, 1 + count));
    const rows: EngineTableGrid["rows"] = [];
    for (let index = 1 + count; index + 4 < values.length; index += 5) {
      rows.push({
        page: values[index],
        row: values[index + 1],
        y: values[index + 2],
        height: values[index + 3],
        repeat: values[index + 4] === 1,
      });
    }
    return { columns, rows };
  }

  /**
   * pageSpan returns the positions the blocks on a page start and end at
   */
  pageSpan(page: number) {
    return this.call(null, () => {
      const values = this.raw.pageSpan(page);
      return values.length === 2 ? { from: values[0], to: values[1] } : null;
    });
  }

  hit(page: number, x: number, y: number) {
    return this.call(null, () => toHit(this.raw.hit(page, x, y)));
  }

  word(page: number, x: number, y: number) {
    return this.call(null, () => {
      const values = this.raw.word(page, x, y);
      return values.length === 2 ? { from: values[0], to: values[1] } : null;
    });
  }

  /**
   * verticalAt returns where ↑ or ↓ moves the caret, from the line it's
   * painted on (see caret's `after`), and how to paint it there
   */
  verticalAt(
    pos: number,
    after: boolean,
    down: boolean,
    goal: number,
  ): Move | null {
    return this.call(null, () => {
      const values = this.raw.verticalAt(pos, after, down, goal);
      if (values.length !== 3) return null;
      return { node: values[0] === 1, pos: values[1], after: values[2] === 1 };
    });
  }

  /**
   * lineBoundary returns the start or end of the line the caret is painted
   * on, and how to paint the caret there
   */
  lineBoundary(pos: number, after: boolean, end: boolean) {
    return this.call(null, () => {
      const values = this.raw.lineBoundary(pos, after, end);
      return values.length === 2
        ? { pos: values[0], after: values[1] === 1 }
        : null;
    });
  }

  vertical(pos: number, down: boolean, goal: number) {
    return this.call(null, () => toHit(this.raw.vertical(pos, down, goal)));
  }

  lineEdge(pos: number, end: boolean) {
    return this.call(null, () => {
      const edge = this.raw.lineEdge(pos, end);
      return edge < 0 ? null : edge;
    });
  }
}

// the fonts' files, for further engines, e.g. the PDF export's
let fontFiles: Uint8Array[] | null = null;

/**
 * createEngine makes an engine with fonts, once the wasm is loaded
 * @param strict throws when a call fails, see PageEngine
 */
export const createEngine = (fonts: Uint8Array[], strict = false) => {
  const { bytes, lengths } = packFonts(fonts);
  const engine = new PageEngine(new LayoutEngine(bytes, lengths), strict);
  engine.addFonts(fallbackFonts.value);
  return engine;
};

/**
 * loadEngineSync loads the wasm and the fonts from their bytes, e.g. in tests
 */
export const loadEngineSync = (wasm: Uint8Array, fonts: Uint8Array[]) => {
  initSync({ module: wasm as Uint8Array<ArrayBuffer> });
  fontFiles = fonts;
  return createEngine(fonts);
};

let loading: Promise<Uint8Array[]> | null = null;

/**
 * loadEngine loads the wasm and the fonts, once, and makes an engine
 */
export const loadEngine = async () => createEngine(await loadFiles());

// loads the wasm and the fonts, once
const loadFiles = () =>
  (loading ??= (async () => {
    const [, ...fonts] = await Promise.all([
      init({ module_or_path: wasmUrl }).then(() => bootMark("wasm")),
      ...FONT_URLS.map(
        async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer()),
      ),
    ]);
    bootMark("fonts");
    fontFiles = fonts as Uint8Array[];
    return fontFiles;
  })());

/**
 * newEngine makes another engine, e.g. the PDF export's: one sharing the
 * page view's fonts (its files and every fallback added to it), or else
 * with the fonts already loaded, or loads them
 * @param strict throws when a call fails, see PageEngine
 */
export const newEngine = async (strict = false) => {
  // the page view's fonts, shared in the wasm, not copied into it again
  const shared = pageEngine && !pageEngine.broken ? pageEngine : null;
  if (shared) return shared.sharing(strict);
  return createEngine(fontFiles ?? (await loadFiles()), strict);
};

/**
 * baseFonts returns Blank's own font files, as the engines got them
 */
export const baseFonts = async () =>
  fontFiles ??
  Promise.all(
    FONT_URLS.map(
      async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer()),
    ),
  );

// the engine of the page view, see bootEngine
export let pageEngine: PageEngine | null = null;

// the same, for what waits for it to load, e.g. the editor's pageSync
export const pageEngineReady = shallowRef<PageEngine | null>(null);

/**
 * bootEngine loads the page view's engine. It starts first and loads while
 * the rest boots; the editor lays out its document once it's there.
 */
export const bootEngine = async () => {
  if (switchedOff()) {
    useFallbackEditor("off");
    bootMark("engine off");
    return null;
  }
  setPageEngine(await loadEngine());
  return pageEngine;
};

/**
 * switchedOff tells whether the user switched the engine off, with
 * `localStorage.setItem("blank.engine", "off")` in the webview's console,
 * e.g. to use Blank as a plain editor if the engine misbehaves
 */
const switchedOff = () => {
  try {
    return localStorage.getItem("blank.engine") === "off";
  } catch {
    return false;
  }
};

/**
 * exposeEngineHooks lets E2E tests break the page view's engine, through
 * `window.blankBreakEngine()`: its next call fails, as if the wasm trapped
 */
export const exposeEngineHooks = () => {
  Object.assign(window, {
    blankBreakEngine: () => pageEngine?.breakForTest(),
  });
};

/**
 * setPageEngine sets the page view's engine, e.g. in tests
 */
export const setPageEngine = (engine: PageEngine | null) => {
  pageEngine = engine;
  pageEngineReady.value = engine;
};
