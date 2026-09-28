---
paths:
  - "src/**"
---

# Vue migration (in progress)

Blank's UI outside the editor is moving from hand-built DOM to Vue 3.5, one surface per PR, with a review after each. This file tracks where it stands. Delete it in the last PR (G).

## Decisions (made with the maintainer; don't reopen them without asking)

- **Vue 3.5**, the regular VDOM renderer. Not 3.6/Vapor (still an RC, and our keyed lists depend on the v-for fixes it keeps getting), and no homegrown framework.
- **No Pinia.** Shared state lives in central modules in `src/state/<domain>.ts` (from PR A on): module-level `shallowRef`s, `computed`s and action functions behind `src/state/index.ts`. Components, ProseMirror plugins, storage and commands all import the same refs.
- **Composables only for component logic** (`useEditor`, `useRovingFocus`, `usePopupPlacement`, `useFocusTrap`, listeners and timers that clean up). No `use…()` wrapper around shared state.
- **`observable.ts` goes away** in PR A. Vue skips writing an `Object.is`-equal value, so events that may repeat (`announcement`, `spellcheckMessage`) become `{ text, id }` objects written by `announce()` and `flash()`.
- **UI → editor goes through `useEditor()`** (from PR B on): `{ view, state, run(cmd), can(cmd), focus() }`, provided to the app. No refs that trigger editor actions, and no `runCommand(id)`.
- **The editor stays ProseMirror code:** NodeViews (`TableView`, images), decorations, key handling in plugins, and anchor measurement. Vue renders only outside `.ProseMirror`, into `#ui` (see `uiRoot()`), which comes after the editor.
- **Architecture docs for agents live in `.claude/rules/*.md`** with `paths:` frontmatter, not in `CLAUDE.md`.

## Rules that already hold

- Every UI surface is rendered into `uiRoot()` (`src/uiRoot.ts`), never into `document.body` directly. The bars are clickable only because they come after `.ProseMirror`.
- Every `boot…()` of the UI returns a `dispose` function, and tests call it in `afterEach`, so boots don't pile up.
- Editor code never imports a UI module: shared helpers live in `src/editor/keyBindings.ts` (`formatShortcut`), `src/editor/commands/table/pickerSize.ts` (the table picker's sizes) and `src/popup.ts` (`place`, `placeToolbar`).
- Keep every id, class, role, `data-*` and aria attribute that E2E, the docs shots or the unit tests use. The migration must not change what the user sees.
- Modal dialogs boot through `bootDialog(requests, id, render)` (`src/dialog.ts`), which renders one dialog per request and returns `dispose`.
- Shared state lives in `src/state/` as Vue `shallowRef`s. See `state.md` for its rules, and `ui-testing.md` for tests.

## Waiting to be ported

These arrived or are arriving outside the plan's PRs:
- `#table-handles` (`src/tableHandles.ts`, table mouse handles, merged in #65): its own surface, ported after the toolbar. z-index 4, below the toolbar. The plugin publishes only when the table, document, selection, scrolling or window changes, and the overlay tracks the pointer itself. Stable: `.grip.row`, `.grip.column` (`.selected`), `.insert`, `.insert-line`, `.resizers > .resizer[data-index]`, `.edge.right`/`.bottom`/`.corner`, `.guide`, `.dragged`, `.ghost > .size`.
- `#band-header`/`#band-footer`/`#band-editor` (`src/bandStrips.ts`, headers and footers) and `slotEditor`: a surface, plus one editor per slot. That's the multi-editor case `useEditor()` is provided for. The open strip's logic is DOM-free in `src/bandStrip.ts`, so porting it is a template over that module. The strips already call the editor through its handle. z-index: `.band-edge` 5, `.band-editor` 8.
- UI → editor trigger refs to replace with `useEditor()` in PR F: `pageSetupRequests` (a counter). Until then, write a new value each time, since from PR A on an equal write doesn't notify.
- Composables so far: none. `usePopupPlacement` would only wrap `onMounted(place); onUpdated(place)`, and roving focus has one user (the context menu), so both wait for a second real use. A shared text field waits for the dialogs (PR D), whose fields need more than `CaptionField.vue` and `MenuEditField.vue` share (set once, focus, select).
- Context menu (PR C): #68's paste fallback `pasteText(view, text, plain)` and copy fallback `view.serializeForClipboard` stay in `src/editor/contextMenu/model.ts`, which PR C doesn't change. #66's radio items (`MenuItem.radio`: `menuitemradio` with `aria-checked`, used by the strips' First Page and page number menus) render through `roleOf` in `src/ui/menuModel.ts`.

## Status

| PR | Scope | State |
|---|---|---|
| 0 | Prep, no Vue: helpers out of UI files, `uiRoot()`, `dispose` | done (#64) |
| A | `src/state/` with Vue refs replacing `observable.ts`, sync watchers | done (#67) |
| B | SFC tooling, `App`, `useEditor`, table toolbar (go/no-go gate) | done (#69) |
| C | Table picker and context menu | in review (#70) |
| D | Link and image dialogs, `surfaces.ts` registry | not started |
| E | Page setup, delete `dialog.ts` | not started |
| F | Status bars, drop `pageSetupRequests` | not started |
| G | Default flush for non-UI watchers, finish the rule files, delete this file | not started |

## Gate after PR B

All of these must hold, or the migration stops and PR B is reverted:
- `tables.e2e.ts` and `src/ui/TableToolbar.test.ts` pass.
- The table recordings show no unplaced or flickering frame.
- p95 is at most 2 ms per toolbar update while scrolling a long document in `tauri dev`.
- With the keyboard only, the editor never loses focus.
- A button can close the toolbar from inside its own handler.

Result (PR B): passed.
- E2E: 11/11 specs, including every toolbar test.
- The table recordings show no unplaced or flickering frame; differences from main are only capture timing.
- Cost per toolbar update while scrolling, measured in the debug app under xvfb (599 updates each):
  - old imperative toolbar: mean 0.39 ms, p95 1 ms, max 8 ms
  - Vue, first version: mean 1.15 ms, p95 2 ms, max 4 ms
  - Vue with `ToolbarButton` and stable items: mean 0.54 ms, p95 1 ms, max 2 ms
- `performance.now()` is only accurate to about 1 ms there, so the mean is the better comparison.
- Closing the toolbar from its own button's handler works (unit test).
