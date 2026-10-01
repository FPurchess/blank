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
  - Superseded by the selected text in a colour of its own (Review fixes, Selection).
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
- [x] M2. E2E ink checks after an edit prove the repaint, not old pixels: `waitForRepaint` compares a fingerprint of the line (`inkPrint`) from before the edit; with the body's repaint switched off the check times out
- [x] M5. The engine-failure spec places the caret first, checks nothing failed before the key, and types and finds a word of its own
- [x] M6. The last rendering check waits for the first page and compares its ink with the first reading
- [x] Selection: with the focus, each page with a selection paints a layer of its own over its text: the selection rects filled with `--selection-color`, and the glyphs within them in `--selection-text-color`, clipped to the rects, painted again only when that page's selection changes; without the focus, the lighter `--selection-inactive-color` stays under the text in its usual colour. Shots per theme: `e2e/screenshots/selection-<theme>.png` (from `rendering.e2e.ts`, which also checks both ratios on screen).

  | theme | selection | selected text | selection : paper | text : selection | dimmed : paper | text : dimmed |
  |---|---|---|---|---|---|---|
  | light | `#3874d6` | `#ffffff` | 4.54 | 4.54 | 2.0 | 7.5 |
  | dark | `#6782a8` | `#11191f` | 4.51 | 4.51 | 2.0 | 7.2 |
  | black | `#637a9f` | `#0a0a0f` | 4.54 | 4.54 | 2.0 | 8.9 |
  | red | `#8b9cc7` | `#532728` | 4.54 | 4.54 | 2.0 | 4.8 |
  | green | `#87a8d4` | `#323f37` | 4.52 | 4.52 | 2.0 | 3.2 |
  | blue | `#7c9bcc` | `#25324c` | 4.52 | 4.52 | 2.0 | 4.1 |
