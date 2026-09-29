# Spike: Blank's own layout engine (Option C)

A Rust engine lays out the document once. That one layout is both what the
page view paints on screen and what the exported PDF holds. ProseMirror stays
for the model, the commands, undo, input rules, the IME and the clipboard. Its
DOM is hidden but keeps the focus, and screen readers read it. Parley does the
text layout and krilla writes the PDF. The engine runs in the webview as wasm,
so laying out needs no IPC.

## Parity checklist

The goal: everything today's Blank (origin/main) does works at least as well
with the engine, and the pages stay exact with the PDF. The steps are done in
order, and each is committed. Resume at "In progress", then the first open
step.

### Done

- 0. Rebased onto origin/main (#75, the Vue bars). "Page N of M" is
  `PageStatus.vue` in `BottomBar.vue`, before the paper.
- 1. **One geometry service**, `src/engine/geometry.ts`: `caretBox`,
  `rangeRects`, `blockBoxes`, `tableGeometry` (rows and columns per page) and
  `hitAt`, in window coordinates, from the engine's layout (new wasm calls
  `boxes` and `tableGrid`) and `pageViewport`, which `PageView.vue` publishes
  on scroll and resize. The frame math moved to `src/engine/frames.ts`.
  - The table toolbar (`tools.ts`), the handles (`handles.ts`,
    `src/tableHandles.ts`, with a table's piece per page: `firstRow`,
    `rowCount`), the table picker (`tableKey.ts`) and the context menu
    measure through it. No plugin calls `coordsAtPos`, `posAtCoords` or
    `nodeDOM().getBoundingClientRect()` any more; only `hidden.ts` measures
    the hidden DOM, on purpose. The language picker and the dialogs have no
    anchor at the text (they sit in the bar or in the middle).
  - Presses and right clicks on the pages reach the plugins as `PAGE_PRESS`
    and `PAGE_MENU` events (`src/editor/pagePointer.ts`): the pickers and
    table mode close, the context menu opens where it's right clicked, with
    the suggestions prefetched on the press.
  - `pageSync` is the first plugin, so the others measure the new layout.
  - Page Up/Down move a view's height and scroll as far, in the same column
    (Shift selects). A drag beyond the top or bottom edge scrolls, the
    farther the faster. The caret stays in view while typing (as before).
  - Verified: unit tests on a real layout (`geometry.test.ts`,
    `handles.test.ts`, `pageView.test.ts`, `PageView.test.ts`,
    `pagePointer.test.ts`), and `pageEngine.e2e.ts` (Page Down/Up, right
    click, the toolbar on the painted table). Drag scrolling is unit tested
    for its speed only, not in E2E.

### In progress

- 2. Paint what the editor shows.

### Open

- 2. Paint what the editor shows: spell check underlines and right-click
  menu, links (colour, Mod+click, pointer), image placeholder and alt text,
  the frontmatter summary, the page break label, node selection outline,
  `CellSelection`, IME underline, focus ring, all six themes.
- 3. Tables: mouse handles (now placed through the engine; E2E open),
  captions, rowspan/colspan, header column, rows split across pages, column
  widths as `tableGrid` and frozen while editing.
- 4. Text coverage: code in IBM Plex Mono, emoji and CJK.
- 5. Header and footer strips: none where "pages" shows the bands, a click
  on a band or page-end mark opens its strip.
- 6. PDF parity with pdfmake, then remove pdfmake.
- 7. IME and accessibility.
- 8. Performance: start-up, work per key on 100 pages.
- 9. E2E, docs shots, CI, coverage, user docs.

## How to try it

1. `bun install`, then `bun run tauri dev`. The built wasm is committed in
   `src/engine/wasm/`, so you don't need the wasm toolchain. To rebuild it:
   `make engine`, see "Rebuilding" below.
2. You start in **page ends**: one column at the page's text width, painted by
   the engine. Where each page ends, a dashed mark shows that page's footer and
   number, and the next page's header, faintly.
3. **Mod-Alt-V** switches to **pages**: the sheets on a desk, with headers,
   footers and page numbers in place. Blank remembers the view across restarts,
   for every document.
