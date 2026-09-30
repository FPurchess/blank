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
- [x] 8. Images, lists and quotes in table cells (S2)
- [x] 9. Image cache by resolved URL, retried, and no counter
- [x] 10. Drag and drop of text
- [x] 11. The PDF waits for fallback glyphs
- [x] 12. The hidden `TableView` no longer freezes columns
- [x] 13. Page setup and field watchers lay out on the new state
- [x] 14. `frozen` is reset with the plugin view
- [x] 15. Share the fonts between engines (S3)
- [x] 16. Test hooks only in dev and E2E builds
- [x] 17. Dead code, and a parity test of the bands
- [x] 18. Table handles measure only the tables under the pointer
- [x] 19. The Word export's font loader recovers from a failed fetch
- [x] 20. Incremental layout equals a fresh one on real transactions

## Review fixes (resume here)

The integrator's list after the self-review, one commit each, in order. The
branch starts at bcf725b (fast-forward).

Done:
- [x] B1 marks and attribute steps (9854f42)
- [x] M1 settings after an appended transaction (768c433)
- [x] M3 triple click (691a031; the drag machine is `src/editor/pageMove.ts`)
- [x] M2 only a trap breaks the instance, and gives up the page engine (a575ddf)
- [x] M4 a move let go outside the view is cancelled (dcdf83a, 39af364 with
  `e2e/specs/pageMove.e2e.ts`: triple click, move, let go on the bottom bar)
- [x] M7 a press a plugin took moves nothing (66e4946)
- [x] M8 a press on a band keeps the selection (4b42bf1, `BANDS` verbatim)
- [x] M5 handles and toolbar follow a relayout (44b17be)
- [x] m11 `engineMissing` (7b24134)
- [x] M9 `pageHeadBox` (729ac5b)
- [x] M10 already prevented by the serialized lookups; test kept, plus
  `asked` keyed by language (m9 part) (ae78c1e)
- [x] m1 no pages published by a failed engine (83757d2)
- [x] m2 lost moves are cancelled (fd47f76)
- [x] m5 cell selections grow from their anchor cell; Shift+Home/End/PageUp/
  PageDown leave them to the editor (0b52acc)
- [x] roman numerals above 3999 are arabic, as in Rust (acdf3bb)
- [x] m8 warning names once each; the worker's free is guarded (a2e333e)
- [x] m9 images forgotten when another document opens; a 60 s worker timeout
  (e7a6d01)
- [x] m10 `SyncOptions.force` dropped (eae906b)
- [x] m6 the marker on a cell's first text piece (fd733a5)
- [x] m3 text from other apps shows where it drops (28fe97e)

Next, in this order:
1. The flake engine-release saw in `src/main.test.ts`: the 100 ms focus timer
   in `src/editor/index.ts` (~105) fires after jsdom is torn down. Clear it
   when the editor is disposed (or guard `document`), with a fake-timer test.
2. m9 rest: avoid the second worker run after a trap for a document with
   characters not looked up yet. Proposal: a two-step worker protocol (the
   worker lays out and reports `missing`, then gets the fonts and writes the
   PDF), or pass the fonts found for the page engine's last `missing`.
