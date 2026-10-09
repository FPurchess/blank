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

- `state.ts`: `findKey` and what a tab looks for and found (`FindState`), in the tab's editor state, so every tab keeps its own query; `findApply` follows edits by mapping the matches and matching again only the textblocks a transaction changed (`changedRanges`, `textblocks` in `../changed.ts`, shared with the spell check). Typing on a 300-page document takes about 2 ms (median) for a word with 10,000 stored matches and about 1 ms with match case, whole word or a regular expression, and a Replace all of 12,000 about 0.9 s, measured at a load of 1.3 on 12 cores (`find.bench.test.ts`, `BENCH=1`). A transaction that counts as changing everything (`changesAll`) makes it search again rather than follow each step.
- `match.ts`: `compile` (plain text escaped, flags `gmu`, `i` unless match case), `matchIn` and `expand` (`$&`, `$1`…`$99`, `$<name>`, `$$` in a regular expression; plain text as it is).
- `commands.ts`: `openFind` (the selection within one textblock, else the tab's last query), `setFind`, `stepFind`, `replaceFound` (moves on to the first match after what it put in), `replaceAllFound` (one transaction, so one step to undo, and "Replaced N"), `closeFind` (with `select`, the current match selected).
- `index.ts`: the plugin; its decorations show the matches in the editor only without the engine and while the panel is open, and Esc in the text closes the panel (after a form's own Esc).
- `apply` is pure apart from the log: it never reads the panel's state. A pattern that can't be read is logged (`logInfo`, it's the user's typo, not a failure) with its reason as it turns unreadable, not on every key typed while it stays so, and never with the pattern, which the user typed: a reason with a slash or over 80 characters is left out (`.claude/rules/logging.md`). Every reader shows the matches only while `findPanel` is open (the page view, the decorations), so a tab whose panel closed elsewhere keeps its search without showing it.
- The options (`findOptions`) are the panel's, for the session; a tab switch while it's open looks again in the new tab with them, and with the panel's query when the tab has none.
- Replacing keeps the marks of the match's first character (`nodeAt`), a link's too, never the ones stored for typing. Replace and Replace all are each a step of their own to undo (`closeHistory`), never merged with what came just before. A transaction of more than `MANY_STEPS` steps, e.g. a Replace all of thousands, counts as changing all of the document (`changedRanges`), which keeps following it linear.
- F3 and Shift+F3 work anywhere while the panel is open, but in a dialog or a menu, which keep their keys. The panel has no ×, like the dialogs: its quiet text button Done (tooltip "Close", Esc) closes it as Esc there does, selecting the match. Without a match (no query, none found, or a pattern that can't be read: `hasMatches`), Previous, Next, Replace and Replace all are `aria-disabled`, focusable still; Done never is. Enter and Esc leave an IME's composition alone (`isComposing`).

## Matching

- Within a textblock, never across two, and never across an inline node: the text of each textblock is runs between its inline leaves (`runsOf`), and the text inside an inline node with content (e.g. a formula's source) is a run of its own. Blank has no such node yet: that branch, `paintedRange` and `MarkSource.range` are for the formulas of `feat/math`, agreed with it. The flags are `gmu` (`i` unless match case): `^` and `$` match at each line of a code block, and next to an inline node, where a run ends.
- Case is folded with the `i` and `u` flags of the regular expression, not `toLocaleLowerCase`, which can change the text's length and so the positions.
- Whole word checks the characters before and after (`\p{L}`, `\p{N}`, `_`) itself: lookbehind isn't in macOS 12's WebKit (Safari 15).
- Empty matches are skipped, by a whole character (V8 would step back into a pair of surrogates for ever); a candidate that isn't a whole word is tried again one character on, so overlapping ones are found. The panel counts up to `COUNT_CAP` ("1000+"), and keeps and highlights up to `STORE_CAP`. Past `STORE_CAP`, edits after the last match kept wait for the next search, and stepping goes around the kept ones only.
- Patterns run as the user types, on every textblock: a catastrophic one can hold the app up (the user docs say so).
- It never looks in the frontmatter (a doc attribute), the headers and footers, or table captions (a table attribute without a range on the pages): a known gap.

## On the pages

The page view paints the matches from engine geometry, never the editor's DOM: `pageMarks.ts` takes `MarkSource`s (decorations, their kind and the range they cover), and the find matches and the current one are kinds of their own, painted under the text (`MARK_LOOKS`, `.page-find` before the canvas in `PageFrame.vue`) in `--find-color` and `--find-current-color`, which every theme sets (`themes.test.ts` checks them). A match inside an inline node of code paints the whole node (`paintedRange`). Stepping scrolls the match into view with `scrollToText(pos)` without `at`.
