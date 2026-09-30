# engine-ui progress

The tasks of `TASK.md`, in the order they are done: 6 first, 5 once S6 is merged.

- [x] 0. CI E2E fixes from the integrator (high priority): screenshots directory (5c17d97), empty composition and column width (f9bbb9a)
- [x] 1. Page 1's header in "page ends" (`PageFirstHeader.vue`), and the edge line without the engine
- [x] 2. A pixel helper, and checks of what is painted (`paintedInk`, `waitForInk`, `screenColor` in `e2e/helpers.ts`)
- [x] 3. Restore the weakened E2E checks (real clicks in `focusEditor`, painted grid lines, underlines and header)
- [x] 4. The view keeps its place when it switches or resizes (`viewAnchor`/`anchorTop`; requests are cleared once served)
- [x] 5. Repaint only the pages that changed, with the bands as their own layer (after S6): body and band canvases with their own versions, jobs and bitmaps (`src/ui/pageLayers.ts`, which reads `pageBody`/`pageBands` from `raw` until engine-editor's `bodyDisplay`/`bandDisplay` land; drop that part then), images repaint only the pages showing them, and the frames' props and margins stay the same objects and numbers while unchanged.
- [x] 6. A swappable painter (`src/ui/painter/`; jsdom canvases record paints, `src/test/canvas.ts`)
- [x] 7. A visible selection in every theme: `--selection-color` at ≥ 3:1 per theme (`src/scss/themes.test.ts`), painted under the text: sheets, selection, the transparent canvases, caret, in DOM order.
  - WebKitGTK doesn't apply `mix-blend-mode` over the pages, and a z-index on the canvases made WebKit composite them and crash in Skia's GPU shaders under xvfb, so neither is used.
  - For the owner: a solid colour between text and paper leaves text over the selection at text-to-paper / selection-to-paper, 2.07:1 in green (6.4:1 / 3.1:1), 2.6:1 in blue. The test asks for 2:1.
- [x] 8. Contrast of the faint marks: `$faint-text-opacity` (0.6) for the page ends, page 1's header, the bands at rest and the page break label, ≥ 3:1 in every theme; the page number keeps only it
- [x] 9. Reduced motion: the caret keeps still and the strips, hints and faded pages change at once under `prefers-reduced-motion: reduce` (`src/scss/motion.test.ts`)
- [ ] 10. Shadows and the desk in dark themes
- [ ] 11. The page number where a page ends
- [ ] 12. Shift + right click
- [ ] 13. Bands open on a double click
- [ ] 14. Small UI details
- [ ] 15. Unit test gaps
- [ ] 16. E2E for engine-editor's fixes
- [ ] 17. Docs and GIFs

## Waiting on

- S6 (engine-core), merged in by the integrator: task 5.
- `HEADER_ROOM` and `FrameLayout.headerRoom` in `src/engine/frames.ts`, and `PageLayoutState.header` filled by `src/editor/plugins/pageView.ts` (engine-editor): until then `pageViewModel.ts` uses `FALLBACK_ROOM`, to drop at integration.
- `engine/editor`: `navigation.e2e.ts` and `withoutEngine.e2e.ts` (task 16).
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
