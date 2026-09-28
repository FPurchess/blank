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

- **Everything inside `.ProseMirror`:** node views (`TableView` in `plugins/tables/view.ts`, the image view), decorations (spell check), mark views (`openLink`), the properties widget. `TableView.ignoreMutation` only lets ProseMirror see mutations inside its `contentDOM`, and `freeze()`/`unfreeze()` write column widths into `<colgroup>` and the table's inline style. A Vue patch in there would either be read back as a document edit or reset those widths.
- **Keys.** The editor keeps the focus while a picker or table mode is open, and plugins handle the keys: `plugins/languagePicker.ts`, `plugins/tables/picker.ts`, `plugins/tables/tools.ts`. UI components only render what those plugins publish.
- **Measuring the editor:** `coordsAtPos`, `view.nodeDOM(pos).getBoundingClientRect()`. Plugins measure and publish plain boxes in viewport coordinates (`Anchor`, `TableToolbarState.anchor`). The UI places itself with them.

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
