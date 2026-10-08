---
paths:
  - "src/editor/plugins/find/**"
  - "src/ui/FindPanel.vue"
  - "src/ui/findPanelModel.ts"
  - "src/state/find.ts"
  - "src/ui/pageMarks.ts"
---

# Find and replace

`Mod-f` (`edit.find`) opens the find panel (`FindPanel.vue`), a popover at the top right of the pages that isn't modal: the text stays editable while it's open. `findPanel` (`src/state/find.ts`) is its request; the panel is in `uiTakesFocus` only while the focus is in it (`findFocused`, through `useFocusRegion`, with its F6 stop), and in `controlsStay` while it's open. It isn't in `focusTakingDialogs` (that would stop the window's keys and the editor taking the focus back) nor in `closeRequests`: it stays while the tabs change.

## The plugin (`src/editor/plugins/find/`)

- `state.ts`: `findKey` and what a tab looks for and found (`FindState`), in the tab's editor state, so every tab keeps its own query; `findApply` follows edits by mapping the matches and matching again only the textblocks a transaction changed (`changedRanges`, `textblocks` in `../changed.ts`, shared with the spell check). Typing on a 300-page document with 10,000 matches takes about 3 ms (`find.bench.test.ts`, `BENCH=1`).
- `match.ts`: `compile` (plain text escaped, flags `gu`, `i` unless match case), `matchIn` and `expand` (`$&`, `$1`…`$99`, `$<name>`, `$$` in a regular expression; plain text as it is).
- `commands.ts`: `openFind` (the selection within one textblock, else the tab's last query), `setFind`, `stepFind`, `replaceFound` (moves on to the first match after what it put in), `replaceAllFound` (one transaction, so one step to undo, and "Replaced N"), `closeFind` (with `select`, the current match selected).
- `index.ts`: the plugin; its decorations show the matches only without the engine, and Esc in the text closes the panel.
- The options (`findOptions`) are the panel's, for the session; a tab switch while it's open looks again in the new tab with them. A tab whose panel closed elsewhere stops following edits on its next transaction.

## Matching

- Within a textblock, never across two, and never across an inline node: the text of each textblock is runs between its inline leaves (`runsOf`), and the text inside an inline node with content (e.g. a formula's source) is a run of its own.
- Case is folded with the `i` and `u` flags of the regular expression, not `toLocaleLowerCase`, which can change the text's length and so the positions.
- Whole word checks the characters before and after (`\p{L}`, `\p{N}`, `_`) itself: lookbehind isn't in macOS 12's WebKit (Safari 15).
- Empty matches are skipped; the panel counts up to `COUNT_CAP` ("1000+"), and keeps and highlights up to `STORE_CAP`. Past `STORE_CAP`, edits after the last match kept wait for the next search.
- It never looks in the frontmatter (a doc attribute), the headers and footers, or table captions (a table attribute without a range on the pages): a known gap.

## On the pages

The page view paints the matches from engine geometry, never the editor's DOM: `pageMarks.ts` takes `MarkSource`s (decorations, their kind and the range they cover), and the find matches and the current one are kinds of their own, painted under the text (`MARK_LOOKS`, `.page-find` before the canvas in `PageFrame.vue`) in `--find-color` and `--find-current-color`, which every theme sets (`themes.test.ts` checks them). A match inside an inline node of code paints the whole node (`paintedRange`). Stepping scrolls the match into view with `scrollToText(pos)` without `at`.