4. Open a document that has a few pages and headers and footers. Or open the
   welcome document and add this frontmatter with Mod-Alt-U or by hand:

   ```yaml
   ---
   title: Engine
   page:
     footer: { center: "Page {page} of {pages}" }
     header: { left: "{title}", right: "{chapter}" }
     new-page-before: 1
   ---
   ```

5. Click into the text and type, select by dragging, double-click a word,
   triple-click a line, Shift-click, and use ↑/↓ (they cross pages), Home/End
   (the painted line). The bottom bar shows "Page N of M".
6. **Mod-Alt-P** exports the PDF through the engine. It has the same line and
   page breaks as the screen.

## What works

- **The engine**, `src-tauri/layout/` (crate `blank-layout`, a workspace
  member of `src-tauri/Cargo.toml`):
  - Parley line breaking, bidi and shaping (HarfRust). It uses only the fonts
    it gets (IBM Plex Sans in 6 faces, DejaVu Sans as the fallback) and no
    system fonts, so it lays out the same natively and in the webview.
  - Blocks: paragraphs, headings h1 to h6 on the major-third scale of today's
    PDF, bold, italic, links (underlined, and clickable in the PDF), inline
    code (tinted), code blocks, lists (bullets by depth, numbers), quotes (bars,
    also nested), rules, page breaks, images, and tables. Tables are a simple
    grid: column widths from `tableGrid`, header rows repeated on every page,
    rows never split, alignment, header fill. Merged cells are laid out as plain
    cells.
  - Pagination as in the pdfmake PDF:
    - A heading stays with the first line of what follows it, and a run of
      headings moves as a whole.
    - `new-page-before` levels start new pages, except right after a page
      break.
    - A page break at the very start is ignored.
    - Images are kept whole, and lines split freely.
    - Space above a block is dropped at the top of a page. That is the
      engine's own choice; I didn't check what pdfmake does there.
  - Headers and footers are ported from `src/layout/bands.ts`/`tokens.ts`
    (`bands.rs`): every field including `{chapter}`, roman numbers, the start
    number, first page `plain` or its own, and even pages.
  - Incremental: an edit lays out only the changed items. Pagination restarts
    at the page of the change and stops as soon as a page starts where an old
    page did, then keeps the old pages. Only pages whose content or bands
    changed get a new version, so only those are painted again. A test checks
    the result against a full pagination.
  - Position map: caret, click (text or node), word, line up/down with a goal
    column, line start/end, and selection rectangles across pages.
  - The PDF (`pdf.rs`) is written with krilla from the same per-page display
    lists the screen paints: embedded subset fonts, links, title/author/creator
    metadata, PNG/JPEG images.
- **In the webview** (`src/engine/`):
  - `flatten.ts` turns the ProseMirror document into engine items. `diff`
    compares them by node identity, so an edit sends only the changed items.
  - `engine.ts` loads the wasm and the TTFs and wraps the engine.
  - `images.ts` gives the sizes of loaded images, `pdf.ts` is the PDF exporter
    (wired in as `toPDF`), and `perf.ts` holds the measurements.
- **Editor side:**
  - `src/editor/plugins/pageView.ts` syncs the engine on every change of the
    document, page setup or fields, and publishes the pages, caret and selection
    (`src/state/pageView.ts`).
  - It moves ↑/↓ and Home/End by the painted lines, and scrolls to the caret
    itself (`handleScrollToSelection`).
  - `src/editor/hidden.ts` moves the hidden editor so that its caret sits under
    the painted one, 80 ms after the caret rests and on `compositionstart`, so
    the IME window opens at the caret.
- **UI** (Vue only):
  - `src/ui/PageView.vue`, `PageFrame.vue` (one page on a canvas),
    `PageOverlay.vue` (caret and selection) and `PageStatus.vue` ("Page N of M",
    teleported into the bottom bar).
  - The logic is in `pageViewModel.ts` (frames for both views, scale, visible
    range, desk ↔ page mapping), `paintPage.ts` and `pagePointer.ts`.
  - Only the pages near the view are mounted, and a page repaints only when its
    version, scale or theme changes.
  - Glyphs are painted as their outlines from the same font files (`Path2D`,
    cached per glyph), at the positions of the layout.
  - Colours come from the theme's `--color`/`--background-color`, so all six
    themes work.
