import { sendNotification } from "@tauri-apps/plugin-notification";
import type { Node } from "prosemirror-model";
import { shallowRef } from "vue";

import type { DocumentFields } from "../layout/bands";
import { type Layout, pageGeometry } from "../layout/resolve";
import {
  diff,
  flatten,
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

// The layout engine (src-tauri/layout, built for the webview by
// scripts/build-engine.sh) and what it needs: its fonts, the document as
// flattened items, and the page. One layout is what the page view paints and
// what the PDF holds.

// a hit of a point or a movement: a caret position, or a node to select
export interface Hit {
  node: boolean;
  pos: number;
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
  private doc: Node | null = null;
  private settings = "";
  private frozen = "";
  private displays = new Map<
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
    if (added) this.displays.clear();
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
   * sync hands the engine what changed in the document since the last sync
   * @param sizes the sizes of the loaded images, in points
   * @param force flattens again even for the same document, e.g. once an
   *   image's size is known
   * @returns whether anything changed
   */
  sync(
    doc: Node,
    sizes: ImageSizes,
    force = false,
    frozen: FrozenWidths | null = null,
    progressive = false,
  ) {
    return this.call(false, () =>
      this.syncNow(doc, sizes, force, frozen, progressive),
    );
  }

  private syncNow(
    doc: Node,
    sizes: ImageSizes,
    force: boolean,
    frozen: FrozenWidths | null,
    progressive: boolean,
  ) {
    const frozenKey = frozen ? `${frozen.pos}:${frozen.widths.join(" ")}` : "";
    if (doc === this.doc && !force && frozenKey === this.frozen) return false;
    this.frozen = frozenKey;
    // what is still to lay out goes first, so the engine has all of it
    this.finish();
    const records = flatten(doc, sizes, frozen);
    if (this.doc === null) {
      const first = progressive ? records.slice(0, FIRST_ITEMS) : records;
      this.raw.setItems(JSON.stringify(first.map((record) => record.build())));
      if (first.length < records.length) {
        this.pending = { records, next: first.length };
        this.later();
      }
    } else {
      const shift = doc.content.size - this.doc.content.size;
      const change = diff(this.records, records, shift);
      if (
        change.delete > 0 ||
        change.records.length > 0 ||
        change.shift !== 0
      ) {
        this.raw.update(
          change.start,
          change.delete,
          JSON.stringify(change.records.map((record) => record.build())),
          change.shift,
        );
      }
    }
    this.records = records;
    this.doc = doc;
    return true;
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
 * newEngine makes another engine with the fonts already loaded, or loads them
 * @param strict throws when a call fails, see PageEngine
 */
export const newEngine = async (strict = false) =>
  createEngine(fontFiles ?? (await loadFiles()), strict);

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
 * setPageEngine sets the page view's engine, e.g. in tests
 */
export const setPageEngine = (engine: PageEngine | null) => {
  pageEngine = engine;
  pageEngineReady.value = engine;
};
