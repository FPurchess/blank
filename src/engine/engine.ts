import type { Node } from "prosemirror-model";

import type { DocumentFields } from "../layout/bands";
import { type Layout, pageGeometry } from "../layout/resolve";
import { diff, flatten, type FlatRecord, type ImageSizes } from "./flatten";
import { FONT_URLS } from "./fonts";
import init, { initSync, LayoutEngine } from "./wasm/blank_layout.js";
import wasmUrl from "./wasm/blank_layout_bg.wasm?url";

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

/**
 * PageEngine keeps the engine in step with a document: only what changed
 * is handed to it
 */
export class PageEngine {
  private records: FlatRecord[] = [];
  private doc: Node | null = null;
  private settings = "";
  private displays = new Map<
    number,
    { version: number; display: PageDisplay }
  >();
  private paths = new Map<number, Path2D>();
  private upems = new Map<number, number>();

  constructor(readonly raw: LayoutEngine) {}

  /**
   * setSettings sets the page, and lays out again if it changed
   * @returns whether it changed
   */
  setSettings(layout: Layout, fields: DocumentFields) {
    const json = JSON.stringify(settingsOf(layout, fields));
    if (json === this.settings) return false;
    this.settings = json;
    this.raw.setSettings(json);
    return true;
  }

  /**
   * sync hands the engine what changed in the document since the last sync
   * @param sizes the sizes of the loaded images, in points
   * @param force flattens again even for the same document, e.g. once an
   *   image's size is known
   * @returns whether anything changed
   */
  sync(doc: Node, sizes: ImageSizes, force = false) {
    if (doc === this.doc && !force) return false;
    const records = flatten(doc, sizes);
    if (this.doc === null) {
      this.raw.setItems(
        JSON.stringify(records.map((record) => record.build())),
      );
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

  pages() {
    return this.raw.pageCount();
  }

  /**
   * display returns what a page shows, read again only when it changed
   */
  display(page: number, version: number): PageDisplay {
    const cached = this.displays.get(page);
    if (cached?.version === version) return cached.display;
    const display = JSON.parse(this.raw.page(page)) as PageDisplay;
    this.displays.set(page, { version, display });
    return display;
  }

  /**
   * glyph returns a glyph's outline, in font units with y up
   */
  glyph(font: number, id: number): Path2D {
    const key = font * 0x10000 + id;
    let path = this.paths.get(key);
    if (!path) {
      path = new Path2D(this.raw.glyphPath(font, id));
      this.paths.set(key, path);
    }
    return path;
  }

  unitsPerEm(font: number) {
    let upem = this.upems.get(font);
    if (upem === undefined) {
      upem = this.raw.unitsPerEm(font);
      this.upems.set(font, upem);
    }
    return upem;
  }

  bands(page: number): string[] {
    return JSON.parse(this.raw.bands(page)) as string[];
  }

  caret(pos: number, after = false) {
    const values = this.raw.caret(pos, after);
    if (values.length !== 4) return null;
    const [page, x, y, height] = values;
    return { page, x, y, width: 0, height };
  }

  selection(from: number, to: number) {
    return rectsOf(this.raw.selection(from, to));
  }

  /**
   * boxes returns the boxes of the blocks from `from` to `to`, one for each
   * page they are on, in points
   */
  boxes(from: number, to: number): PageBox[] {
    return rectsOf(this.raw.boxes(from, to));
  }

  /**
   * tableGrid returns where the columns of the table at `pos` are, and each
   * of its rows placed on a page, in points, or null for no table there
   */
  tableGrid(pos: number): EngineTableGrid | null {
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
    const values = this.raw.pageSpan(page);
    return values.length === 2 ? { from: values[0], to: values[1] } : null;
  }

  hit(page: number, x: number, y: number) {
    return toHit(this.raw.hit(page, x, y));
  }

  word(page: number, x: number, y: number) {
    const values = this.raw.word(page, x, y);
    return values.length === 2 ? { from: values[0], to: values[1] } : null;
  }

  vertical(pos: number, down: boolean, goal: number) {
    return toHit(this.raw.vertical(pos, down, goal));
  }

  lineEdge(pos: number, end: boolean) {
    const edge = this.raw.lineEdge(pos, end);
    return edge < 0 ? null : edge;
  }
}

// the fonts' files, for further engines, e.g. the PDF export's
let fontFiles: Uint8Array[] | null = null;

/**
 * createEngine makes an engine with fonts, once the wasm is loaded
 */
export const createEngine = (fonts: Uint8Array[]) => {
  const lengths = new Uint32Array(fonts.map((font) => font.length));
  const bytes = new Uint8Array(
    lengths.reduce((sum, length) => sum + length, 0),
  );
  let offset = 0;
  for (const font of fonts) {
    bytes.set(font, offset);
    offset += font.length;
  }
  return new PageEngine(new LayoutEngine(bytes, lengths));
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
export const loadEngine = async () => {
  loading ??= (async () => {
    const [, ...fonts] = await Promise.all([
      init({ module_or_path: wasmUrl }),
      ...FONT_URLS.map(
        async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer()),
      ),
    ]);
    fontFiles = fonts as Uint8Array[];
    return fontFiles;
  })();
  return createEngine(await loading);
};

/**
 * newEngine makes another engine with the fonts already loaded, or loads them
 */
export const newEngine = async () =>
  fontFiles ? createEngine(fontFiles) : loadEngine();

// the engine of the page view, see bootEngine
export let pageEngine: PageEngine | null = null;

/**
 * bootEngine loads the page view's engine before the editor starts, which
 * lays out its first document with it
 */
export const bootEngine = async () => {
  pageEngine = await loadEngine();
  return pageEngine;
};

/**
 * setPageEngine sets the page view's engine, e.g. in tests
 */
export const setPageEngine = (engine: PageEngine | null) => {
  pageEngine = engine;
};
