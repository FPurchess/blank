/* @ts-self-types="./blank_layout.d.ts" */

export class LayoutEngine {
    static __wrap(ptr) {
        const obj = Object.create(LayoutEngine.prototype);
        obj.__wbg_ptr = ptr;
        LayoutEngineFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        LayoutEngineFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_layoutengine_free(ptr, 0);
    }
    /**
     * adds a font for what the others lack, e.g. a system font for Chinese,
     * as the last fallback of `family`, and lays out again
     * @param {Uint8Array} bytes
     * @param {string} family
     */
    addFont(bytes, family) {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(family, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        wasm.layoutengine_addFont(this.__wbg_ptr, ptr0, len0, ptr1, len1);
    }
    /**
     * @param {string} src
     * @param {Uint8Array} bytes
     * @param {boolean} jpeg
     */
    addImage(src, bytes, jpeg) {
        const ptr0 = passStringToWasm0(src, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        wasm.layoutengine_addImage(this.__wbg_ptr, ptr0, len0, ptr1, len1, jpeg);
    }
    /**
     * the size, distance from the edge and line of the headers and footers,
     * which the page view repeats; for tests
     * @returns {Float32Array}
     */
    bandMetrics() {
        const ret = wasm.layoutengine_bandMetrics(this.__wbg_ptr);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * each page's header and footer change with its band version
     * @returns {Uint32Array}
     */
    bandVersions() {
        const ret = wasm.layoutengine_bandVersions(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * the text of a page's header and footer slots: left, center and right
     * of the header, then of the footer
     * @param {number} page
     * @returns {string}
     */
    bands(page) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.layoutengine_bands(this.__wbg_ptr, page);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * each page's body, without its header and footer, changes with its
     * body version
     * @returns {Uint32Array}
     */
    bodyVersions() {
        const ret = wasm.layoutengine_bodyVersions(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * where the text of each page ends, from its top edge
     * @returns {Float32Array}
     */
    bottoms() {
        const ret = wasm.layoutengine_bottoms(this.__wbg_ptr);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * the boxes of the blocks from `from` to `to`, one per page: page, x,
     * y, width and height each
     * @param {number} from
     * @param {number} to
     * @returns {Float32Array}
     */
    boxes(from, to) {
        const ret = wasm.layoutengine_boxes(this.__wbg_ptr, from, to);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * the names of Blank's font files, in the order the webview loads
     * them; for tests
     * @returns {string[]}
     */
    bundledFontFiles() {
        const ret = wasm.layoutengine_bundledFontFiles(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]);
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * page, x, y and height of the caret at a position, or nothing
     * @param {number} pos
     * @param {boolean} after
     * @returns {Float32Array}
     */
    caret(pos, after) {
        const ret = wasm.layoutengine_caret(this.__wbg_ptr, pos, after);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * how many font files the engine has, each once, in the order they
     * came: the ones it was made with, then the ones `addFont` added
     * @returns {number}
     */
    fontFileCount() {
        const ret = wasm.layoutengine_fontFileCount(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * the family a font file was added for with `addFont`, or "" for the
     * ones the engine was made with (and for none)
     * @param {number} index
     * @returns {string}
     */
    fontFileFamily(index) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.layoutengine_fontFileFamily(this.__wbg_ptr, index);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * a font file's bytes, e.g. to make the same engine in a worker; empty
     * for none
     * @param {number} index
     * @returns {Uint8Array}
     */
    fontFile(index) {
        const ret = wasm.layoutengine_fontFile(this.__wbg_ptr, index);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * a glyph's outline as an SVG path, in font units with y up
     * @param {number} font
     * @param {number} glyph
     * @returns {string}
     */
    glyphPath(font, glyph) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.layoutengine_glyphPath(this.__wbg_ptr, font, glyph);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * what a point of a page hits: [0, pos] for text, [1, pos] for a node
     * @param {number} page
     * @param {number} x
     * @param {number} y
     * @returns {Float64Array}
     */
    hit(page, x, y) {
        const ret = wasm.layoutengine_hit(this.__wbg_ptr, page, x, y);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * the start or end of the line the caret at `pos` is painted on (as
     * `after` says): [pos, after], where `after` is 1 if the caret there is
     * to be painted at the end of its line, e.g. after a word broken where
     * it is wider than the line; [] for none
     * @param {number} pos
     * @param {boolean} after
     * @param {boolean} end
     * @returns {Float64Array}
     */
    lineBoundary(pos, after, end) {
        const ret = wasm.layoutengine_lineBoundary(this.__wbg_ptr, pos, after, end);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * the start or end of the line a position is on, -1 for none; see
     * `lineBoundary`, which also tells how to paint the caret there
     * @param {number} pos
     * @param {boolean} end
     * @returns {number}
     */
    lineEdge(pos, end) {
        const ret = wasm.layoutengine_lineEdge(this.__wbg_ptr, pos, end);
        return ret;
    }
    /**
     * the characters of the document no font has a glyph for
     * @returns {string}
     */
    missing() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.layoutengine_missing(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * the fonts' files one after the other, with their lengths; throws if
     * the lengths reach past the bytes
     * @param {Uint8Array} bytes
     * @param {Uint32Array} lengths
     */
    constructor(bytes, lengths) {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray32ToWasm0(lengths, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.layoutengine_new(ptr0, len0, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        LayoutEngineFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * only a page's header and footer, as `page` gives them
     * @param {number} page
     * @returns {string}
     */
    pageBands(page) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.layoutengine_pageBands(this.__wbg_ptr, page);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * what a page shows besides its header and footer, as `page` gives it
     * @param {number} page
     * @returns {string}
     */
    pageBody(page) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.layoutengine_pageBody(this.__wbg_ptr, page);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {number}
     */
    pageCount() {
        const ret = wasm.layoutengine_pageCount(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * the positions the blocks on a page start and end at, or nothing
     * @param {number} page
     * @returns {Uint32Array}
     */
    pageSpan(page) {
        const ret = wasm.layoutengine_pageSpan(this.__wbg_ptr, page);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * what a page shows: rectangles, images, links and glyph runs, of its
     * body and its header and footer. Deprecated: `pageBody` and
     * `pageBands` give them apart, with their own versions
     * @param {number} page
     * @returns {string}
     */
    page(page) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.layoutengine_page(this.__wbg_ptr, page);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * what went wrong in the last PDF, as JSON: `[{"kind": "image", "src":
     * …}, {"kind": "font", "font": index, "family": …}, {"kind": "pdfa",
     * "reason": …}]`, empty for nothing
     * @returns {string}
     */
    pdfWarnings() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.layoutengine_pdfWarnings(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * the document as a PDF/A-2u, in `language` (a BCP 47 tag such as
     * "de-CH", none if left out or empty), made at `date` (ISO 8601 with
     * its offset, such as "2026-10-01T09:30:00+02:00"; PDF/A needs it), of
     * all its pages or of `pages` (their indexes, ascending). An image that
     * can't be decoded shows its alt text, a font that can't be embedded is
     * left out, and a document that can't be PDF/A-2u is a normal PDF: see
     * `pdfWarnings`
     * @param {string} title
     * @param {string} author
     * @param {string | null} [language]
     * @param {string | null} [date]
     * @param {Uint32Array | null} [pages]
     * @returns {Uint8Array}
     */
    pdf(title, author, language, date, pages) {
        const ptr0 = passStringToWasm0(title, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(author, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        var ptr2 = isLikeNone(language) ? 0 : passStringToWasm0(language, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len2 = WASM_VECTOR_LEN;
        var ptr3 = isLikeNone(date) ? 0 : passStringToWasm0(date, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len3 = WASM_VECTOR_LEN;
        var ptr4 = isLikeNone(pages) ? 0 : passArray32ToWasm0(pages, wasm.__wbindgen_malloc);
        var len4 = WASM_VECTOR_LEN;
        const ret = wasm.layoutengine_pdf(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v6 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v6;
    }
    /**
     * what a page prints, its body and its header and footer, as `page`
     * gives them: without the hints only the screen shows, for the print
     * preview
     * @param {number} page
     * @returns {string}
     */
    printDisplay(page) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.layoutengine_printDisplay(this.__wbg_ptr, page);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * sheets to print as a PDF, titled `title`: `sheets` is JSON, a list of
     * `{width, height, placements: [{page, x, y, scale}]}` in points, see
     * PrintSheet. Untagged and without bookmarks or links; what went wrong
     * is in `pdfWarnings`, as for `pdf`
     * @param {string} sheets
     * @param {string} title
     * @returns {Uint8Array}
     */
    printPdf(sheets, title) {
        const ptr0 = passStringToWasm0(sheets, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(title, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.layoutengine_printPdf(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v3;
    }
    /**
     * the colour of a role on paper, as 0xRRGGBB; for tests
     * @param {number} role
     * @returns {number | undefined}
     */
    roleColor(role) {
        const ret = wasm.layoutengine_roleColor(this.__wbg_ptr, role);
        return ret === Number.MAX_SAFE_INTEGER ? undefined : ret;
    }
    /**
     * the selection's rectangles: page, x, y, width and height each
     * @param {number} from
     * @param {number} to
     * @returns {Float32Array}
     */
    selection(from, to) {
        const ret = wasm.layoutengine_selection(this.__wbg_ptr, from, to);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * replaces all items; the pages that changed, as `update` gives them
     * @param {string} json
     * @returns {Uint32Array}
     */
    setItems(json) {
        const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.layoutengine_setItems(this.__wbg_ptr, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v2;
    }
    /**
     * sets the page; the pages that changed, as `update` gives them
     * @param {string} json
     * @returns {Uint32Array}
     */
    setSettings(json) {
        const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.layoutengine_setSettings(this.__wbg_ptr, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v2;
    }
    /**
     * how much the last change laid out: items, the page it paginated
     * from, and the page it settled at (-1 for none); for tests
     * @returns {Int32Array}
     */
    stats() {
        const ret = wasm.layoutengine_stats(this.__wbg_ptr);
        var v1 = getArrayI32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * the table at `pos` as laid out: the number of columns' edges, the
     * edges, then page, row, y, height and repeat (0 or 1) for each row
     * placed on a page; nothing for no table
     * @param {number} pos
     * @returns {Float32Array}
     */
    tableGrid(pos) {
        const ret = wasm.layoutengine_tableGrid(this.__wbg_ptr, pos);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * the styles text is set in, which the Word styles repeat: for each of
     * p, h1 to h6, code and caption its size, its line height as a factor of
     * the font's natural one, weight, slant (1 for italic), tracking and
     * whether it is monospaced; for tests
     * @returns {Float32Array}
     */
    textStyles() {
        const ret = wasm.layoutengine_textStyles(this.__wbg_ptr);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * the page numbers of the entries of the table of contents at `pos`,
     * as JSON (an array of strings, "" for an entry whose heading isn't
     * there), or "null" for none
     * @param {number} pos
     * @returns {string}
     */
    tocNumbers(pos) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.layoutengine_tocNumbers(this.__wbg_ptr, pos);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} font
     * @returns {number}
     */
    unitsPerEm(font) {
        const ret = wasm.layoutengine_unitsPerEm(this.__wbg_ptr, font);
        return ret;
    }
    /**
     * several updates at once, `[[start, delete, items, shift], …]` in
     * document order, each counting the items as the ones before it left
     * them; the pages that changed, as `update` gives them
     * @param {string} json
     * @returns {Uint32Array}
     */
    updateMany(json) {
        const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.layoutengine_updateMany(this.__wbg_ptr, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v2;
    }
    /**
     * replaces `delete` items from `start` with the items in `json`, and
     * moves the ones after them by `shift`; the pages that changed: the
     * body's from and to (exclusive), then the bands', from == to for none
     * @param {number} start
     * @param {number} _delete
     * @param {string} json
     * @param {number} shift
     * @returns {Uint32Array}
     */
    update(start, _delete, json, shift) {
        const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.layoutengine_update(this.__wbg_ptr, start, _delete, ptr0, len0, shift);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v2;
    }
    /**
     * what each page shows changes with its version
     * @returns {Uint32Array}
     */
    versions() {
        const ret = wasm.layoutengine_versions(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * the position a line up or down from the caret at `pos`, painted as
     * `after` says (see `caret`), nearest to `goal`: [0, pos, after] for
     * text, [1, pos, 0] for a node, [] for none. The `after` it gives is 1
     * where the caret at the new position is to be painted at the end of
     * its line, 0 else
     * @param {number} pos
     * @param {boolean} after
     * @param {boolean} down
     * @param {number} goal
     * @returns {Float64Array}
     */
    verticalAt(pos, after, down, goal) {
        const ret = wasm.layoutengine_verticalAt(this.__wbg_ptr, pos, after, down, goal);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * the position a line up or down from `pos`, nearest to `goal`: [0,
     * pos] for text, [1, pos] for a node, [] for none; see `verticalAt`,
     * which also tells how to paint the caret there
     * @param {number} pos
     * @param {boolean} down
     * @param {number} goal
     * @returns {Float64Array}
     */
    vertical(pos, down, goal) {
        const ret = wasm.layoutengine_vertical(this.__wbg_ptr, pos, down, goal);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * an engine with the fonts of `other`, fallbacks added with `addFont`
     * included, without copying their files, e.g. for an export; it has
     * its own page, items and images
     * @param {LayoutEngine} other
     * @returns {LayoutEngine}
     */
    static withFontsOf(other) {
        _assertClass(other, LayoutEngine);
        const ret = wasm.layoutengine_withFontsOf(other.__wbg_ptr);
        return LayoutEngine.__wrap(ret);
    }
    /**
     * @param {number} page
     * @param {number} x
     * @param {number} y
     * @returns {Uint32Array}
     */
    word(page, x, y) {
        const ret = wasm.layoutengine_word(this.__wbg_ptr, page, x, y);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * the words as laid out, for checking the PDF against the layout; for
     * tests
     * @returns {string}
     */
    words() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.layoutengine_words(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) LayoutEngine.prototype[Symbol.dispose] = LayoutEngine.prototype.free;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_30c8987f7c2ed4e2: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_debug_8f971b50f53077f6: function(arg0, arg1) {
            console.debug(getStringFromWasm0(arg0, arg1));
        },
        __wbg_error_035268df37369d3d: function(arg0, arg1) {
            console.error(getStringFromWasm0(arg0, arg1));
        },
        __wbindgen_generic_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./blank_layout_bg.js": import0,
    };
}

const LayoutEngineFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_layoutengine_free(ptr, 1));

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
}

function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayF64FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
}

function getArrayI32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getInt32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayJsValueFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    const mem = getDataViewMemory0();
    const result = [];
    for (let i = ptr; i < ptr + 4 * len; i += 4) {
        result.push(wasm.__wbindgen_externrefs.get(mem.getUint32(i, true)));
    }
    wasm.__externref_drop_slice(ptr, len);
    return result;
}

function getArrayU32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

let cachedFloat64ArrayMemory0 = null;
function getFloat64ArrayMemory0() {
    if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
        cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64ArrayMemory0;
}

let cachedInt32ArrayMemory0 = null;
function getInt32ArrayMemory0() {
    if (cachedInt32ArrayMemory0 === null || cachedInt32ArrayMemory0.byteLength === 0) {
        cachedInt32ArrayMemory0 = new Int32Array(wasm.memory.buffer);
    }
    return cachedInt32ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getUint32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedFloat32ArrayMemory0 = null;
    cachedFloat64ArrayMemory0 = null;
    cachedInt32ArrayMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('blank_layout_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
