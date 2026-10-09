---
paths:
  - "src/ui/focusModeModel.ts"
  - "src/ui/FocusModeButton.vue"
  - "src/state/focusMode.ts"
  - "src/editor/plugins/focusMode.ts"
  - "src/scss/_focusMode.scss"
  - "src/chrome.ts"
---

# Focus mode

Focus mode (`view.focus`, `Mod-Shift-f`, and the last button of the status bar) lets the controls fade while the user writes. Blank always starts without it, and turning it on changes nothing until the user types or rests.

- **What fades:** the controls of `CHROME_SELECTOR` (`src/chrome.ts`): the top area (tab row and toolbar), the status bar, the outline with its dashes, the blocks pane, and the table and block toolbars. They include the `chrome-fade` mixin (`src/scss/_focusMode.scss`): opacity only, out in `--chrome-out` (700ms), back in `--chrome-in` (300ms), no pointer while faded. The mixin also fades them while a header or footer is edited (`body.band-editing`, see `headers-and-footers.md`), which leaves `controlsFaded` alone. Panes keep their room, so the pages never move. The window behind the faded bars takes the color around the pages (`body.controls-faded.outline-desk` in main.scss): the desk in Pages, the paper in page ends. A new control of the window includes the mixin, and its selector goes into `CHROME_SELECTOR` and main.scss's reduced-motion block.
- **When:** `watchFocusMode` (`focusModeModel.ts`, run by `App.vue`, which also sets the body's classes) fades them on a key that changes the text (`isTypingKey`: characters, Enter, Backspace, Delete, Tab; not the arrows or shortcuts), or once the pointer has rested `focusMode.hideAfter` seconds (0: only when typing).
- **Back:** they come back when the pointer moves more than `POINTER_TRAVEL` (6px), when the focus moves into one of them (F6, Alt-F10), and when something opens that they stay for.
- **Never:** they don't fade while the pointer is on one of them, or while `controlsStay` (`src/state/focusMode.ts`) holds: `uiTakesFocus` (dialogs and the header and footer strip, the context menu and the menus of menu buttons, a part of the window holding the focus), the language and table pickers, the outline's peek, the find panel or the word count card. A new popup that isn't in `uiTakesFocus` goes there.
- **While faded:** `body.controls-faded` hides the pointer over the pages, and `tooltipsSuppressed` hides the tooltips.
- **Esc** leaves focus mode through `leaveFocusMode()` (`src/state/focusMode.ts`), unless something is open (`controlsStay`). ProseMirror takes every Esc in the editor (`captureKeyDown`), so the window never sees one free there: in the text, the editor plugin `focusModeKeys` (`src/editor/plugins/focusMode.ts`), the last of the plugins, handles it once no plugin before took it (a form, a picker). Outside the text, a window listener does, when nothing prevented it.
- **Not stored:** focus mode itself isn't kept. The rest time is in blank.json, which Settings → Appearance writes.
