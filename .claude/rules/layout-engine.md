---
paths:
  - "src-tauri/layout/**"
  - "src/engine/**"
  - "src/ui/Page*.vue"
  - "src/ui/page*.ts"
  - "src/ui/paintPage.ts"
  - "src/ui/painter/**"
  - "src/editor/plugins/pageView.ts"
  - "src/editor/hidden.ts"
  - "src/editor/pagePointer.ts"
  - "src/state/pageView.ts"
  - "src-tauri/src/fonts.rs"
  - "scripts/build-engine.sh"
  - ".github/actions/engine/**"
---

# The layout engine

Blank lays a document out once, with its own engine, and that one layout is both what the page view paints and what the PDF holds. So the line and page breaks on screen are the PDF's by construction. ProseMirror stays for the model, the commands, undo, input rules, the IME and the clipboard: its DOM is hidden but keeps the focus, and screen readers read it (see `editor-boundary.md`).

## Architecture

- **The engine** is the crate `blank-layout` in `src-tauri/layout/`, a workspace member of `src-tauri/Cargo.toml`. It isn't linked into the app: it runs in the webview as wasm (`src/engine/wasm/`, committed), so laying out needs no IPC.
  - Parley breaks the lines and shapes the text (HarfRust), including bidi. It uses only the fonts it is given, never the system's own, so it lays out the same natively (the tests) and in the webview.
  - `model.rs`: what the webview sends (`Item`s of `Content`, `Settings`, `Bands`, `Fields`). `items/`: one item laid out into lines, or rows for tables (`items/table.rs`). `engine/`: keeps the laid out items, paginates them (`paginate.rs`), answers positions (`navigate.rs`, `select.rs`), and gives each page's display list (`display.rs`) and text layer (`text_layer.rs`). `bands.rs`: headers and footers with their fields (`{page}`, `{pages}`, `{chapter}`, roman numbers, first and even pages). `style.rs`: the type scale, shared with `src/scss/_typography.scss` and the Word styles. `fonts.rs`: the font stack. `pdf.rs` and `pdf/tags.rs`: the PDF, written with krilla from the same display lists the screen paints (subset fonts, links, metadata, PNG/JPEG), tagged, with bookmarks and its language. `wasm.rs`: the wasm API.
  - It works incrementally: an edit lays out only the changed items, and pagination restarts on the page before the change (before the headings kept with what follows them, where text may flow back) and stops once a page starts where an old one did. Only pages whose content or bands changed get a new version (`versions`, `body_versions`, `band_versions`), and only those are painted again. A test checks the result against a full pagination (`engine/incremental_tests.rs`).
- **In the webview** (`src/engine/`):
  - `flatten.ts` turns the ProseMirror document into engine items, and `diff` compares them by node identity, so an edit sends only the changed items.
  - `engine.ts` loads the wasm and the fonts and wraps the engine as `PageEngine` (`pageEngine`, `pageEngineReady`, `bootEngine`). `fonts.ts` lists the TTFs in `fonts/`.
  - `fallback.ts` adds fonts for characters the engine laid out as missing: Noto Emoji for emoji, and the system's fonts for other scripts and symbols (`src-tauri/src/fonts.rs`, the `fallback_fonts` command). Every engine gets them, so the pages and the PDF stay the same.
  - `geometry.ts` answers where text is on screen (`caretBox`, `rangeRects`, `blockBoxes`, `tableGeometry`, `hitAt`), `frames.ts` places the pages in both views (in "page ends", `BAND_GAP` is the room between a header or footer and the text, `HEADER_ROOM` the first page's header, and `MARK_HEIGHT` the mark where a page ends: a footer, the line and a header), `selection.ts` maps the selection, `images.ts` gives image sizes, `pdf.ts` is the PDF exporter (`toPDF`: on an engine that shares the page view's fonts, or, after a trap, in a worker with a wasm instance of its own, `pdfWorker.ts`, both through `pdfJob.ts`), and `perf.ts` holds the timings (`bootMark`, `window.blankPageViewPerf`).
