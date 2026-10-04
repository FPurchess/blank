---
paths:
  - "src/ui/**"
  - "src/ui.ts"
  - "src/scss/**"
  - "src/popup.ts"
---

# Vue components

All of the UI around the editor is Vue 3.5. `bootUI` (`src/ui.ts`) runs after `bootEditor` and only mounts the app (`bootApp`, `src/ui/mount.ts`) into `#ui-app` inside `uiRoot()` (`#ui`, appended to the body after the editor, so the UI paints above the hidden editor and takes its clicks), and keeps the webview's own context menu away (`src/nativeMenu.ts`). `src/ui/App.vue` lists every part, one line each. Shared state is in `state.md`, the editor's side in `editor-boundary.md`, tests in `ui-testing.md`, and how controls look and behave (tokens, states, tooltips, the command list, icons) in `design.md`.

## How components are written

- **`<script setup lang="ts">` single-file components, without `<style>`.** Styles stay in the global SCSS (`src/scss/`), with the themes and the shared type scale. Use the existing classes and ids.
- **Logic goes into `.ts` modules next to the component** (e.g. `src/ui/tableToolbarModel.ts`, named apart from its component), which are unit tested and counted by coverage. Templates stay thin: v8 coverage doesn't count branches in templates.
- **Shared state comes from `src/state/`**, imported directly. Imported refs are unwrapped in the template (`v-if="tableToolbar"`). The editor comes from `useEditor()` (see `editor-boundary.md`). Composables in `src/ui/composables/` are for reusable component logic only, never for state.
- **Props down, callbacks in the state's requests up.** A component gets the state it shows as props, named after what it is: `state` for state it follows (`TableToolbar`, `TablePicker`), `request` for a request it serves (`ContextMenu`), and acts through the callbacks in that state (`item.run()`, `caption.submit()`) or through `useEditor()`.
- **Vapor mode is not used.** Vue 3.6's Vapor is still a release candidate, and our keyed lists depend on the fixes it keeps getting. Components use the regular renderer.
- **No Pinia and no homegrown framework** (decided with the maintainer when the UI moved to Vue; don't reopen it without asking). Central state modules (`state.md`) and `useEditor()` cover what a store would.
- **Composables only once a second place needs them.** So far: `useBodyClass` (the strips' classes on the body) and `useDismiss` (closing on a press outside, the outline's floating list, the strip and the context menu). `IconButton.vue` came with its second place (the table toolbar and the outline's ×). The focus trap lives in `BaseDialog.vue`, which every dialog uses; roving focus is `OptionGroup.vue`, while the context menu keeps its own (it skips disabled items, opens submenus and has typeahead); popups place themselves with `place()` in `onMounted`/`onUpdated`, which a composable would only wrap. `CaptionField.vue` and `MenuEditField.vue` stay apart from `TextField.vue`: their values come back as props while the user types, so they set them once.
- **Editor code never imports a UI module.** Helpers both sides need live outside `src/ui/`: `formatShortcut`, `commandShortcut` and `ariaShortcut` (`src/editor/keyBindings.ts`), the command list's labels (`src/commandList.ts`), the table picker's sizes (`src/editor/commands/table/pickerSize.ts`), `place`, `placeToolbar` and `placeTip` (`src/popup.ts`).

## Rendering rules

- **Popups and toolbars place themselves imperatively.** A popup or toolbar places itself with `place()` / `placeToolbar()` (`src/popup.ts`) in `onMounted` and `onUpdated`, after every render, so it follows its anchor and stays in view when it grows. These write `left`, `top` and `hidden`, so the template must never bind `style`, `left`, `top` or `hidden` on that element, or Vue's next patch would overwrite them. Bind the classes that change the size (like `.keys`), since they apply before `onUpdated` measures. An overlay whose boxes come from state, not from measuring itself (`TableHandles.vue`, from `tableHandlesModel.ts`), binds them as inline styles (`styleOf`) and `hidden`.
- **Fields the user types into** hold their value in the component (`v-model` on a local ref, as `TextField` in the dialogs does, or on a `reactive` object for a form of many fields, like the page setup's choices), never in a prop that comes back from state. A field whose value is only a prop that the parent re-sends while the user types (the toolbar follows the scrolling) sets it once in `onMounted` instead, as `CaptionField.vue` and `MenuEditField.vue` do: a bound `:value` would undo what was typed on the next render.
- **What a component hands to the editor or state holds no proxies.** A `reactive` form proxies every object in it, so keep what it only passes through out of it (the page setup keeps the headers and footers apart) and build the result from its values, as `settingsOf` does. A test checks it with `isProxy`.
- **Buttons and text in templates:** Vue keeps one space around text that stands on its own lines, so tests compare a button's trimmed text (`textContent?.trim()`).
- **Keep updates cheap for state that changes on every transaction or scroll.** Key lists by id (`:key="item.id"`) so elements stay the same. Pass each child the item itself as a prop, not a new wrapper, an inline closure or slot content that uses the loop variable, so Vue skips children that didn't change. Compare `ToolbarButton.vue`: with inline handlers in the `v-for`, every button re-rendered on every scroll event, and an update cost twice as much.
- **Key each part in `App.vue` with `keyOf` by what makes it the same.** A dialog by its request (`keyOf(request)`): a new request mounts a new dialog with fresh fields. The context menu by `keyOf(request.close)`: its suggestions arrive after it opens, and a request with the same `close` patches the open menu, while a `watch` on the prop carries over what should stay (the focused item).
- **Presses keep the focus where it is** (in the editor, or in a menu) with `preventDefault` on `mousedown`, except in text fields: `(event.target as Element).closest("input, textarea")`, as `TableToolbar.vue` and `MenuList.vue` do.
- **Focus after rendering.** A component that moves the focus does it once its DOM exists, in `onMounted` or in `nextTick` after changing its state (`ContextMenu.vue`'s `focusCurrent`). Listeners that only matter while it's open go through `listenOnWindow` in its setup, which removes them when it unmounts.
- **What the keys move between** is found with `shownIn(root, selectors)` (`src/dom.ts`), which leaves out what's inside `[hidden]`: the dialog's Tab trap, the page setup's ↑↓ and the strips' Tab use it.
- **Everything renders through `App.vue`**, into `#ui-app` inside `#ui`, never into `document.body` directly: `#ui` comes after the editor, which is what lets the UI paint above it and take its clicks. A popup of a bar item, whose bar is a stacking context of its own, goes there with `<Teleport to="#ui-app">` (the word count's card). Classes on the body come from `useBodyClass`.
- **Keep every id, class, role, `data-*` and aria attribute** that E2E, the docs shots and the tests use.
- **Stacking:** `#ui` comes after `.ProseMirror`. The z-index layers are set in `src/scss/main.scss` (e.g. the page view 1, the bottom bar and the outline 2, table handles 4, toolbar 5, band edges 5 (first in `App.vue`, so the toolbar paints above them), the open band strip 8, dialog backdrop 10, picker and menus 20, the tooltip 30); keep a new part in line with them, below the backdrop unless it is a modal or a menu. `#page-view` (`PageView.vue`) is fixed over the whole window at 1, above the hidden editor and below everything else; its page canvases (`PageFrame.vue`), marks and overlay (`PageOverlay.vue`: caret, selection, composition) are positioned inside it and have no z-index of their own.

## Components

| Component | What |
|---|---|
| `App.vue` | the Vue part of the UI |
| `TopBar.vue`, `BottomBar.vue` | the bar at the top of the window, and the status bar at the bottom, their text in `statusBarModel.ts` |
| `StatusItem.vue` | an item of the status bar: a button with an optional icon that never takes the focus, its tooltip naming its command's shortcut. Every item below is one |
| `WordCount.vue`, `WordCountCard.vue`, `PageStatus.vue`, `PageButton.vue`, `LanguageChooser.vue`, `SpellcheckStatus.vue`, `MisspellingButtons.vue`, `ViewButton.vue` | the status bar's items, each its own component, so typing only updates the word count. The word count's card opens after the pointer rests on it (`hoverIntent.ts`) or with the Word count command, and counts with `src/wordCount.ts`, which the command shares. "Page N of M" opens its menu of pages as a `contextMenu` request with `owner`, so its own click closes it again; a menu button of the main menu does the same |
| `TableToolbar.vue`, `ToolbarButton.vue`, `CaptionField.vue` | the table toolbar |
| `TablePicker.vue` | the size picker for a new table |
| `ContextMenu.vue`, `MenuList.vue`, `MenuEditField.vue` | the context menu: the open levels and the focus, one level, an item being edited |
| `LinkDialog.vue`, `ImageDialog.vue` | the link and image dialogs, their checks in `linkDialogModel.ts` and `imageDialogModel.ts` |
| `PageSetupDialog.vue` | the page setup, with ↑↓ between its rows in `pageSetupModel.ts` and the choices in `src/layout/choices.ts` |
| `components/BaseDialog.vue` | a modal dialog: backdrop, titled form (`formClass` for its own styles), Esc and backdrop cancel, Tab kept inside, `actions` slot for its buttons |
| `components/TextField.vue` | a labelled text field with an optional hint, `v-model`, and a slot for a button next to it |
| `components/OptionGroup.vue` | a labelled row of option buttons with one in the tab order: a radio group for a value, toggle buttons for a list of values (`v-model`); ←→ Home End move, the logic in `optionGroupModel.ts` |
| `DocumentOutline.vue`, `OutlineEntry.vue` | the outline: the headings as dashes at the right edge, the list floating over the pages or open beside them, one entry; where it shows in `outlineModel.ts`, which heading it marks in `readingLine.ts` (shared with the page counter in `PageStatus.vue`) |
| `BandStrips.vue`, `BandEdge.vue`, `BandEditor.vue`, `SlotField.vue`, `SlotText.vue` | the header and footer strips: both edges and the open strip, one edge at rest, the open strip (its logic in `src/bandStrip.ts`), a slot's ProseMirror editor, a slot as it prints; constants and `shownAtRest` in `bandStripsModel.ts` |
| `composables/useBodyClass.ts` | a class on the body while a condition holds, taken away when the component goes |
| `composables/useDismiss.ts` | closes what a component opened on a press outside it and what belongs to it, optionally on Escape, any key, blur or resize; returns `contains` |
| `TableHandles.vue` | the mouse handles of the table under the mouse: grips, the "+", the column lines, the edges and the drag previews, where they go and what a drag does in `tableHandlesModel.ts` |
| `components/IconGlyph.vue` | an icon of `src/icons.ts`, 16px or `size="large"` 20px |
| `components/IconButton.vue` | a button that shows only an icon: its label for screen readers and the tooltip, a command's shortcut, `pressed`, `disabled` (aria-disabled), `focusable` |
| `UiTooltip.vue` | the shared tooltip of controls, mounted once; what it shows and when in `tooltipModel.ts` (`tipAttrs`, `watchTips`), its timer in `hoverIntent.ts` |

Add reusable components to `src/ui/components/` when a second place needs them, not before: `BaseDialog` and `TextField` came with the second dialog. A new part of the UI is a component in `src/ui/`, a line in `App.vue` (keyed by what makes it the same), and its logic in a `…Model.ts` next to it.
