/* tslint:disable */
/* eslint-disable */

export class LayoutEngine {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * adds a font for what the others lack, e.g. a system font for Chinese,
     * as the last fallback of `family`, and lays out again
     */
    addFont(bytes: Uint8Array, family: string): void;
    addImage(src: string, bytes: Uint8Array, jpeg: boolean): void;
    /**
     * the size, distance from the edge and line of the headers and footers,
     * which the page view repeats; for tests
     */
    bandMetrics(): Float32Array;
    /**
     * each page's header and footer change with its band version
     */
    bandVersions(): Uint32Array;
    /**
     * the text of a page's header and footer slots: left, center and right
     * of the header, then of the footer
     */
    bands(page: number): string;
    /**
     * each page's body, without its header and footer, changes with its
     * body version
     */
    bodyVersions(): Uint32Array;
    /**
     * where the text of each page ends, from its top edge
     */
    bottoms(): Float32Array;
    /**
     * the boxes of the blocks from `from` to `to`, one per page: page, x,
     * y, width and height each
     */
    boxes(from: number, to: number): Float32Array;
    /**
     * the names of Blank's font files, in the order the webview loads
     * them; for tests
     */
    bundledFontFiles(): string[];
    /**
     * page, x, y and height of the caret at a position, or nothing
     */
    caret(pos: number, after: boolean): Float32Array;
    /**
     * how many font files the engine has, each once, in the order they
     * came: the ones it was made with, then the ones `addFont` added
     */
    fontFileCount(): number;
    /**
     * the family a font file was added for with `addFont`, or "" for the
     * ones the engine was made with (and for none)
     */
    fontFileFamily(index: number): string;
    /**
     * a font file's bytes, e.g. to make the same engine in a worker; empty
     * for none
     */
    fontFile(index: number): Uint8Array;
    /**
     * a glyph's outline as an SVG path, in font units with y up
     */
    glyphPath(font: number, glyph: number): string;
    /**
     * what a point of a page hits: [0, pos] for text, [1, pos] for a node
     */
    hit(page: number, x: number, y: number): Float64Array;
    /**
     * the start or end of the line the caret at `pos` is painted on (as
     * `after` says): [pos, after], where `after` is 1 if the caret there is
     * to be painted at the end of its line, e.g. after a word broken where
     * it is wider than the line; [] for none
     */
    lineBoundary(pos: number, after: boolean, end: boolean): Float64Array;
    /**
     * the start or end of the line a position is on, -1 for none; see
     * `lineBoundary`, which also tells how to paint the caret there
     */
    lineEdge(pos: number, end: boolean): number;
    /**
     * the characters of the document no font has a glyph for
     */
    missing(): string;
    /**
     * the fonts' files one after the other, with their lengths; throws if
     * the lengths reach past the bytes
     */
    constructor(bytes: Uint8Array, lengths: Uint32Array);
    /**
     * only a page's header and footer, as `page` gives them
     */
    pageBands(page: number): string;
    /**
     * what a page shows besides its header and footer, as `page` gives it
     */
    pageBody(page: number): string;
    pageCount(): number;
    /**
     * the positions the blocks on a page start and end at, or nothing
     */
    pageSpan(page: number): Uint32Array;
    /**
     * what a page shows: rectangles, images, links and glyph runs, of its
     * body and its header and footer. Deprecated: `pageBody` and
     * `pageBands` give them apart, with their own versions
     */
    page(page: number): string;
    /**
     * what went wrong in the last PDF, as JSON: `[{"kind": "image", "src":
     * …}, {"kind": "font", "font": index, "family": …}, {"kind": "pdfa",
     * "reason": …}]`, empty for nothing
     */
    pdfWarnings(): string;
    /**
     * the document as a PDF/A-2u, in `language` (a BCP 47 tag such as
     * "de-CH", none if left out or empty), made at `date` (ISO 8601 with
     * its offset, such as "2026-10-01T09:30:00+02:00"; PDF/A needs it). An
     * image that can't be decoded shows its alt text, a font that can't be
     * embedded is left out, and a document that can't be PDF/A-2u is a
     * normal PDF: see `pdfWarnings`
     */
    pdf(title: string, author: string, language?: string | null, date?: string | null): Uint8Array;
    /**
     * the colour of a role on paper, as 0xRRGGBB; for tests
     */
    roleColor(role: number): number | undefined;
    /**
     * the selection's rectangles: page, x, y, width and height each
     */
    selection(from: number, to: number): Float32Array;
    /**
     * replaces all items; the pages that changed, as `update` gives them
     */
    setItems(json: string): Uint32Array;
    /**
     * sets the page; the pages that changed, as `update` gives them
     */
    setSettings(json: string): Uint32Array;
    /**
     * how much the last change laid out: items, the page it paginated
     * from, and the page it settled at (-1 for none); for tests
     */
    stats(): Int32Array;
    /**
     * the table at `pos` as laid out: the number of columns' edges, the
     * edges, then page, row, y, height and repeat (0 or 1) for each row
     * placed on a page; nothing for no table
     */
    tableGrid(pos: number): Float32Array;
    /**
     * the styles text is set in, which the Word styles repeat: for each of
     * p, h1 to h6, code and caption its size, its line height as a factor of
     * the font's natural one, weight, slant (1 for italic), tracking and
     * whether it is monospaced; for tests
     */
    textStyles(): Float32Array;
    /**
     * the page numbers of the entries of the table of contents at `pos`,
     * as JSON (an array of strings, "" for an entry whose heading isn't
     * there), or "null" for none
     */
    tocNumbers(pos: number): string;
    unitsPerEm(font: number): number;
    /**
     * several updates at once, `[[start, delete, items, shift], …]` in
     * document order, each counting the items as the ones before it left
     * them; the pages that changed, as `update` gives them
     */
    updateMany(json: string): Uint32Array;
    /**
     * replaces `delete` items from `start` with the items in `json`, and
     * moves the ones after them by `shift`; the pages that changed: the
     * body's from and to (exclusive), then the bands', from == to for none
     */
    update(start: number, _delete: number, json: string, shift: number): Uint32Array;
    /**
     * what each page shows changes with its version
     */
    versions(): Uint32Array;
    /**
     * the position a line up or down from the caret at `pos`, painted as
     * `after` says (see `caret`), nearest to `goal`: [0, pos, after] for
     * text, [1, pos, 0] for a node, [] for none. The `after` it gives is 1
     * where the caret at the new position is to be painted at the end of
     * its line, 0 else
     */
    verticalAt(pos: number, after: boolean, down: boolean, goal: number): Float64Array;
    /**
     * the position a line up or down from `pos`, nearest to `goal`: [0,
     * pos] for text, [1, pos] for a node, [] for none; see `verticalAt`,
     * which also tells how to paint the caret there
     */
    vertical(pos: number, down: boolean, goal: number): Float64Array;
    /**
     * an engine with the fonts of `other`, fallbacks added with `addFont`
     * included, without copying their files, e.g. for an export; it has
     * its own page, items and images
     */
    static withFontsOf(other: LayoutEngine): LayoutEngine;
    word(page: number, x: number, y: number): Uint32Array;
    /**
     * the words as laid out, for checking the PDF against the layout; for
     * tests
     */
    words(): string;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_layoutengine_free: (a: number, b: number) => void;
    readonly layoutengine_addFont: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly layoutengine_addImage: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly layoutengine_bandMetrics: (a: number) => [number, number];
    readonly layoutengine_bandVersions: (a: number) => [number, number];
    readonly layoutengine_bands: (a: number, b: number) => [number, number];
    readonly layoutengine_bodyVersions: (a: number) => [number, number];
    readonly layoutengine_bottoms: (a: number) => [number, number];
    readonly layoutengine_boxes: (a: number, b: number, c: number) => [number, number];
    readonly layoutengine_bundledFontFiles: (a: number) => [number, number];
    readonly layoutengine_caret: (a: number, b: number, c: number) => [number, number];
    readonly layoutengine_fontFile: (a: number, b: number) => [number, number];
    readonly layoutengine_fontFileCount: (a: number) => number;
    readonly layoutengine_fontFileFamily: (a: number, b: number) => [number, number];
    readonly layoutengine_glyphPath: (a: number, b: number, c: number) => [number, number];
    readonly layoutengine_hit: (a: number, b: number, c: number, d: number) => [number, number];
    readonly layoutengine_lineBoundary: (a: number, b: number, c: number, d: number) => [number, number];
    readonly layoutengine_lineEdge: (a: number, b: number, c: number) => number;
    readonly layoutengine_missing: (a: number) => [number, number];
    readonly layoutengine_new: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly layoutengine_page: (a: number, b: number) => [number, number];
    readonly layoutengine_pageBands: (a: number, b: number) => [number, number];
    readonly layoutengine_pageBody: (a: number, b: number) => [number, number];
    readonly layoutengine_pageCount: (a: number) => number;
    readonly layoutengine_pageSpan: (a: number, b: number) => [number, number];
    readonly layoutengine_pdf: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number, number];
    readonly layoutengine_pdfWarnings: (a: number) => [number, number];
    readonly layoutengine_roleColor: (a: number, b: number) => number;
    readonly layoutengine_selection: (a: number, b: number, c: number) => [number, number];
    readonly layoutengine_setItems: (a: number, b: number, c: number) => [number, number, number, number];
    readonly layoutengine_setSettings: (a: number, b: number, c: number) => [number, number, number, number];
    readonly layoutengine_stats: (a: number) => [number, number];
    readonly layoutengine_tableGrid: (a: number, b: number) => [number, number];
    readonly layoutengine_textStyles: (a: number) => [number, number];
    readonly layoutengine_tocNumbers: (a: number, b: number) => [number, number];
    readonly layoutengine_unitsPerEm: (a: number, b: number) => number;
    readonly layoutengine_update: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly layoutengine_updateMany: (a: number, b: number, c: number) => [number, number, number, number];
    readonly layoutengine_versions: (a: number) => [number, number];
    readonly layoutengine_vertical: (a: number, b: number, c: number, d: number) => [number, number];
    readonly layoutengine_verticalAt: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly layoutengine_withFontsOf: (a: number) => number;
    readonly layoutengine_word: (a: number, b: number, c: number, d: number) => [number, number];
    readonly layoutengine_words: (a: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_drop_slice: (a: number, b: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
