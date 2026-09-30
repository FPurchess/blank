---
paths:
  - "src-tauri/layout/**"
  - "src/engine/**"
  - "src/ui/Page*.vue"
  - "src/ui/page*.ts"
  - "src/ui/paintPage.ts"
  - "src/editor/plugins/pageView.ts"
  - "src/editor/hidden.ts"
  - "scripts/build-engine.sh"
---

# The layout engine

Blank lays a document out once, with its own engine, and that one layout is both what the page view paints and what the PDF holds. So the line and page breaks on screen are the PDF's by construction. ProseMirror stays for the model, the commands, undo, input rules, the IME and the clipboard: its DOM is hidden but keeps the focus, and screen readers read it (see `editor-boundary.md`).

## Architecture

- **The engine** is the crate `blank-layout` in `src-tauri/layout/`, a workspace member of `src-tauri/Cargo.toml`. It isn't linked into the app: it runs in the webview as wasm (`src/engine/wasm/`, committed), so laying out needs no IPC.
  - Parley breaks the lines and shapes the text (HarfRust), including bidi. It uses only the fonts it is given, never the system's own, so it lays out the same natively (the tests) and in the webview.
  - `model.rs`: what the webview sends (`Item`s of `Content`, `Settings`, `Bands`, `Fields`). `items/`: one item laid out into lines, or rows for tables (`items/table.rs`). `engine/`: keeps the laid out items, paginates them (`paginate.rs`), answers positions (`navigate.rs`, `select.rs`), and gives each page's display list (`display.rs`) and text layer (`text_layer.rs`). `bands.rs`: headers and footers with their fields (`{page}`, `{pages}`, `{chapter}`, roman numbers, first and even pages). `style.rs`: the type scale, shared with `src/scss/_typography.scss` and the Word styles. `fonts.rs`: the font stack. `pdf.rs`: the PDF, written with krilla from the same display lists the screen paints (subset fonts, links, metadata, PNG/JPEG). `wasm.rs`: the wasm API.
  - It works incrementally: an edit lays out only the changed items, and pagination restarts at the page of the change and stops once a page starts where an old one did. Only pages whose content or bands changed get a new version (`versions`, `body_versions`, `band_versions`), and only those are painted again. A test checks the result against a full pagination (`engine/incremental_tests.rs`).
- **In the webview** (`src/engine/`):
  - `flatten.ts` turns the ProseMirror document into engine items, and `diff` compares them by node identity, so an edit sends only the changed items.
  - `engine.ts` loads the wasm and the fonts and wraps the engine as `PageEngine` (`pageEngine`, `pageEngineReady`, `bootEngine`). `fonts.ts` lists the TTFs in `fonts/`.
  - `fallback.ts` adds fonts for characters the engine laid out as missing: Noto Emoji for emoji, and the system's fonts for other scripts and symbols (`src-tauri/src/fonts.rs`, the `fallback_fonts` command). Every engine gets them, so the pages and the PDF stay the same.
  - `geometry.ts` answers where text is on screen (`caretBox`, `rangeRects`, `blockBoxes`, `tableGeometry`, `hitAt`), `frames.ts` places the pages in both views, `selection.ts` maps the selection, `images.ts` gives image sizes, `pdf.ts` is the PDF exporter (`toPDF`), and `perf.ts` holds the timings (`bootMark`, `window.blankPageViewPerf`).
