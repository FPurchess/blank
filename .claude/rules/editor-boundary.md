---
paths:
  - "src/editor/**"
  - "src/ui/**"
  - "src/ui.ts"
  - "src/table*.ts"
  - "src/state/focus.ts"
---

# Between the editor and the UI

Blank's text is a ProseMirror editor; the UI around it (bars, dialogs, menus, pickers, toolbars) is Vue, or imperative modules that are being ported (see `vue-migration.md`). This file is about where one ends and the other begins.

## What stays ProseMirror code

- **Everything inside `.ProseMirror`:** node views (`TableView` in `plugins/tables/view.ts`, the image view), decorations (spell check), mark views (`openLink`), the properties widget. `TableView.ignoreMutation` only lets ProseMirror see mutations inside its `contentDOM`, and it renders the caption and the column widths set on the table into `<colgroup>`. A Vue patch in there would either be read back as a document edit or reset those widths.
- **Keys.** The editor keeps the focus while a picker or table mode is open, and plugins handle the keys: `plugins/languagePicker.ts`, `plugins/tables/picker.ts`, `plugins/tables/tools.ts`. UI components only render what those plugins publish.
- **Measuring the text: through the engine, never the editor's DOM.** The page view (`src/ui/PageView.vue`) paints the text as the layout engine laid it out, and the editor's own DOM is hidden and laid out differently. So `coordsAtPos`, `posAtCoords` and `nodeDOM(pos).getBoundingClientRect()` measure the wrong place. Use `src/engine/geometry.ts` instead: `caretBox`, `rangeRects`, `blockBoxes`, `tableGeometry` and `hitAt`, in viewport coordinates like `getBoundingClientRect`. To scroll to text without moving the selection (the outline's jumps), use `scrollToText`, with `scrollTops` (where text starts in what scrolls, worked out once per layout) and `scrollState`. Plugins measure with it and publish plain boxes (`Anchor`, `TableToolbarState.anchor`); the UI places itself with them. It follows `pageViewport` (where the page view is and how far it scrolled), which plugins watch to place again, instead of listening to `scroll`. The exceptions: `src/editor/hidden.ts` measures the hidden DOM on purpose, to move its caret under the painted one for the IME; and without the engine (`engineless()`: `localStorage["blank.engine"] = "off"` started Blank on the plain editor, the wasm couldn't load, or it stopped working while Blank ran), `body.without-engine` shows the editor itself, so `src/engine/geometry.ts` measures that visible editor with `coordsAtPos`, `posAtCoords`, `domAtPos` and `nodeDOM` (`bootEditor` hands it the view with `setGeometryView`). The plugins still measure only through the geometry, in both cases. Without the engine, `nativePointer` (`src/editor/pagePointer.ts`) also hits the visible editor's own presses and right clicks with `posAtCoords`, and sends them on as `PAGE_PRESS` and `PAGE_MENU`.
- **The pointer on the pages:** with the engine, the hidden editor gets no mouse events. The page view hits a press and a right click through the layout and sends them to the editor as the DOM events `PAGE_PRESS` and `PAGE_MENU` (`src/editor/pagePointer.ts`), with the position and the link under the point. Plugins handle them in `handleDOMEvents` (`[PAGE_PRESS]: …`) where they handled `mousedown` and `contextmenu` before; a plugin that takes a press calls `preventDefault()`, and the page view then leaves the selection alone. A press in the selected text may move it: `src/editor/pageMove.ts` takes the page view's pointer events (a move past 4 px drags, a release outside the pages or on the bars cancels, presses on bands and presses a plugin took never move), drops through `pageDrop` (`src/editor/commands/pageDrop.ts`), shows the drop point in `pageDropCaret`, and the view scrolls at its edges while dragging. Text from other apps drops through `dropExternal` (`src/editor/pagePointer.ts`), as a paste there. A middle click on the pages pastes the primary selection, as other apps on Linux do: `pastePrimary` (`src/editor/pagePointer.ts`) puts the caret where it was clicked and pastes the text of `read_primary` (`src-tauri/src/primary.rs`, Linux only: GTK's PRIMARY clipboard, read through `run_on_main_thread` with a 500 ms timeout), as plain text.
- **The engine lays out first:** `pageSync` (`plugins/pageView.ts`) is the first plugin, so the plugin views after it measure the new layout in their `update`.

Vue renders only outside `.ProseMirror`, into `#ui` (`uiRoot()`), which comes after the editor in the body.

## Editor → UI: state

A command or plugin opens a part of the UI by writing its state in `src/state/` (a dialog request, `tableToolbar`, `contextMenu`, ...). That state is what the UI shows, with callbacks into the editor. Write only what changed: for state published on every transaction or scroll (like `tableToolbar`), reuse unchanged parts. `tools.ts` keeps the same `items` while the editor's state is the same, so the toolbar's buttons don't update while scrolling.

## UI → editor: `useEditor()`

Components work with the editor through the handle that `bootEditor` returns and `bootApp` provides (`src/editor/handle.ts`):

```ts
const editor = useEditor();
const canMerge = computed(() => mergeCells(editor.state.value)); // or editor.can(mergeCells)
editor.run(mergeCells); // runs it and gives the editor the focus back
```

- `view` is the `EditorView`, e.g. for measuring. Don't change its DOM.
- `state` is a `shallowRef` of the `EditorState`, replaced on every transaction. Derive from it with `computed`, which only notifies when the result changes, so a button's `enabled` doesn't re-render anything while typing.
- `run(command, { focus })` runs a ProseMirror `Command` and returns the focus to the editor (unless `focus: false`). `can(command)` asks without running it.
- The handle is provided, not global, so a part of the UI can later work with another editor (a header, a footnote).
- Don't add refs that ask the editor to do something (`…Requests` counters); call it through the handle instead, as `PageButton.vue` opens the page setup with `editor.run(pageSetup())`.

Code outside components (plugins, storage, commands) can't inject. It uses `src/state/` directly.

## Focus

- The editor's blur handler (`editor/index.ts`) takes the focus back after 100 ms, unless `uiTakesFocus` (`src/state/focus.ts`) says a part of the UI holds it. A new dialog, menu or field that takes the focus must be added there, or the editor steals it back.
- Pickers and toolbars never take the focus: their buttons have `tabindex="-1"`, and the element prevents `mousedown` (except in the caption field). Keep it that way for anything the editor's keys control.
- Closing a dialog sets its state to null first and then lets the callback call `view.focus()`. So `uiTakesFocus` is already false when the editor takes the focus, and Vue removes the dialog's DOM on the next tick, after the focus has moved.
