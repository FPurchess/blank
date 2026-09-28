# Spike: Blank's own layout engine (Option C)

One layout, done by a Rust engine (Parley for text, krilla for the PDF),
drives both the page view on screen and the exported PDF. ProseMirror stays,
hidden, for the model, commands, undo, input rules, IME and clipboard.

## Status / how to resume

Work was interrupted (machine shutdown). State of the branch
`spike/page-view-engine`:

### Done
- `src-tauri/layout/` (crate `blank-layout`, a workspace member of
  `src-tauri/Cargo.toml`, lockfile stays `src-tauri/Cargo.lock`):
  - `model.rs` serde input (items, settings), UTF-16 ↔ byte mapping
  - `fonts.rs` fonts from bytes (no system fonts), glyph outlines as SVG paths
  - `style.rs` text styles mirroring `src/exporters/pdf/template.ts`
  - `text.rs` one textblock with Parley: lines, glyph runs, caret, hit, word,
    line bounds, selection rects
  - `items.rs` items → units (lines, table rows, images, rules, breaks)
  - `engine.rs` pagination (headings kept with next block, new-page-before
    levels, page breaks, images whole, table rows with repeated header rows),
    incremental update (re-lays out only changed items, re-paginates from the
    page of the change until page starts settle, copies the rest), bands
    (`bands.rs`, port of `src/layout/bands.ts`/`tokens.ts` incl. `{chapter}`),
    caret/hit/word/vertical/line-edge/selection queries, page display lists
  - `pdf.rs` krilla PDF from the same display lists (subset fonts, links,
    title/author metadata, images)
  - `wasm.rs` wasm-bindgen API (`LayoutEngine`), only on wasm32
  - Rust tests: 22 unit tests + `tests/exact.rs`, which writes the PDF and
    re-reads every word's page and box with `pdftotext -bbox`: all words match
    the layout within 0.05 pt (A4 and A5 landscape samples). All pass.
- `scripts/build-engine.sh` builds the wasm into `src/engine/wasm/`
  (git-ignored). The wasm is ~4.0 MB (1.2 MB gzipped), opt-level 3, LTO, no
  wasm-opt.
- `src/engine/flatten.ts` (untested, not yet wired): ProseMirror doc → engine
  items with the pdfmake spacing, list markers, quote bars, image pieces,
  tables; `diff` for incremental updates by node identity.
  `src/engine/types.ts`: the item types.

### Next steps
1. `src/engine/engine.ts`: load the wasm (`import init from "./wasm/blank_layout.js"`
   with the `?url` of the `.wasm`) and the TTFs from `fonts/` (`?url` imports,
   order = `FONT_FILES` in `fonts.rs`), wrap `LayoutEngine`; `sync(doc)` using
   `flatten` + `diff` → `update`; `setSettings(layout, fields)` from
   `pageLayout`/`pageFields`. Boot it in `main.ts` before `bootEditor`.
2. Unit tests for `flatten.ts`/`diff` (vitest; the wasm can be loaded in
   tests with `initSync` from the file's bytes).
3. State `src/state/pageView.ts`: `pageView` mode ("page-ends" | "pages"),
   persisted in `storage.ts` like `spellcheck`; the published layout
   (page count, versions, bottoms) and caret/selection rects; "Page N of M".
4. Editor plugin `src/editor/plugins/pageView.ts`: sync the engine on doc
   changes, publish caret/selection, ArrowUp/Down/Home/End through the engine,
   `handleScrollToSelection` → true; hide `#editor` offscreen (opacity 0,
   fixed, pointer-events none) and move it so its caret sits on the painted
   caret (IME window).
5. Vue: `src/ui/PageView.vue` (+ `pageViewModel.ts`: frames per page for both
   views, scale, visible range), `PageCanvas.vue` painting a page's display
   list with cached `Path2D` glyph outlines (`glyphPath`, `unitsPerEm`),
   caret/selection overlay, clicks/drags/double-click via `hit`/`word` and
   `editor.run(...)`. Theme colors from CSS variables.
6. Command `view.toggle_page_view` (Mod-Alt-v) in the four places of
   CLAUDE.md + `docs/guide/shortcuts.md`.
7. PDF export through the engine: `src/engine/pdf.ts` exporterFunc
   (images via `prepareImages` → `addImage`), wired in `keymap.ts`.
8. Exactness script over the real pipeline (flatten + wasm + pdftotext) for
   `src/editor/welcome.md`; measurements (typing latency, layout, paint for
   1/20/100 pages, wasm size, binary size change); finish this file.

### Commands
- `cd src-tauri/layout && cargo test` (needs `pdftotext` for `tests/exact.rs`)
- `rustup target add wasm32-unknown-unknown`,
  `cargo install wasm-bindgen-cli --version 0.2.129 --locked`, then
  `./scripts/build-engine.sh`

### Open questions
- Glyphs are painted as unhinted outlines (`Path2D`); check the text quality
  against the browser's own text rendering in WebKitGTK.
- The wasm size (4 MB); try `opt-level = "s"` and wasm-opt.
