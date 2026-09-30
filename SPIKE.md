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

- 2. **Paint what the editor shows:**
  - Spell check: the misspelled words of the spell check's decorations get a
    wavy line in the theme's `--spelling-color` (`PageMarks.vue`,
    `pageMarks.ts`, only on the pages in view; `pageSpan` in the engine). A
    right click on a painted word opens the menu with its suggestions.
  - Links: the underline is its own role, half as strong as the text as in
    the editor (black in the PDF, as pdfmake). Ctrl (Cmd) + click opens a
    link (`openLink.ts` on `PAGE_PRESS`, the link found in the page's
    display list), the pointer is a hand while the key is held over a link,
    and the tooltip shows its url and the hint.
  - An image that isn't loaded, or can't be, shows its alt text (or its src)
    in italics, dimmed on screen, as the PDF does (a `label` of the item,
    not text of the document).
  - The frontmatter summary shows above the first page, with room made for
    it (`PageProperties.vue`, `properties` in `PageLayoutState`); a click
    opens the page setup.
  - The "Page break" label at every page break (not in the PDF).
  - A selected node (image, rule, page break) is outlined, selected cells
    are one rectangle per page (`src/engine/selection.ts`), the text being
    composed with an input method is underlined.
  - The caret shows while the editor has the focus, and the selection dims
    without it. The main editor never had a focus ring (`outline: none`).
  - All six themes, from their variables (screenshots
    `engine-theme-*.png` from `pageEngine.e2e.ts`).
  - Verified: unit tests (`pageMarks.test.ts`, `selection.test.ts`,
    `pageView.test.ts` for the composition and node outline, `openLink.test.ts`
    for Ctrl + click), and `pageEngine.e2e.ts` ("paints what the editor
    shows around the text": the summary and its click, the page break label,
    the spelling line and its suggestions, the six themes, looked at in the
    screenshots). Not verified in E2E: the hand over links, the composition
    underline (WebDriver can't compose).

- 3. **Tables at today's level:**
  - The mouse handles work on the painted table: select rows and columns
    (with the table menu), the "+" to insert, drag to move rows and
    columns, resize columns (double click resets), drag the edges. A table
    on several pages has handles on its piece under the mouse.
  - The engine lays out captions above the table (kept with it), merged
    cells across columns and rows (the rows they join stay together), header
    cells in any row or column (bold and tinted), and slices a row taller
    than a page between its lines, so it starts where it comes and goes on
    over the pages, with the header rows repeated. The lines are
    `TABLE_LINES` (0.6 pt, 1.2 pt under the header rows).
  - Column widths are `tableGrid`'s, and stay as they were while the cursor
    is in the table (`frozenWidths`), relaxing once it leaves.
  - `window.blankGeometry` lets E2E measure what is painted.
  - Verified: Rust tests (merged cells, caption kept with the table, sliced
    rows, the grid of a sliced row), `flatten.test.ts`, `pageView.test.ts`
    (frozen columns), and E2E: the five mouse tests of `tables.e2e.ts`
    ported to the painted table (insert, move, resize and reset, edges,
    table menu), and "lays out captions, merged cells and rows taller than a
    page" in `pageEngine.e2e.ts` (looked at in the screenshots).
  - Not yet: images, lists and quotes inside cells are laid out as plain
    paragraphs (an image shows as a placeholder character).

- 4. **Text coverage:**
  - Code in IBM Plex Mono (IBM's official files of 2.5.0, unmodified, in
    `fonts/`): code blocks at 10 pt on the body's lines, inline code at 0.9
    of the text around it, on the screen and in the PDF.
  - Emoji: the monochrome Noto Emoji (2 MB, OFL, loaded only for a document
    with emoji), painted in the text's colour and embedded in the PDF.
  - Other scripts: the engine reports the characters it laid out as missing
    glyphs (`missing`); `src/engine/fallback.ts` asks the Rust side
    (`fallback_fonts` in `src-tauri/src/fonts.rs`, fontique's system
    fallback by script and the document's language) for the system's fonts,
    reads them and adds them to every engine (`addFont`, each face of a
    `.ttc` apart), which lays out again. The screen and the PDF use the same
    files, so they stay identical.
  - Verified: Rust tests (code in Plex Mono, missing characters, a `.ttc`
    added and embedded in the PDF), `fallback.test.ts`, `exact.test.ts` with
    code, emoji and Chinese (0.05 pt), and `pageEngine.e2e.ts` ("shows code
    in Plex Mono, emoji and Chinese", looked at in the screenshot).
  - Open decisions, see "Decisions for the owner" below.

- 5. **The header and footer strips:**
  - The edges no longer show a band's line: the pages show it, on the
    sheets in "pages" and in the page-end marks in "page ends". They still
    offer "+ Header", "+ Footer" and "# Page numbers" near the bars.
  - A click on a sheet's header or footer margin, or on the footer or header
    of a page-end mark, opens its strip (`editBand` through the handle).
  - An open strip takes room at the edge of the window, and the pages fade
    behind it (the hidden editor no longer shows through).
  - Verified: `bandStrips.test.ts`, `PageView.test.ts`, and `bands.e2e.ts`,
    ported to the pages (8/8, two new: a strip from a page end and from a
    sheet's margin; screenshot `engine-strip.png`).
  - E2E helpers for the pages: `clickText`, `textBox`, `editorText` and
    `focusEditor` (`e2e/helpers.ts`), on `window.blankGeometry.find`.

- 6. **PDF parity, and pdfmake removed:**
  - The engine's PDF has what pdfmake's had: images loaded like before
    (`prepareImages`, web images through `@tauri-apps/plugin-http`) with the
    warning for those that couldn't be, and their alt text in their place;
    the table colours of `TABLE_COLORS` and the lines of `TABLE_LINES`;
    captions, quote bars, rules, code blocks, line breaks, ordered lists
    from any number; the DejaVu fallback per glyph (Parley's font stack);
    the "Exported N pages" notification and the layout warnings
    (`exportAs.ts`, unchanged); clickable links; title, author and creator.
    Beyond pdfmake: code in Plex Mono with its tint, emoji and other scripts,
    merged cells, rows taller than a page.
  - pdfmake, `@types/pdfmake`, `src/exporters/pdf/` with its generated font
    VFS, and `scripts/build-pdf-vfs.ts` (`fonts:vfs`) are gone. The Word
    export loads Plex Sans from `fonts/` (`src/exporters/docx/font.ts`).
  - Verified: `src/engine/pdf.test.ts` (warnings, pages, and with poppler:
    the text, the list numbers, the alt text, the image, the link, the
    metadata), `exact.test.ts`, the Rust tests.

- 7. **IME and accessibility:**
  - The hidden editor moves its caret under the painted one 80 ms after the
    caret rests, and at every `compositionstart` and `compositionupdate`, so
    the candidate window opens at the painted caret and follows the text
    being composed. The composed text is underlined on the pages
    (`pageComposition`, step 2).
  - `#page-view` is `aria-hidden`, as are its canvases and marks: screen
    readers read the focused hidden editor, whose DOM is the document in
    order (the frontmatter summary included, as the editor's widget).
  - Verified: `ime.e2e.ts` composes "é" with GTK's own input method
    (Ctrl+Shift+U e9 Space, the only composing input method under xvfb here:
    ibus has no composing engine installed, and xdotool is missing) and
    checks it lands where the pages were clicked; and it checks what a
    screen reader gets (focus, editable, not hidden, the pages hidden, the
    order).
  - **Not verifiable here:** WebKitWebDriver only hands the webview the end
    of a composition, so the underline while composing and the candidate
    window's place were not seen with a real input method; Orca's speech
    (no AT-SPI session under xvfb); macOS and Windows input methods. Orca
    reads lines as the hidden editor breaks them (640 px wide, the webview's
    font), which are not the painted lines.

- 8. **Performance:**
  - The engine (wasm and fonts) starts loading first, in parallel with the
    config and storage, and is awaited just before the editor renders
    (letting the editor render first delayed the wasm compile behind the
    webview's layout of the hidden editor: slower for long documents).
  - A long document lays out its first 60 items (a few pages) before the
    pages show, and the rest 80 items at a time between other work
    (`PageEngine.sync(…, progressive)`, `onProgress`); "Page 1 of 59"
    grows to the full count. Any edit lays out the rest first.
  - If the engine can't load, `body.without-engine` shows the editor itself.
  - Start-up steps are marked (`bootMark`, `window.blankBootTimes`).
  - Measured, see "Measurements" below.

- **Fix (found in Option B, checked here): words wider than the line.** A
  long URL or `aaaa…` ran past the right margin, on the pages and in the
  PDF alike: Parley's default `OverflowWrap::Normal` only breaks at break
  opportunities. `TextBox::new` now sets `OverflowWrap::Anywhere`, so such a
  word breaks where it must (as the editor's CSS did), everywhere text is
  laid out: body text, headings, list items, table cells, headers and
  footers. Verified: Rust tests (every glyph within the line, the caret and
  hits along the forced breaks, every kind of block and the header on the
  page), and `exact.test.ts` with a long URL and a long word in a heading, a
  paragraph, a link, a list item, a table cell and the header (0.05 pt).

- **Check (asked by the owner): the fonts and the rendering.**
  - Fonts: regular text is IBM Plex Sans in its six faces with DejaVu Sans
    only for characters Plex lacks, as on main (`fonts/`, and the woff2
    copies for the webview's own text: the bars, the page-end marks, the
    properties line, the dialogs, all on main's CSS font stack). Code is set
    in IBM Plex Mono, as asked for this spike. Noto Emoji and the system's
    fonts come in only for characters none of these has. Verified: a Rust
    test of the face each style gets (regular, italic, medium, medium
    italic, bold, bold italic, mono), and `pdffonts` on an exported PDF in
    `pdf.test.ts`: IBMPlexSans, -Bold, -BoldItalic, -Italic, -Medm (IBM's
    own name of the Medium face) and DejaVuSans for "⇒", nothing else.
  - Rendering: the canvases were sized by devicePixelRatio already, but a
    frame could sit between pixels (fractional left and top in "page
    ends"), and a canvas be shown a fraction larger than its backing store
    (`ceil`), both of which blur. Now the frames are on whole pixels, each
    canvas is shown at exactly its backing size divided by the ratio, lines
    and underlines are filled on whole device pixels, and each glyph's
    baseline is snapped to a device pixel (x keeps the layout's position),
    as the webview does. Glyphs are filled as anti-aliased outlines (the
    canvas's own grayscale anti-aliasing), and image smoothing is on for
    pictures.
  - Compared with `e2e/specs/rendering.e2e.ts`: a painted line and the same
    words set by the webview right below it, at 1× and at 2× (`GDK_SCALE=2`
    under xvfb), in `e2e/screenshots/render-1x.png`, `render-2x.png` and the
    enlarged `render-compare.png` (git-ignored like the other E2E
    screenshots). Both are smooth and anti-aliased at 1× and 2×; at 1× the
    painted text is a shade lighter than the webview's, which hints and
    darkens its stems, and its spaces and figures are set as the PDF has
    them, not as the webview does.

- 9. **Tests, CI and docs:**
  - All E2E specs run on the page view (15 specs): they read the text
    through the hidden editor (`expectEditorText`, `editorText`), and click
    and right-click the painted pages (`clickInto` at the end of an
    element's painted text, `clickText`), measuring with
    `window.blankGeometry`. New specs: `ime.e2e.ts`, `rendering.e2e.ts`.
  - The docs shots are ported the same way and regenerated. Every still and
    GIF changed, since the text is painted now and set at the width of the
    page's text column; I looked at each against main's and kept them all.
    The header and footer GIFs now end on a second page, whose header shows
    where the first page ends. The stills hide the pointer the recordings
    drew.
  - CI: `test-on-pr.yml` runs `cargo test --workspace` on all three
    platforms (the layout engine and the system fonts too); `test.yml`
    installs poppler (so `exact.test.ts` and `pdf.test.ts` run) and has a
    new `engine` job that tests the engine and rebuilds the wasm to check
    it matches the committed one. `scripts/build-engine.sh` builds it
    reproducibly (paths mapped, toolchain 1.98.1 pinned): a build from a
    copy at another path gave the same bytes. Not run on GitHub yet (no
    push).
  - Coverage: 96.3 % statements, 91.7 % branches.
  - User docs: `pages.md` (the two views, Page N of M, Page Up/Down, the
    bands on the pages), `shortcuts.md`, `writing.md`.
  - Verified: the full E2E suite, 15/15 specs, under xvfb with
    `E2E_PORT=4482`.

### In progress

- Nothing. See "What doesn't work yet" and the decisions.

### Open

- Nothing of the nine steps; the gaps are listed below.

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

The first spike's list is resolved by the parity steps above; what is left:

- **Tables:** images, lists and quotes inside cells are laid out as plain
  paragraphs (an image shows as a placeholder character).
- **IME:** the underline while composing and the candidate window's place
  weren't seen with a real input method (WebKitWebDriver only hands the
  webview the end of a composition); macOS and Windows input methods are
  untested.
- **Screen readers:** Orca itself wasn't run; it reads the lines as the hidden
  editor breaks them, not as they're painted.
- **Typography:** no justification, no hyphenation, no widow/orphan control
  (as with pdfmake). Headings keep only their first line with the next block.
- **Colour emoji** (see the decisions).
- **Docs recording:** in `table-mouse.gif` the row move and the "+" don't
  take, and "Plums" lands in a cell; main's committed GIF shows the same, so
  it is the recording, not the page view (the same drags pass in
  `tables.e2e.ts`).
- The word count in the bottom bar comes from the editor as before; the
  pages don't count words themselves.

## Scrolling

The owner found scrolling laggy. `e2e/specs/scroll.e2e.ts` measures it: the
time between frames while the view scrolls 40 px on every frame for 240
frames ("byFrames"), while it scrolls 8000 px smoothly ("smooth", as a wheel
with kinetic scrolling does), and the same without the sheets' shadows
("noShadow"), on about 20 and 100 pages, in both views, at 1× and at 2×
(`GDK_SCALE=2`). It also sums the page view's own work meanwhile (the
scroll handler, its render, painting and aligning the hidden editor, see
`perf.ts`). "Dropped" frames took over 25 ms, "long" ones over 50 ms.
WebKitWebDriver turns only the first notch of a wheel action into a scroll,
so the wheel runs measure little and aren't in the table.

The machine was shared and busy, so the builds before (828841c) and after
ran in turns, three times each, under the same load; the table shows the
medians. The "before" build had no timers for its scroll handler, render and
alignment, so its JS work counts painting only.

| document | view | ratio | scroll | before: mean / p95 frame ms, dropped, long | after | JS work per run, before → after (ms) |
|---|---|---|---|---|---|---|
| 20 p | page-ends | 1× | byFrames | 16.7 / 18, 6, 0 | 16.6 / 18, 5, 0 | 64 → 117 |
| 20 p | page-ends | 1× | smooth | 16.6 / 17, 3, 0 | 16.4 / 17, 1, 0 | 14 → 20 |
| 20 p | pages | 1× | byFrames | 16.9 / 18, 6, 1 | 16.6 / 18, 5, 0 | 36 → 70 |
| 20 p | pages | 1× | noShadow | 16.6 / 18, 4, 0 | 16.6 / 18, 0, 0 | 28 → 39 |
| 20 p | pages | 1× | smooth | 16.5 / 17, 3, 0 | 16.3 / 17, 0, 0 | 19 → 26 |
| 100 p | page-ends | 1× | byFrames | 16.7 / 18, 7, 0 | 16.7 / 18, 6, 0 | 71 → 124 |
| 100 p | page-ends | 1× | smooth | 16.5 / 17, 2, 0 | 16.4 / 17, 2, 0 | 17 → 29 |
| 100 p | pages | 1× | byFrames | 16.7 / 18, 5, 0 | 16.7 / 18, 5, 0 | 36 → 71 |
| 100 p | pages | 1× | noShadow | 16.7 / 18, 6, 0 | 16.6 / 18, 0, 0 | 38 → 34 |
| 100 p | pages | 1× | smooth | 16.8 / 17, 3, 1 | 16.4 / 17, 0, 0 | 21 → 25 |
| 20 p | page-ends | 2× | byFrames | 16.8 / 21, 2, 0 | 17 / 20, 4, 0 | 36 → 88 |
| 20 p | page-ends | 2× | smooth | 16.8 / 17, 4, 1 | 16.4 / 17, 0, 0 | 15 → 31 |
| 20 p | pages | 2× | byFrames | 16.8 / 19, 3, 0 | 16.8 / 19, 3, 0 | 20 → 54 |
| 20 p | pages | 2× | noShadow | 16.6 / 18, 1, 0 | 16.6 / 18, 0, 0 | 17 → 29 |
| 20 p | pages | 2× | smooth | 16.8 / 17, 4, 1 | 16.2 / 17, 0, 0 | 21 → 30 |
| 100 p | page-ends | 2× | byFrames | 16.7 / 19, 1, 0 | 16.7 / 19, 2, 0 | 36 → 73 |
| 100 p | page-ends | 2× | smooth | 16.9 / 18, 4, 0 | 16.2 / 17, 2, 0 | 21 → 35 |
| 100 p | pages | 2× | byFrames | 18 / 25, 11, 0 | 16.7 / 18, 1, 0 | 33 → 37 |
| 100 p | pages | 2× | noShadow | 16.6 / 18, 1, 0 | 16.7 / 18, 1, 0 | 31 → 26 |
| 100 p | pages | 2× | smooth | 17.1 / 17, 4, 2 | 16.3 / 17, 1, 0 | 26 → 44 |

**What caused it:**
1. **The hidden editor moved on every scroll pause.** `onScroll` called
   `alignSoon()`, so 80 ms after each pause the hidden editor moved, and the
   webview laid out all of it again. These were the long frames (50 to
   133 ms) of every smooth scroll before; after, there are none.
2. **Every scroll event wrote the viewport** (a forced layout with
   `getBoundingClientRect` and a new `pageViewport`), and the page view
   rendered again, with the marks, since its list of pages was a new array
   on every change of `scrollTop`.
3. **Pages painted synchronously while mounting, and again every time they
   came back**, with `getComputedStyle` on every paint.
4. **The sheets' blurred shadows** cost the compositor on every step in
   "pages": without them, "pages" dropped no frames even before.

**What changed:**
- Scrolling doesn't align the hidden editor any more; the caret moving and
  `compositionstart`/`compositionupdate` still do.
- A scroll is measured once per frame (`requestAnimationFrame`), without
  `getBoundingClientRect` (only a resize measures the view's box), and
  `pageViewport` is written only when a value changed.
- The pages near the view are a range string (`visibleRange`, a bisection),
  so the list of frames, the marks and `shownPages` change only when other
  pages come near. Pages mount within a view's height and stay until two
  views away (`keptRange`), so moving back and forth over the edge doesn't
  drop a canvas and paint it again.
- Pages paint in the next frame through a queue (`pageBitmaps.ts`): the
  pages in view first, whatever they take, the ones just outside after them
  within an 8 ms budget per frame and in later tasks. A page that leaves the
  view is kept as an ImageBitmap (LRU, 192 MB), keyed by page, version,
  size, scale, pixel ratio, theme and loaded images, and drawn from it when
  it comes back. The theme's colour is read once per theme.
- The canvases repaint when the pixel ratio changes (a `matchMedia`
  resolution listener).
- `.page-frame` has `contain: layout style`, and the sheets an edge and a
  solid shadow without blur.

**Not done, and why:** a worker with OffscreenCanvas (available in the
webview) and tiles at 2×: after these changes the frames in view paint in
2 to 10 ms and the measurements show no long frames, so they weren't needed
here. Under xvfb with software rendering the frame times were close to 60 fps
before as well; the owner's lag was on real hardware, which this machine
can't measure, so check it there.

## Decisions for the owner

- **Colour emoji.** The pages and the PDF show emoji in the monochrome Noto
  Emoji, in the text's colour. Colour emoji would need a colour font (Noto
  Color Emoji is 10 MB of bitmaps on Linux, COLRv1 elsewhere) and a painter
  for colour glyphs on the canvas; krilla could embed them in the PDF.
  Default: monochrome, identical on screen and paper.
- **System fonts for other scripts.** Chinese, Japanese, Korean and other
  scripts use the fonts of the system the document is opened on. The screen
  and the PDF are the same there, but another system may lay the same
  document out with another font (other line breaks), and a system without
  such a font shows missing glyphs (boxes), on screen and in the PDF alike.
  Bundling Noto Sans CJK instead would add about 16 MB per weight.
- **Word export:** it keeps its own fonts (Plex Sans embedded, code in
  Courier New) and its own layout; only the PDF is the engine's.

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
  under xvfb, measured from the WebDriver session start. That includes loading
  3 MB of wasm and 4 MB of TTFs, and the first full layout.
- **After step 8** (same setup, times from the window opening, from
  `window.blankBootTimes`):

  | document | engine ready | first layout | pages painted | UI booted | work per key (mean / p95) |
  |---|---|---|---|---|---|
  | 1 page, before | 433 | 526 | 1366 | 1456 | 9.6 / 13 |
  | 1 page, after | 344 | 416 | 1073 | 1143 | 6.3 / 13 |
  | 20 pages, before | 556 | 773 | 1690 | 1882 | 13.4 / 17 |
  | 20 pages, after | 340 | 456 | 1171 | 1324 | 9.4 / 15 |
  | 100 pages, before | 453 | 1046 | 2071 | 2639 | 19.8 / 36 |
  | 100 pages, after | 369 | 552 | 1340 | 1856 | 14.1 / 19 |

  Most of the time between the first layout and the painted pages is the
  webview's first style and layout of the hidden editor's DOM (a forced
  `getComputedStyle` in the first paint took ~2 s in one slow run), which
  today's app pays too for its visible editor. I didn't build main's app to
  measure it side by side (other worktrees were off limits); by the marks,
  the engine adds about 150–200 ms (wasm compile, fonts, first layout)
  before the editor, and the 100-page document shows its pages about
  0.7 s sooner than before this step. Runs vary by ±20 % under xvfb.
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
   page view paints on top of it. Every measurement is ported to the engine's
   geometry now, but any new feature that measures the DOM would measure the
   wrong place; the rule in `editor-boundary.md` says so. The webview's first
   layout of the hidden editor is still most of the start-up of a long
   document.
2. **IME and accessibility:** they rely on a hidden, moved contenteditable,
   a known fragile pattern (SuperDoc, Google Docs' old approach). A real
   composing input method, the screen reader's focus rectangle and speech,
   and macOS and Windows are unverified.
3. **Text rendering:** unhinted outlines with the canvas's grayscale
   anti-aliasing, on whole-pixel baselines: smooth at 1× and 2×, a shade
   lighter than the webview's own text at 1×. No subpixel AA; colour glyphs
   (COLR, bitmaps) aren't painted, hence monochrome emoji.
4. **Typography is Blank's own:** justification, hyphenation and widows
   would have to be built in the engine. The Word export follows its own
   rules, so Word and the PDF can differ (code in Courier New there).
5. **Size and start-up:** 3.1 MB of wasm plus 4.7 MB of TTFs are bundled
   (and 2 MB of Noto Emoji, loaded only when needed); pdfmake and its font
   VFS are gone.
6. **System fonts** make a document with Chinese, Japanese or Korean lay out
   by the fonts of the machine it's opened on.
7. **Tests** need the committed wasm and poppler (pdftotext, pdfinfo,
   pdffonts, pdfimages); without poppler the exactness checks skip. CI's
   wasm check depends on the pinned toolchain.

## Rebuilding

- `make engine` (`bun run engine:build`, `scripts/build-engine.sh`) needs:
  - `rustup target add wasm32-unknown-unknown`
  - `cargo install wasm-bindgen-cli --version 0.2.129 --locked`, which must
    match `wasm-bindgen` in `src-tauri/Cargo.lock`
  - bun, for binaryen's `wasm-opt`
- `cd src-tauri/layout && cargo test`: the engine's unit tests plus
  `tests/exact.rs`, which needs `pdftotext`.
- `bun run test:rust` now runs the whole workspace.
- `cd e2e && E2E_PORT=4482 xvfb-run -a bunx wdio run ./wdio.conf.ts --spec specs/pageEngine.e2e.ts`
  runs the page view E2E and prints the measurements.

## Parallel sessions

From 8efdc17 the review findings are worked on in four worktrees, each with its brief in `TASK.md` (not committed) and its progress in `PROGRESS-<name>.md`:

| Session | Worktree | Branch | Owns | E2E port |
|---|---|---|---|---|
| engine-core | `.claude/worktrees/engine-core` | `engine/core` | `src-tauri/layout/**`, the seam (`SEAM.md`) | 4501 |
| engine-editor | `.claude/worktrees/engine-editor` | `engine/editor` | `src/engine/*.ts`, `src/editor/**` | 4511 |
| engine-ui | `.claude/worktrees/engine-ui` | `engine/ui` | `src/ui/Page*`, the painter, SCSS, `e2e/**`, `docs/guide/**` | 4521 |
| engine-release | `.claude/worktrees/engine-release` | `engine/release` | `.github/**`, build scripts, `src-tauri/src`, notices, `CLAUDE.md`, rules | 4531 |

No branch commits `src/engine/wasm/`: the integrator rebuilds it once per merge. Merge order: core → editor → ui → release, with core's seam commits merged into editor and ui early.
