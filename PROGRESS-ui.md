# engine-ui progress

The tasks of `TASK.md`, in the order they are done: 6 first, 5 once S6 is merged.

- [x] 0. CI E2E fixes from the integrator (high priority): screenshots directory (5c17d97), empty composition and column width (f9bbb9a)
- [x] 1. Page 1's header in "page ends" (`PageFirstHeader.vue`), and the edge line without the engine
- [x] 2. A pixel helper, and checks of what is painted (`paintedInk`, `waitForInk`, `screenColor` in `e2e/helpers.ts`)
- [x] 3. Restore the weakened E2E checks (real clicks in `focusEditor`, painted grid lines, underlines and header)
- [ ] 4. The view keeps its place when it switches or resizes
- [ ] 5. Repaint only the pages that changed, with the bands as their own layer (after S6)
- [x] 6. A swappable painter (`src/ui/painter/`; jsdom canvases record paints, `src/test/canvas.ts`)
- [ ] 7. A visible selection in every theme
- [ ] 8. Contrast of the faint marks
- [ ] 9. Reduced motion
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

(task 5: ms per keystroke at 1, 40 and 200 pages, before and after)