- **The editor side:** `src/editor/plugins/pageView.ts` (`pageSync`, the first plugin) syncs the engine on every change of the document, the page setup or the fields, and publishes the pages, the caret and the selection (`src/state/pageView.ts`), and `pageHeadBox`, where the selection's head is painted with its line's affinity, for the input method's window. `engineMissing` there is true once the editor shows the text itself, so the UI around it (e.g. the header and footer strips in `src/bandStrips.ts`) can follow. It moves ↑/↓ and Home/End along the painted lines, and scrolls to the caret itself. `alignHiddenEditor` (`src/editor/hidden.ts`) moves the hidden editor so that its caret sits under the painted one, so the IME opens its window there; `PageView.vue` calls it 80 ms after the caret rests (`ALIGN_DELAY`) and on `compositionstart` and `compositionupdate`.
- **The page view** (Vue): `src/ui/PageView.vue`, with `PageFrame.vue` (a page on a canvas), `PageMarks.vue` (where pages end in "page ends"), `PageOverlay.vue` (caret, selection, composition) and `PageStatus.vue` ("Page N of M" in the bottom bar). The logic lives in `pageViewModel.ts`, `paintPage.ts`, `pageBitmaps.ts` and `pagePointer.ts`. Dragging the selected text to another place is `src/editor/pageMove.ts`, which `PageView.vue` hands its pointer events: a press in the selection and a move of `DRAG_START` (4 px) starts it, a press without a move places the caret. Glyphs are painted as their outlines from the same font files (`Path2D`, cached per glyph), at the layout's positions, in the theme's `--color`.
- A future GPU backend (e.g. Vello's `vello_gpu` with WebGL2, `vello_cpu` as fallback) plugs in behind the `Painter` interface in `src/ui/painter/types.ts`.
- **Without the engine:** `engineStatus()` (`src/engine/engine.ts`) is `"ready"`, or one of three states in which Blank runs as a plain editor (`engineless()`, `body.without-engine` shows the editor itself): `"off"` when `localStorage["blank.engine"] = "off"` started it that way on purpose (E2E uses it to test that mode), `"unavailable"` when the wasm couldn't load, and `"failed"` when the engine stopped working while Blank ran (it shows `ENGINE_FAILED`). The PDF export loads an engine of its own when there's no page engine to share (`newEngine`), and writes the PDF in a worker with a fresh wasm instance after a trap (`pdfWorker.ts`, `pdfJob.ts`). So only a wasm that can't load at all leaves Blank without PDF export.

## The seam

The wasm API between Rust (`model.rs`, `wasm.rs`) and TypeScript (`flatten.ts`, `engine.ts`, `pdf.ts`, `pdfJob.ts`) is one contract; change both sides together, and rebuild the wasm. The names below are the JS ones (`#[wasm_bindgen(js_name)]`).

- **Making engines:** `new LayoutEngine(bytes, lengths)` gets the base fonts laid one after the other, and throws for lengths past the bytes. `LayoutEngine.withFontsOf(other)` makes an engine that shares `other`'s font files (the wasm memory keeps each once); its items, pages and images are its own. `fontFileCount()`, `fontFile(i)` and `fontFileFamily(i)` give the files back, in order, to rebuild the same fonts in a fresh instance (the PDF worker). `addFont(bytes, family)` adds a fallback file (a `.ttc` with all its faces) for `family`, and `missing()` returns the characters no font has.
- **Sending the document:** JSON. `setSettings(json)` takes the page setup, the bands and the fields, `setItems(json)` every item, `update(start, delete, json, shift)` replaces items and moves the positions after them by `shift`, and `updateMany(json)` does several updates in document order, paginating once. Each returns the pages that changed: `[bodyFrom, bodyTo, bandFrom, bandTo]`, half-open, `from == to` for none.
  - An item is `{ kind: "text" | "break" | "rule" | "image" | "table", pos, … }` (serde's `tag = "kind"`) with `indent`, `before`, `after`, `marker` and quote `bars`.
  - A table cell has `paragraphs`, or `blocks` when it holds more: `text` blocks with their own `indent`, `marker` and `bars` (lists, quotes, code) and `image` blocks, fitted to the cell's width.
  - The engine clamps what it gets (sizes, margins, start numbers, columns) and never panics on odd input; a panic that is left is written to `console.error` before the instance traps.
- **Pages:** `pageCount()`, `versions()`, and `bodyVersions()`/`bandVersions()`, one per page, which change only when a page's body or its header and footer change, so only those are painted again. `pageBody(page)` and `pageBands(page)` are the display lists (JSON strings of drawing ops), `page(page)` both; `bands(page)`, `bottoms()`, `glyphPath(font, glyph)` and `unitsPerEm(font)`. A glyph run's `font` is a font index: below the number of faces a face of a file, from `INSTANCE_BASE` (2^20) on an instance of a variable face at other coordinates (e.g. the bold of Noto Emoji). An index never changes its meaning, so a cache keyed by it stays right; the `fontFile*` calls count files, never instances.
- **Positions** are ProseMirror positions, in points on the page:
  - `caret(pos, after)`, where `after` paints the caret at the end of the line a position ends rather than at the start of the next;
  - `hit(page, x, y)`, `word(page, x, y)`;
  - `verticalAt(pos, after, down, goal)` and `lineBoundary(pos, after, end)`, which return the `after` of where they land (`vertical` and `lineEdge` are the older forms without it);
  - `selection(from, to)`, `boxes(from, to)`, `tableGrid(pos)`, `pageSpan(page)`.
- **Images and the PDF:** `addImage(src, bytes, jpeg)`, `clearImages()`. `pdf(title, author, language)` writes the PDF, tagged, with bookmarks and `/Lang` when a language is given. `pdfWarnings()` says, as JSON, what it left out: images it couldn't decode (they show their alt text) and fonts it couldn't embed. `words()` and `stats()` serve the tests and the measurements; they're behind the cargo feature `test-hooks`, which is on by default, so `make engine` builds them. Leaving them out of the production wasm would need `--no-default-features` there and a separate build for the TypeScript tests.

## Rebuilding

- `make engine` (`bun run engine:build`, `scripts/build-engine.sh`) builds the crate for `wasm32-unknown-unknown` (profile `wasm`: opt-level 3, LTO, one codegen unit, `panic = "abort"`), runs `wasm-bindgen --target web` and `wasm-opt -O3`, and writes `src/engine/wasm/`. Commit the result in the PR that changes the engine.
- The build is reproducible, and CI checks that the committed wasm is what the sources build. That holds only with the pinned tools, which the script checks before building: rustc 1.98.1, `wasm-bindgen-cli` in the version of the `wasm-bindgen` crate in `src-tauri/Cargo.lock`, and binaryen 132 (`bunx --package binaryen@132 wasm-opt`). It maps the paths of the machine to fixed ones (`/cargo`, `/rust`, `/blank`; a `CARGO_TARGET_DIR` elsewhere gets the default's path). It also maps the `rust-src` component to `/rustc/<commit>`: rustc names std's files by their path in `rust-src` when it is installed, and CI's toolchain doesn't have it.
- There's no `rust-toolchain.toml`: rustup reads it from the working directory up, not from `--manifest-path`, so one in `src-tauri/layout` would do nothing, and one above it would pin the app's toolchain too. The script picks an installed 1.98.1 through `RUSTUP_TOOLCHAIN` instead.
- CI: the `engine` job of `test.yml` and the first job of `publish.yml` run `.github/actions/engine`, which tests the crate with poppler and qpdf, rebuilds the wasm and fails on a diff (and on outdated third-party notices). `make release` refuses unless `engine` passed on `origin/main` (`scripts/check-engine-ci.sh`). `test-on-pr.yml` tests only the app crate (`-p blank`) on the three platforms.

## Exactness

- `src-tauri/layout/tests/exact.rs` writes the PDF of a six-chapter sample on A4 and on A5 landscape, and of tables with lists and quotes in their cells, and reads every word back with `pdftotext -bbox`. Each word laid out (over 1000) must be on the same page of the PDF, with its left edge, top and bottom within 0.05 pt; its right edge too, except up to 0.45 pt where the letter spacing of headings makes pdftotext measure the last glyph differently.
- `src/engine/exact.test.ts` checks the real pipeline the same way: markdown → `flatten` → the wasm engine → PDF → pdftotext, on `welcome.md`, on a report (A5 landscape, 1.5 cm margins, chapters on new pages, roman numbers, running headers and footers, a page break, a 40-row table), on words longer than the line, and on code, emoji and Chinese in their fonts (Noto Sans CJK from `fonts-noto-cjk`). `src/engine/pdf.test.ts` checks the fonts, images, links and metadata with `pdffonts`, `pdfimages` and `pdfinfo`.
- The tagged PDF test in `exact.rs` also checks the structure, the language and the bookmarks with `pdfinfo` and `qpdf`.
- Without their tools (poppler, qpdf, and the CJK font for `exact.test.ts`) these checks skip locally, but fail when `CI` is set, so CI can't pass by skipping them. Every check that looks for a tool does so, as `read_words` in `exact.rs` and `has()` in `pdf.test.ts` do.
- Tests that must see what the user sees read the painted pages, not the hidden editor: `window.blankGeometry` in E2E, or the canvas pixels (`canvasInk`, `screenStats` in `e2e/helpers.ts`, see `ui-testing.md`).

## Known limits

- No justification, hyphenation or widow and orphan control. Headings keep only their first line with the next block.
- Emoji are the monochrome Noto Emoji, in the text's colour; colour glyphs (COLR, bitmaps) aren't painted.
- Chinese, Japanese, Korean and symbols Blank's fonts lack come from the system's fonts, so another machine can lay the same document out differently, and a machine without such a font shows boxes on screen and in the PDF. Fonts whose licence forbids embedding a subset are skipped (see CLAUDE.md, Gotchas).
- The text is painted from unhinted outlines with grayscale anti-aliasing on whole-pixel baselines: a shade lighter than the webview's text at 1×, no subpixel anti-aliasing.
- The IME and screen readers rely on the hidden, moved contenteditable. A real composing input method, and macOS and Windows input methods and screen readers, haven't been tested. Orca reads the lines as the hidden editor breaks them.
- The Word export keeps its own layout and fonts (code in Courier New), so Word and the PDF can differ.
- It needs the wasm features of Safari 15's WebKit, which macOS 12 (Monterey) ships with, hence macOS 12 or newer.
- A new feature that measures the DOM measures the wrong place. Measure through `src/engine/geometry.ts`.

## Measurements worth keeping

Taken in the debug app under xvfb with software rendering (`e2e/specs/pageEngine.e2e.ts` and `scroll.e2e.ts`), so compare runs on one machine only, taken in turns under the same load.

- **Typing** (44 keys, ms as mean / p95): the work per key is 6.3 / 13 on 1 page, 9.4 / 15 on 20 and 14.1 / 19 on 100. At 100 pages the engine's part is about 3.4 ms of layout (with `flatten` and `diff`) and 3.6 ms of painting; the rest is ProseMirror on a 100-page hidden DOM. Hiding that DOM with `content-visibility: auto` made typing much slower (74 ms per key).
- **Start-up** (ms from the window opening, `window.blankBootTimes`): the engine is ready at about 350, the first layout done at 420–550 and the pages painted at 1070–1340, for 1 to 100 pages. Most of the time until the pages show is the webview's first style and layout of the hidden editor.
- **Scrolling:** frames stay at about 16.5 ms mean, 17–18 p95, in both views, at 1× and 2×, on 20 and 100 pages. It stays smooth because:
  - scrolling doesn't move the hidden editor;
  - the viewport is read once per frame and written only when it changed;
  - only the pages within a view's height are mounted, and they're kept until two views away (`visibleRange`, `keptRange` in `frames.ts`);
  - pages paint from a queue, the visible ones first, then the others within an 8 ms budget per frame;
  - pages that leave the view are kept as ImageBitmaps (`pageBitmaps.ts`, LRU, 192 MB);
  - the sheets' shadows have no blur.

  A worker with OffscreenCanvas and tiles wasn't needed. Scrolling hasn't been measured on real GPU hardware.
- **Size:** the wasm is about 3.25 MB (1.2 MB gzip) at opt-level 3 with `wasm-opt -O3`. opt-level "s" saves only 0.1 MB after wasm-opt, so the build keeps 3 for speed. Most of it is Parley's ICU segmenter data, HarfRust and krilla with its subsetter. `dist/` grows from 9.4 to 15.5 MB (the wasm and the TTFs); the release binary grows by 2.4 MB (+6 %).