- **The editor side:** `src/editor/plugins/pageView.ts` (`pageSync`, the first plugin) syncs the engine on every change of the document, the page setup or the fields, and publishes the pages, the caret and the selection (`src/state/pageView.ts`). It moves ↑/↓ and Home/End along the painted lines, and scrolls to the caret itself. `src/editor/hidden.ts` moves the hidden editor so that its caret sits under the painted one (80 ms after the caret rests, and on `compositionstart`), so the IME opens its window there.
- **The page view** (Vue): `src/ui/PageView.vue`, with `PageFrame.vue` (a page on a canvas), `PageMarks.vue` (where pages end in "page ends"), `PageOverlay.vue` (caret, selection, composition) and `PageStatus.vue` ("Page N of M" in the bottom bar). The logic lives in `pageViewModel.ts`, `paintPage.ts`, `pageBitmaps.ts` and `pagePointer.ts`. Glyphs are painted as their outlines from the same font files (`Path2D`, cached per glyph), at the layout's positions, in the theme's `--color`.
- A future GPU backend (e.g. Vello's `vello_gpu` with WebGL2, `vello_cpu` as fallback) plugs in behind the `Painter` interface in `src/ui/painter/types.ts`.
- **Without the engine:** if the wasm can't load, `body.without-engine` shows the editor itself and there is no PDF export. `localStorage["blank.engine"] = "off"` starts Blank that way on purpose, on the plain editor; E2E uses it to test that mode.

## The seam

The wasm API between Rust (`model.rs`, `wasm.rs`) and TypeScript (`flatten.ts`, `engine.ts`) is one contract; change both sides together, and rebuild the wasm.

- Rust gets JSON: `set_settings(json)` with the page setup, the bands and the fields, `set_items(json)` with every item, and `update(…)`/`update_many(json)` with the changed ones. An item is `{ kind: "text" | "break" | "rule" | "image" | "table", pos, … }` (serde's `tag = "kind"`) with `indent`, `before`, `after`, `marker` and quote `bars`. These return the changed pages.
- Pages come back as display lists (`page`, `page_body`, `page_bands`, `bands`: JSON strings of drawing ops) and glyph outlines (`glyph_path`, `units_per_em`).
- Positions are ProseMirror positions: `caret(pos, after)`, `hit(page, x, y)`, `word`, `vertical(pos, down, goal)`, `line_edge`, `selection(from, to)`, `boxes`, `table_grid(pos)`, `page_span(page)`, in points on the page.
- Fonts and images: `add_font(bytes, family)`, `missing()` (the characters without a glyph), `add_image`, `clear_images`. `pdf(title, author)` writes the PDF; `words()` and `stats()` serve the tests and the measurements.
- This describes the seam at 8efdc17. engine-core's notes in `SEAM.md` are folded in at integration.

## Rebuilding

- `make engine` (`bun run engine:build`, `scripts/build-engine.sh`) builds the crate for `wasm32-unknown-unknown` (profile `wasm`: opt-level 3, LTO, one codegen unit, `panic = "abort"`), runs `wasm-bindgen --target web` and `wasm-opt -O3`, and writes `src/engine/wasm/`. Commit the result in the PR that changes the engine.
- The build is reproducible, and CI checks that the committed wasm is what the sources build. That holds only with the pinned tools, which the script checks before building: rustc 1.98.1, `wasm-bindgen-cli` in the version of the `wasm-bindgen` crate in `src-tauri/Cargo.lock`, and binaryen 132 (`bunx --package binaryen@132 wasm-opt`). It maps the paths of the machine to fixed ones (`/cargo`, `/rust`, `/blank`; a `CARGO_TARGET_DIR` elsewhere gets the default's path). It also maps the `rust-src` component to `/rustc/<commit>`: rustc names std's files by their path in `rust-src` when it is installed, and CI's toolchain doesn't have it.
- There's no `rust-toolchain.toml`: rustup reads it from the working directory up, not from `--manifest-path`, so one in `src-tauri/layout` would do nothing, and one above it would pin the app's toolchain too. The script picks an installed 1.98.1 through `RUSTUP_TOOLCHAIN` instead.
- CI: the `engine` job of `test.yml` and the first job of `publish.yml` run `.github/actions/engine`, which tests the crate with poppler, rebuilds the wasm and fails on a diff (and on outdated third-party notices). `make release` refuses unless `engine` passed on `origin/main` (`scripts/check-engine-ci.sh`). `test-on-pr.yml` tests only the app crate (`-p blank`) on the three platforms.

## Exactness

- `src-tauri/layout/tests/exact.rs` writes the PDF of a six-chapter sample on A4 and on A5 landscape and reads every word back with `pdftotext -bbox`. Each word laid out (over 1000) must be on the same page of the PDF, with its left edge, top and bottom within 0.05 pt; its right edge too, except up to 0.45 pt where the letter spacing of headings makes pdftotext measure the last glyph differently.
- `src/engine/exact.test.ts` checks the real pipeline the same way: markdown → `flatten` → the wasm engine → PDF → pdftotext, on `welcome.md`, on a report (A5 landscape, 1.5 cm margins, chapters on new pages, roman numbers, running headers and footers, a page break, a 40-row table), and on code, emoji and Chinese in their fonts (Noto Sans CJK from `fonts-noto-cjk`). `src/engine/pdf.test.ts` checks the fonts, images, links and metadata with `pdffonts`, `pdfimages` and `pdfinfo`.
- Without poppler (and the CJK font) these skip locally but fail when `CI` is set, so CI can't pass without them.
- Tests that must see what the user sees read the painted pages, not the hidden editor: `window.blankGeometry` in E2E, or the canvas pixels (see `ui-testing.md`).

## Known limits

- No justification, hyphenation or widow and orphan control. Headings keep only their first line with the next block.
- Emoji are the monochrome Noto Emoji, in the text's colour; colour glyphs (COLR, bitmaps) aren't painted.
- Chinese, Japanese, Korean and symbols Blank's fonts lack come from the system's fonts, so another machine can lay the same document out differently, and a machine without such a font shows boxes on screen and in the PDF. Fonts whose licence forbids embedding a subset are skipped (see CLAUDE.md, Gotchas).
- The text is painted from unhinted outlines with grayscale anti-aliasing on whole-pixel baselines: a shade lighter than the webview's text at 1×, no subpixel anti-aliasing.
- The IME and screen readers rely on the hidden, moved contenteditable. A real composing input method, and macOS and Windows input methods and screen readers, haven't been tested. Orca reads the lines as the hidden editor breaks them.
- The Word export keeps its own layout and fonts (code in Courier New), so Word and the PDF can differ.
- It needs WebKit with Safari 15's wasm features, hence macOS 11 or newer.
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
- **Size:** the wasm is 3.12 MB (1.15 MB gzip) at opt-level 3 with `wasm-opt -O3`. opt-level "s" saves only 0.1 MB after wasm-opt, so the build keeps 3 for speed. Most of it is Parley's ICU segmenter data, HarfRust and krilla with its subsetter. `dist/` grows from 9.4 to 15.5 MB (the wasm and the TTFs); the release binary grows by 2.4 MB (+6 %).
