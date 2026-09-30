# engine-ui progress

The tasks of `TASK.md`, in the order they are done: 6 first, 5 once S6 is merged.

- [x] 0. CI E2E fixes from the integrator (high priority): screenshots directory (5c17d97), empty composition and column width (f9bbb9a)
- [x] 1. Page 1's header in "page ends" (`PageFirstHeader.vue`), and the edge line without the engine
- [x] 2. A pixel helper, and checks of what is painted (`paintedInk`, `waitForInk`, `screenColor` in `e2e/helpers.ts`)
- [x] 3. Restore the weakened E2E checks (real clicks in `focusEditor`, painted grid lines, underlines and header)
- [x] 4. The view keeps its place when it switches or resizes (`viewAnchor`/`anchorTop`; requests are cleared once served)
- [x] 5. Repaint only the pages that changed, with the bands as their own layer (after S6): body and band canvases with their own versions, jobs and bitmaps (`src/ui/pageLayers.ts`, on `PageEngine.bodyDisplay`/`bandDisplay` and the versions `pageLayoutState` publishes), images repaint only the pages showing them, and the frames' props and margins stay the same objects and numbers while unchanged.
- [x] 6. A swappable painter (`src/ui/painter/`; jsdom canvases record paints, `src/test/canvas.ts`)
- [x] 7. A visible selection in every theme: `--selection-color` at ≥ 3:1 per theme (`src/scss/themes.test.ts`), painted under the text: sheets, selection, the transparent canvases, caret, in DOM order.
  - WebKitGTK doesn't apply `mix-blend-mode` over the pages, and a z-index on the canvases made WebKit composite them and crash in Skia's GPU shaders under xvfb, so neither is used.
  - For the owner: a solid colour between text and paper leaves text over the selection at text-to-paper / selection-to-paper, 2.07:1 in green (6.4:1 / 3.1:1), 2.6:1 in blue. The test asks for 2:1.
- [x] 8. Contrast of the faint marks: `$faint-text-opacity` (0.6) for the page ends, page 1's header, the bands at rest and the page break label, ≥ 3:1 in every theme; the page number keeps only it
- [x] 9. Reduced motion: the caret keeps still and the strips, hints and faded pages change at once under `prefers-reduced-motion: reduce` (`src/scss/motion.test.ts`)
- [x] 10. Shadows and the desk in dark themes: `--desk-color`, `--sheet-edge`, `--sheet-shadow` per theme, a darker desk and black shadows without blur (unit test, and a pixel check of the desk against the sheet in every theme in `pageEngine.e2e.ts`)
- [x] 11. The page number where a page ends: the page's number as the pages are numbered (style, start number), shown unless its footer's settings hold `{page}`
- [x] 12. Shift + right click opens Blank's menu too
- [x] 13. Bands open on a double click; a press on them still reaches the plugins (`PAGE_PRESS`) and leaves the selection
- [x] 14. Small UI details: the caret on whole device pixels, "Page N of M" numbered as the pages are and announced (`role="status"`), long band text cut with an ellipsis, the text cursor only over the pages
- [x] 15. Unit test gaps: jsdom canvases record paints (`src/test/canvas.ts`, no getContext warnings), and tests of the theme repaint, the dimmed selection and focus, the marks near the view only, and the view switch (task 4)
- [x] 16. E2E for engine-editor's fixes: `e2e/specs/navigation.e2e.ts` (↓↓↑↑ over ragged lines, End on a long URL, Shift+↓ and a drag across cells, dragging a selected word) and `e2e/specs/withoutEngine.e2e.ts` (the `blank.engine` switch: the header at the edge, typing past the fold, the menu at the click, the table toolbar, the PDF message; and `window.blankBreakEngine` while running). All pass with engine/editor merged (27e5ac0).
- [x] 17. Docs and GIFs: `page-views.gif` of Mod-Alt-V in "Your pages on the screen" (the screen matches the PDF, not the Word file), page 1's header and the double click in `pages.md`, `writing.md:26` rewritten for the user, the Editing table in `shortcuts.md` aligned, the PDF list in `files.md`, the mouse and the third-party notices in `faq.md` (linked on GitHub; `public/THIRD-PARTY-NOTICES.txt` arrives with engine/release), and `table-mouse.gif` re-recorded (the "+" is clicked as an element now, and the row move and the "+" take). All shots regenerated with `make docs-screenshots`.
  - `docs/guide/tables.md:140` stays until the integrator says merged cells and lists in cells have landed.

## Review fixes

From the self-review (the integrator's order; M1 is with engine-editor):

- [x] M4. A removed bands canvas is freed: `Painter.release`, called when a layer's canvas goes and after a leaving page's copy is taken
- [x] M3. The bands as strip canvases sized to the margins, painted with a y origin and not kept as bitmaps. At 2× in "pages", the 192 MB cache kept 7 pages before (14 bitmaps, 199.6 MB) and keeps 14 after (`PageFrame.test.ts`, "keeps a dozen sheets")
- [ ] M2. E2E ink checks after an edit prove the repaint, not old pixels
- [ ] M5. The engine-failure spec types and finds a token of its own
- [ ] M6. The last rendering check waits and compares with the first reading
- [ ] Selection: the selected text in a contrasting colour, on a layer of its own, at 4.5:1 in every theme
- [ ] 1. The edge line follows `engineMissing` at runtime
- [ ] 3. The view keeps its place when the header or properties room changes
- [ ] 4. A switch renders the target range right away
- [ ] 6. Queued paints: cancelled on early returns, and a failing job doesn't strand the queue
- [ ] 7. The bitmap cache is cleared on an engine change and drops a page's superseded key
- [ ] 8. Less work per key in the first header and the overlay's under layer
- [ ] 9. "Page N of M": a stable live region, announcing a change of page only
- [ ] 10. layerOf in a .ts module, frameRenders behind `__TEST_HOOKS__`, one colour cache, the page-break opacity as a theme variable, the rule file's wording
- [ ] 11. The test gaps
- [ ] 2. Shift + right click: the docs and comments say what each path does

## Waiting on

- Merged cells and block content in cells: the limit line at `docs/guide/tables.md:140` stays until the integrator says.

## Measurements

Task 5, typing 44 keys on page 1 in the "measures typing" tests of `pageEngine.e2e.ts` (debug build under xvfb), means in ms per key. `work` is the key's work until the next task, `frame` until the frame that shows it. Paint is what task 5 changes; dispatch and layout aren't touched by it, and differ with the machine's load (other builds ran alongside, load average about 8 after, not recorded before), so compare them with care.

| pages | | work | frame | dispatch | layout | paints | paint |
|---|---|---|---|---|---|---|---|
| 1 | before | 6.6 | 20.8 | 1.9 | 0.6 | 44 | 2.0 |
| 1 | after | 9.2 | 23.9 | 2.2 | 1.0 | 44 | 1.2 |
| 40 | before | 10.5 | 33.0 | 3.8 | 2.0 | 44 | 3.8 |
| 40 | after | 15.3 | 41.4 | 4.7 | 2.6 | 44 | 2.8 |
| 200 | before | 28.1 | 60.8 | 12.1 | 7.7 | 44 | 4.4 |
| 200 | after | 39.3 | 83.0 | 15.5 | 9.9 | 44 | 3.2 |

Typing painted one page per key before too; the page's paint is cheaper now, without its header and footer. What task 5 saves most isn't in these numbers: a new page no longer paints every page's text again for `{pages}` in the footers, only their band layers (`PageFrame.test.ts`).