- [x] 1. The edge line follows `engineMissing` at runtime (engine-editor sets it in `useFallbackEditor`; until then the class at boot still works)
- [x] 3. The view keeps its place when the header or properties room changes (`movesPages`)
- [x] 4. A switch renders the target range right away (the watcher sets `scrollTop` before the render; no test can tell it apart in jsdom's small documents, the switch test still covers the result)
- [x] 6. Queued paints: cancelled on early returns, and a failing job doesn't strand the queue
- [x] 7. The bitmap cache is cleared once the engine is missing (`engineMissing`) and keeps one bitmap per page layer and scale, the newest
- [x] 8. Less work per key: the first header reads the engine only when page 1's band version changes and only in "page ends", and the overlay reads its layer before the refs
- [x] 9. "Page N of M" shows the physical position (the owner's choice); a stable, visually hidden live region (`#ui-page-spoken`) says only "Page N" when the page changes (`StatusBars.test.ts` lists it in the bar)
- [x] The integrator's band spacing (BAND_GAP 32): looked at in both views and all six themes; the hover over page 1's header and the page-end bands now covers their line of text only, and the page number where a page ends ends where the text does. `bands.e2e.ts` checks that every band's left and right slot, and the number, are within 1 px of the text's edges.
- [x] Spell check while typing (the owner's top priority): the marks are worked out per page (`PageMarksMemo` in `pageMarks.ts`), again only when the page's body version or the marks on it, relative to its start, change. They are keyed by their place on the page and rendered inside each `PageFrame` from one string, so typing elsewhere renders none of them again. The page view reads the decorations and the doc through computeds, so a selection-only transaction works nothing out. Measured with `e2e/specs/spellcheckTyping.e2e.ts` (`E2E_PERF=1`; 150 paragraphs of English checked as German, a 59-character sentence typed), with two binaries run in turns under the same load:

  | build | off | on: 1st / 2nd / 3rd | frames over 50 ms, on |
  |---|---|---|---|
  | before | 2246 ms | 5920 / 6173 / 6337 ms | 59 / 59 / 60 |
  | after | 2483 ms | 2787 / 2732 / 3206 ms | 2 / 1 / 3 |
  | before | 2716 ms | 5857 / 5908 / 5879 ms | 59 / 59 / 59 |
  | after | 2755 ms | 3116 / 2854 / 2876 ms | 3 / 1 / 2 |

- [x] 10. `layerOf` in `src/ui/pageLayer.ts`, `frameRenders` counted only in dev and test builds (`import.meta.env.DEV || __TEST_HOOKS__`), one colour cache for all frames (`themeColors`), the page break of "page ends" at `$faint-text-opacity`; the rule file's wording is the integrator's
- [x] 11. The test gaps: the paint count has a lower bound and the page counts are asserted; the settle wait uses `blankGeometry.laying()` once engine-editor adds it; `waitForInk` defaults to 5 %, and the header check reads only `.page-bands.header`; the grid check waits; the single click waits past the double-click time; `screenStats` clamps to the screenshot; End must move the caret; `motion.test` checks every animation and transition (a missing one fails); every page's bands and exact render counts in `PageFrame.test`; the recording canvas records colour and alpha and clears on a resize; `parseColor` throws on NaN; only a leading empty composition is dropped
- [x] 5. The IME aligns at `pageHeadBox`, the head as the plugin paints it, with its line's affinity (on the base since 194178c)
- [x] 2. Shift + right click: `spelling.md`, `nativeMenu.ts` and `contextMenu.ts` say it opens the system menu in the editor without the pages and Blank's menu on the pages

## Where it stands (2026-10-01, 00:10), and what's next

Done and committed tonight (after 2af95a1, the tables docs): M4 0692409, M3 3356a08, M2 4ff1bec, M5 6874f42, M6 8b1b44e, selection ca36ab2, minor 1 639af62, 3 e7aba64, 4 c463ebd, 6 f44a4fc, 7 1b200ee, 8 dbfefda, 9 28e3d88, 2 3f33644. Each passed lint, format:check and the unit tests in the pre-commit hook. The E2E specs each item touches passed on a fresh build (M2's check also failed as it should with the body's repaint switched off). The full E2E suite has not run since M4.

Next, in this order:
1. Minor 10:
   - move `layerOf` out of `PageFrame.vue` into a `.ts` module next to it
   - put `frameRenders` behind `__TEST_HOOKS__`
   - make the page break's opacity in "page ends" (`main.scss`, `#page-view.page-ends .page-break-mark`, `opacity: 0.6`) a theme variable, or `$faint-text-opacity`
   - reword "a click" to "a double click" in `.claude/rules/headers-and-footers.md:97/100` (ask the integrator first: `.claude/rules` isn't ours)
   - the colour cache is done: module-level `themeColors` in `pageLayers.ts`, with the selection
2. Minor 11, the test gaps:
   - a lower bound for the typing paint count, and the page count asserted
   - a real signal that the layout is done, instead of the 1 s settle
   - `waitForInk` minimums raised, and the header check reading only `.page-bands`
   - `expectGridPainted` in a `waitUntil`
   - the single-click check waiting past the double-click time
   - `screenStats` clamping at the right and bottom
   - End on a long URL also checking that x moved
   - `motion.test` collecting every animation and transition
   - `PageFrame.test` "bands only" checking every mounted page, and renders `toBe(1)`
   - the recording canvas recording `globalAlpha` and `fillStyle`
   - `parseColor` throwing on NaN
3. (done) Minor 5, once engine-editor's line has landed: switch `headBox` in `PageView.vue` to `pageHeadBox`, adding this line to `src/state/pageView.ts` right after `pageCaret`, identical:
   `// where the selection's head is painted, with its line's affinity (see SEAM.md S1), e.g. for the input method's window; null without pages`
   `export const pageHeadBox = shallowRef<PageRect | null>(null);`
4. Then the full check: `bun run lint`, `bun run format:check`, `bun run test:coverage`, the full E2E suite (`cd e2e && E2E_PORT=4521 xvfb-run -a bunx wdio run ./wdio.conf.ts`), and `make docs-screenshots` (the selection only shows in the E2E shots, `e2e/screenshots/selection-<theme>.png`, so the docs' stills shouldn't change; check).

For others:
- M1 (a press on a band inside a selection collapses it) is with engine-editor, in `pageMove.ts`, with the `ignores` option. `BANDS` stays in `PageView.vue`.
- A flake that isn't ours: `src/main.test.ts` once reported an unhandled "document is not defined" from the 100 ms focus timer in `src/editor/index.ts:105`, which fired after jsdom was torn down (every test passed; the next run was clean). For engine-editor.

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
