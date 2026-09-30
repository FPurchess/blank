# engine-editor progress

The tasks of `TASK.md`, plus A and B from the integrator. The integrator
deletes this file on merge.

## Tasks

- [x] 1. An engine error never blocks boot or breaks editing (B2, JS side)
- [x] B. `blank.engine=off` starts Blank without the engine
- [x] 2. Without the engine, a fully usable plain editor (B3)
- [x] A. `HEADER_ROOM` above the first page's header in "page ends"
- [x] 3. ↑/↓ and End keep the line affinity (S1)
- [x] 4. Flatten only the blocks a transaction changed; changes apart go in one `updateMany`, and the body and bands have displays of their own (S6)
- [x] 5. One unit for the column goal of ↑/↓ and Page Up/Down
- [x] 6. Keyboard and mouse make cell selections in tables
- [x] 7. Cells that share a node object get their own positions
- [ ] 8. Images, lists and quotes in table cells — waiting for S2
- [x] 9. Image cache by resolved URL, retried, and no counter
- [x] 10. Drag and drop of text
- [x] 11. The PDF waits for fallback glyphs
- [x] 12. The hidden `TableView` no longer freezes columns
- [x] 13. Page setup and field watchers lay out on the new state
- [x] 14. `frozen` is reset with the plugin view
- [ ] 15. Share the fonts between engines — waiting for S3
- [ ] 16. Test hooks only in dev and E2E builds
- [ ] 17. Dead code, and a parity test of the bands
- [ ] 18. Table handles measure only the tables under the pointer
- [ ] 19. The Word export's font loader recovers from a failed fetch
- [ ] 20. Incremental layout equals a fresh one on real transactions

## Notes for the other streams

- engine-ui: every call into the engine goes through `PageEngine`'s guard.
  Production code must not call `engine.raw` (tests may). After a failure,
  `pageEngine` is null, `pageEngineReady` notifies with null, and
  `body.without-engine` is set; `engineless()` and `engineStatus()` in
  `src/engine/engine.ts` tell why.
- engine-ui, engine-release: after a trap, the PDF export runs in a worker
  (`src/engine/pdfWorker.ts`, built by Vite from
  `new Worker(new URL("./pdfWorker.ts", import.meta.url), { type: "module" })`)
  with a wasm instance of its own, since the wasm-bindgen glue keeps one
  instance per module and `initSync` does nothing once it has one.
- engine-core: the worker needs the font bytes (base files and fallbacks);
  S3 must keep them obtainable (`fontFile(i)`), see task 15.
- engine-ui: `localStorage.setItem("blank.engine", "off")` before a start
  (read in `bootEngine`, in a try/catch) starts Blank without loading the
  wasm; `engineStatus()` is then "off", the same fallback as "unavailable".
- engine-release (`editor-boundary.md`): without the engine (`engineless()`),
  `src/engine/geometry.ts` measures the visible editor with `coordsAtPos`,
  `posAtCoords`, `domAtPos` and `nodeDOM`, since the editor shows the text
  itself then. That's the one other exception to "never measure the
  editor's DOM". `bootEditor` hands the view to it with `setGeometryView`.
  The plugin `nativePointer` (`src/editor/pagePointer.ts`) turns the
  editor's own mousedown and right click into `PAGE_PRESS`/`PAGE_MENU`
  then, so plugins handle only those; the table toolbar and handles also
  place themselves again on scroll then.
- engine-ui: the PDF export's text without the engine is `PDF_UNAVAILABLE`
  in `src/editor/commands/exportAs.ts`, sent as a notification and through
  `announce()` (so `#ui-announcement`), for "off" and "unavailable". After a
  runtime failure ("failed"), PDF export still works (worker).
- engine-ui: `PageLayoutState.header` (added here word for word as agreed)
  is filled from `engine.bands(0)`; `FrameLayout.headerRoom` is
  `HEADER_ROOM` (20) in "page ends" when it's set, else 0.
- engine-ui: the page view's images are known by their url
  (`displaySrc(src, path)`). `loadedImages` (`src/engine/images.ts`) is the
  set of loaded urls, replaced whole with each; `imagesLoaded` is now its
  size, a computed kept for `PageFrame.vue`'s bitmap key. That key doesn't
  name the document, so the same page and version of another document may
  reuse a stale bitmap.

- engine-ui (S6): `pageLayoutState` has `bodyVersions` and `bandVersions`
  (next to `versions`, the combined one, kept); `PageEngine.bodyDisplay(page,
bodyVersion)` and `bandDisplay(page, bandVersion)` read `pageBody`/
  `pageBands`, each cached by its own version. `display()` is deprecated
  and still works.

- engine-release (`editor-boundary.md`): `TableView` no longer has
  `freeze()`/`unfreeze()`; it only renders the caption and the widths set on
  the table. The engine keeps the columns of the table the cursor is in
  (`frozenWidths`). In the fallback editor without the engine, the columns
  now size to their content while typing (accepted by the integrator).

- engine-ui (drag and drop): the hunk in `PageView.vue` adds pointer
  listeners (`pointerdown`/`pointermove`/`pointerup`/`pointercancel`) that
  drag the selected text (a press in it, then a move of 4 px), and
  `dragover`/`dragleave`/`drop` for text from other apps. `onMouseDown`
  returns early while such a press is pending. `pageDropCaret` (added here
  word for word) holds where it would drop; please paint it. A drag moves
  the text, and copies it with Ctrl (Option on macOS), as ProseMirror does.
  The E2E for it is yours (task 16).

## Measurements

Task 4, stage 1: ms per keystroke, from `pageEngine.e2e.ts`' "measures
typing" (44 keys each, debug build under xvfb), mean / p95. The spec
measures about 1, 20 and 100 pages (54–59 pages as laid out). The machine
was shared with the other streams' builds and E2E runs, so these are rough:
the "before" run booted about three times slower than the "after" one.

| pages | layout before | layout after | dispatch before | dispatch after |
| ----- | ------------- | ------------ | --------------- | -------------- |
| 1     | 5.95 / 16     | 1.80 / 6     | 11.51 / 30      | 5.11 / 18      |
| 20    | 9.27 / 18     | 3.41 / 8     | 15.94 / 38      | 7.60 / 16      |
| 100   | 4.41 / 7      | 3.70 / 10    | 7.24 / 11       | 12.74 / 29     |

The JS side now flattens only the block typed in (see the spy test in
`src/engine/incremental.test.ts`); what's left per key is the engine's own
layout and the painting.