3. m10 rest: set `path` after `updateState` in `applyDocument` callers
   (`src/editor/document.ts`: 58, 72, 110, 172 and the openers that call
   `view.updateState`), so opening a file doesn't lay out the old document
   once more. Take the table re-flatten on entering/leaving a table only if
   small (the frozen key forces a full flatten; the table's block would do).
4. m7: after a mid-session engine failure, scroll the now visible editor to
   the selection (`scrollIntoView` in a rAF after a failure teardown).
5. m4: edge scrolling while moving text (reuse `edgeStep`/`scrollAtEdges`
   in `PageView.vue` for `pageMove`), and a stale drop caret after a wheel
   scroll mid-move.
6. M6: an E2E that presses the ContextMenu key in the plain editor
   (`blank.engine=off`, `restartApp`) to see whether WebKitGTK's key event
   reaches `nativePointer` as a right click; fix only if it reproduces,
   else record it here.
7. Test gaps: the Page Down goal test should start mid-line (goal ≠ x); the
   handles scroll test should check the new box; cover `breakForTest` and
   the strict rethrow; make `InProcessWorker` in `pdf.test.ts` respect
   transfer lists (detach the transferred buffers).
8. Re-check `.claude/rules/tables.md` and `editor-boundary.md` (engine-release
   fixed them in 29b771b) against these fixes: `pageMove.ts`, `pageHeadBox`,
   `engineMissing`, the trap rule, and the handles watching the layout.
9. At the end: lint, format, unit tests with coverage, and the nine specs
   plus `tables.e2e.ts` and `pageMove.e2e.ts`; report the hashes to the
   integrator.

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

- engine-release, engine-ui (test hooks): `window.blankGeometry`,
  `blankPageViewPerf`, `blankBootTimes` and the new `blankBreakEngine()` are
  published only in `bun run dev` and in debug builds:
  `import.meta.env.DEV || __TEST_HOOKS__`, where `vite.config.ts` defines
  `__TEST_HOOKS__` from `TAURI_ENV_DEBUG`, which the Tauri CLI sets for
  `tauri build --debug` (the E2E build). `blankBreakEngine()` makes the page
  engine's next call fail as if the wasm trapped. `blank.engine=off` is not
  gated.

- engine-release (`headers-and-footers.md`): `chapterOn` is gone from
  `src/layout/bands.ts` (nothing used it; the engine finds `{chapter}`
  itself). `src/layout/bands.parity.test.ts` checks that the engine's bands
  are `bandsOn` + `fieldValues` + `expand` for numbering styles, start
  numbers, first and even pages.

- engine-core, integrator (S3): the PDF export's engine is
  `LayoutEngine.withFontsOf(pageEngine.raw)` (`PageEngine.sharing`), which
  also knows the fallbacks already added, so no font bytes go into the wasm
  again per export. The trap worker rebuilds from Blank's font files plus
  `fallbackFonts`, which is the store's order (`fontFileFamily` "" first,
  then the fallbacks as added; a test pins it). Their bytes stay in JS once,
  as they were: reading them back out of the store while healthy would make
  that same one JS copy, and after a trap it can't be read.

- For the rules (engine failures): only a `WebAssembly.RuntimeError` (a
  trap) marks the wasm instance broken. A trap in any engine of it, the PDF
  export's included, gives up the page view's engine too, since they share
  the instance: the editor shows the text itself, and the export goes on in
  the worker. Any other error of the page view's engine gives up that
  engine alone (the instance stays usable for exports); any other error of
  an export is that export's own and fails it, without a worker.
- engine-core (follow-up, not waited for): image blocks in table cells
  (S2) have no `indent`, `marker` or `bars`, so an image in a list item or a
  quote in a cell stands at the cell's left without them. The TS side puts
  the list marker on the item's first text piece meanwhile.

## Verification

At `51f76b9`:
- `bun run lint`, `bun run format:check`, `bun run test` (150 files, 2328
  tests) and `bun run test:coverage` (95.7 % statements, 90.7 % branches).
- `cargo test --manifest-path src-tauri/Cargo.toml -p blank-layout`: 61 + 3
  passed.
- E2E (`E2E_PORT=4511 xvfb-run -a`), the nine specs of TASK.md: editing,
  tables, images, pageEngine, file, launch, persistence, spellcheck, import:
  9 of 9 spec files, 70 tests, passed.
- The PDF worker in the debug app: Vite bundles it as
  `assets/pdfWorker-*.js`; a local probe (not committed) created it with
  `new Worker(…, { type: "module" })` in the webview, and it loaded its own
  wasm and answered (with the engine's own error for the empty job it was
  sent).

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