- **Command:** `view.pages` (Mod-Alt-V) is added in the four places and in
  `docs/guide/shortcuts.md`. The choice is stored as `pageView` in
  `storage.ts`.

## Proof of exactness

- **Rust, `src-tauri/layout/tests/exact.rs`:** writes the PDF of a 6-chapter
  sample on A4 and on A5 landscape and reads every word back with
  `pdftotext -bbox`. Every word laid out (over 1000) is in the PDF on the same
  page, and its left edge, top and bottom are within **0.05 pt**. Its right
  edge is too, except for up to 0.45 pt where headings' letter spacing makes
  pdftotext measure the last glyph differently.
- **The real pipeline, `src/engine/exact.test.ts`** (part of `bun run test`,
  skipped without pdftotext): markdown → `flatten` → the wasm engine → PDF →
  pdftotext, with the same check. It runs on `welcome.md` and on a report with
  A5 landscape, 1.5 cm margins, chapters on new pages, roman page numbers,
  running headers and footers, a page break and a 40-row table.
- The screen paints the same display lists (`LayoutEngine.page`) the PDF is
  written from, so the line and page breaks on screen are the PDF's by
  construction.

## What doesn't work yet

- **Existing E2E specs:** 12 of 13 fail. They click into or read `#editor`'s
  visible text, which is hidden now: `getText` is empty, and clicks hit
  `pointer-events: none`. The new `e2e/specs/pageEngine.e2e.ts` passes. The
  others need to go through the page view (or read the text with `execute`).
- **IME:** the hidden editor keeps it, and its caret is moved under the painted
  caret for the candidate window. This is untested with a real IME: WebDriver
  can't compose. The text being composed is laid out as it comes in (ProseMirror
  applies it), but the composition underline isn't painted.
- **Screen readers:** they read the hidden DOM (`opacity: 0`, in the
  accessibility tree), and the canvases are `aria-hidden`. The reading order should
  be the document's. The focus highlight sits on the hidden DOM, not on the painted text.
  Untested with Orca.
- **Spell check:** the underlines are decorations of the hidden DOM and aren't
  painted. The context menu's suggestions work with Shift-F10 and
  Mod-Alt-N.
- **Tables:** they are laid out and painted, and you can type and click in
  cells. The mouse handles are hidden, because they measure the hidden DOM.
  The table toolbar is placed from the hidden DOM too, so near the caret but
  not exactly. There is no caption and no rowspan. A row taller than a page
  overflows it.
- **Not painted yet:** the frontmatter summary widget, the page-break label,
  the image placeholder's alt text, and the link-open Mod-click. Right-click
  on the canvas gives no context menu; Shift-F10 does.
- **Pointer:** a drag doesn't scroll the view at the edge.
- **Other:**
  - Code has no monospace font, the same as today's PDF.
  - The engine doesn't justify lines or hyphenate.
  - Headings keep only their first line with the next block. There is no
    widow/orphan control, the same as pdfmake.
- The header/footer strips at the window edges still show, as before, and in
  "pages" they repeat what the sheet already shows.

## Measurements

These were taken in the debug app under xvfb with software rendering, 44 keys
typed through WebDriver, from `e2e/specs/pageEngine.e2e.ts`. They are in ms,
as mean / p95, and `performance.now()` there is only accurate to about 1 ms.

| document | work per key | key → next frame | editor dispatch | engine layout (incl. flatten + diff) | paint | caret |
|---|---|---|---|---|---|---|
| 1 page | 8.4 / 14 | 19.9 / 31 | 1.7 / 3 | 0.7 / 1 | 1.9 / 3 | 0.05 / 0 |
| 20 pages | 11.5 / 16 | 28.7 / 34 | 2.6 / 3 | 1.2 / 2 | 3.8 / 6 | 0.1 / 1 |
| 100 pages | 18.2 / 25 | 40.1 / 56 | 5.9 / 8 | 3.4 / 5 | 3.6 / 5 | 0.02 / 0 |

- The columns:
  - "work per key" runs from keydown until the next task: ProseMirror, the
    engine, Vue and the canvas.
  - "key → next frame" adds the wait for the frame and the webview's own
    rendering.
  - "editor dispatch" is the whole transaction, which includes the layout.
