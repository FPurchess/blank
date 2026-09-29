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
     * the text of a page's header and footer slots: left, center and right
     * of the header, then of the footer
     */
    bands(page: number): string;
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
     * page, x, y and height of the caret at a position, or nothing
     */
    caret(pos: number, after: boolean): Float32Array;
    clearImages(): void;
    /**
     * a glyph's outline as an SVG path, in font units with y up
     */
    glyphPath(font: number, glyph: number): string;
    /**
     * what a point of a page hits: [0, pos] for text, [1, pos] for a node
     */
    hit(page: number, x: number, y: number): Float64Array;
    /**
     * the start or end of the line a position is on, -1 for none
     */
    lineEdge(pos: number, end: boolean): number;
    /**
     * the characters of the document no font has a glyph for
     */
    missing(): string;
    /**
     * the fonts' files one after the other, with their lengths
     */
    constructor(bytes: Uint8Array, lengths: Uint32Array);
    pageCount(): number;
    /**
     * the positions the blocks on a page start and end at, or nothing
     */
    pageSpan(page: number): Uint32Array;
    /**
     * what a page shows: rectangles, images, links and glyph runs
     */
    page(page: number): string;
    /**
     * the document as a PDF
     */
    pdf(title: string, author: string): Uint8Array;
    /**
     * the selection's rectangles: page, x, y, width and height each
     */
    selection(from: number, to: number): Float32Array;
    setItems(json: string): void;
    setSettings(json: string): void;
    /**
     * how much the last change laid out: items, the page it paginated
     * from, and the page it settled at (-1 for none)
     */
    stats(): Int32Array;
    /**
     * the table at `pos` as laid out: the number of columns' edges, the
     * edges, then page, row, y, height and repeat (0 or 1) for each row
     * placed on a page; nothing for no table
     */
    tableGrid(pos: number): Float32Array;
    unitsPerEm(font: number): number;
    update(start: number, _delete: number, json: string, shift: number): void;
    /**
     * what each page shows changes with its version
     */
    versions(): Uint32Array;
    vertical(pos: number, down: boolean, goal: number): Float64Array;
    word(page: number, x: number, y: number): Uint32Array;
    /**
     * the words as laid out, for checking the PDF against the layout
     */
    words(): string;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_layoutengine_free: (a: number, b: number) => void;
    readonly layoutengine_addFont: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly layoutengine_addImage: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly layoutengine_bands: (a: number, b: number) => [number, number];
    readonly layoutengine_bottoms: (a: number) => [number, number];
    readonly layoutengine_boxes: (a: number, b: number, c: number) => [number, number];
    readonly layoutengine_caret: (a: number, b: number, c: number) => [number, number];
    readonly layoutengine_clearImages: (a: number) => void;
    readonly layoutengine_glyphPath: (a: number, b: number, c: number) => [number, number];
    readonly layoutengine_hit: (a: number, b: number, c: number, d: number) => [number, number];
    readonly layoutengine_lineEdge: (a: number, b: number, c: number) => number;
    readonly layoutengine_missing: (a: number) => [number, number];
    readonly layoutengine_new: (a: number, b: number, c: number, d: number) => number;
    readonly layoutengine_page: (a: number, b: number) => [number, number];
    readonly layoutengine_pageCount: (a: number) => number;
    readonly layoutengine_pageSpan: (a: number, b: number) => [number, number];
    readonly layoutengine_pdf: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly layoutengine_selection: (a: number, b: number, c: number) => [number, number];
    readonly layoutengine_setItems: (a: number, b: number, c: number) => [number, number];
    readonly layoutengine_setSettings: (a: number, b: number, c: number) => [number, number];
    readonly layoutengine_stats: (a: number) => [number, number];
    readonly layoutengine_tableGrid: (a: number, b: number) => [number, number];
    readonly layoutengine_unitsPerEm: (a: number, b: number) => number;
    readonly layoutengine_update: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly layoutengine_versions: (a: number) => [number, number];
    readonly layoutengine_vertical: (a: number, b: number, c: number, d: number) => [number, number];
    readonly layoutengine_word: (a: number, b: number, c: number, d: number) => [number, number];
    readonly layoutengine_words: (a: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
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