- **What the engine costs:** at 100 pages it adds about 7 ms per key (layout
  3.4 ms + paint 3.6 ms), within the 16 ms budget. The rest of the ~18 ms is
  ProseMirror handling the input on a 100-page hidden DOM, plus the webview.
  I haven't measured today's editor on the same document, so how much of that
  it already pays is open.
- **Hiding the editor with `content-visibility: auto`** to skip laying it out
  made typing on 100 pages much slower (74 ms per key), so I dropped it.
- **Boot:** about 2.6 s (1 page) to 4.2 s (100 pages) until the pages show,
  under xvfb. That includes loading 3 MB of wasm and 4 MB of TTFs, and the first
  full layout.
- **wasm size** (`src/engine/wasm/blank_layout_bg.wasm`):

  | build | size | gzip |
  |---|---|---|
  | opt-level 3, no wasm-opt | 4.02 MB | 1.23 MB |
  | opt-level 3 + wasm-opt -O3 (**committed**) | 3.12 MB | 1.15 MB |
  | opt-level 3 + wasm-opt -Oz | 3.07 MB | 1.15 MB |
  | opt-level "s", no wasm-opt | 4.98 MB | — |
  | opt-level "s" + wasm-opt -O3 | 3.01 MB | 1.06 MB |

  I kept opt-level 3 for speed. "s" only saves 0.1 MB after wasm-opt. Most of
  the size is Parley's ICU segmenter data, harfrust, and krilla with its
  subsetter.
- **Binary size** (release Linux binary, `tauri build --no-bundle`): 41.45 MB
  with this branch's frontend, against 39.06 MB for the same binary with
  main's frontend, so **+2.39 MB (+6 %)**. The engine isn't linked natively.
  What grows is the embedded frontend: `dist/` goes from 9.4 MB to 15.5 MB
  (the wasm and 10 TTFs), which Tauri compresses.

## Main risks

1. **Two DOMs:** the hidden ProseMirror still does all its DOM work, and the
   page view paints on top of it. Anything that measures the DOM (table
   handles and toolbar, spell check, the context menu by mouse, link hovering,
   node views) has to be ported to the engine's geometry, one by one.
2. **IME and accessibility:** these rely on a hidden, moved contenteditable,
   which is a known fragile pattern (SuperDoc, Google Docs' old approach).
   Composition feedback, the screen reader's focus rectangle, and
   platform-specific IME behaviour (macOS, Windows) are untested.
3. **Text rendering:** the glyphs are unhinted outlines on a canvas with
   grayscale antialiasing. In WebKitGTK at 1× they look good but slightly
   softer than the webview's own text, on fractional baselines (see the
   screenshots from `pageEngine.e2e.ts` in `e2e/screenshots/`). There is no
   subpixel AA, and emoji or colour fonts aren't painted: COLR/bitmap glyphs
   come out as outlines or nothing.
4. **Typography is now Blank's own:** everything the browser and pdfmake did
   (line height, spacing, lists, tables, images, justification, hyphenation,
   widows) has to be built in the engine. The Word export still follows its own
   rules, so Word and the PDF can differ.
5. **Size and start-up:** about 3 MB of wasm plus 4 MB of TTFs are bundled
   (the pdfmake VFS stays for the Word export's embedded font). Loading them
   adds to start-up.
6. **Tests:** E2E has to move to the page view, and the unit tests need the
   wasm (committed) plus pdftotext for the exactness check.

## Rebuilding

- `make engine` (`bun run engine:build`, `scripts/build-engine.sh`) needs:
  - `rustup target add wasm32-unknown-unknown`
  - `cargo install wasm-bindgen-cli --version 0.2.129 --locked`, which must
    match `wasm-bindgen` in `src-tauri/Cargo.lock`
  - bun, for binaryen's `wasm-opt`
- `cd src-tauri/layout && cargo test`: 22 unit tests plus `tests/exact.rs`,
  which needs `pdftotext`.
- `bun run test:rust` now runs the whole workspace.
- `cd e2e && E2E_PORT=4482 xvfb-run -a bunx wdio run ./wdio.conf.ts --spec specs/pageEngine.e2e.ts`
  runs the page view E2E and prints the measurements.
