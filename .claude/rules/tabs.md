---
paths:
  - "src/editor/tabs.ts"
  - "src/editor/document.ts"
  - "src/editor/requests.ts"
  - "src/editor/commands/tabs.ts"
  - "src/editor/commands/saveFile.ts"
  - "src/state/tabs.ts"
  - "src/storage.ts"
  - "src/ui/TabRow.vue"
  - "src/ui/DocumentTab.vue"
  - "src/ui/tabRowModel.ts"
  - "src/ui/UnsavedDialog.vue"
  - "src-tauri/src/open.rs"
  - "src-tauri/src/session.rs"
  - "src-tauri/src/lib.rs"
  - "src-tauri/src/menu.rs"
  - "src/ui/tabDrag.ts"
  - "src/ui/composables/useWindowCommands.ts"
  - "e2e/specs/tabs.e2e.ts"
---

# Tabs

Blank keeps several documents open, one tab each, in the one ProseMirror view: every tab has an `EditorState` of its own, and switching is `view.updateState`.

## Where things are

- **`src/state/tabs.ts`:** the tabs (`tabs`, in the row's order, replaced whole), `activeTabId`, `activeTab`, `tabSwitch` (a new object on every switch), `tabRowFocused`, and what a tab is called (`tabLabel`, `tabTooltip`, `tabAnnouncement`, `freeUntitledNumber`).
- **`src/editor/tabs.ts`:** what tabs do: `restoreTabs` and `bootTabs` (from `bootEditor`), `openNewTab`, `openPaths`, `activateTab`, `cycleTab`, `closeTabs`, `moveTab`, `reopenTab`, `saveTab`. The documents themselves are kept here, in a private map, never in reactive state: a dot or a name changing must not copy them.
- **`src/editor/commands/tabs.ts`:** the commands of the keymap and the tab row, which start one of those and return `true`.
- **`src/ui/TabRow.vue`** (keys, menu and fit in `tabRowModel.ts`, dragging in `tabDrag.ts`), `DocumentTab.vue`, `UnsavedDialog.vue`; the keys of the window outside the editor in `composables/useWindowCommands.ts`, which `App.vue` uses.
- `path`, `importedFrom` and `transaction` (`src/state/document.ts`) stay what everything reads, and always mean the active tab.

## Rules

- **Changes to the tabs run one after another** (`enqueue`): two opens from the terminal, a close that waits for the question, a quick run of `Ctrl` `Tab`, a drag's moves, a reopen right after a close. Inside a queued task call the unqueued helpers (`switchTo`, `closeTab`, `openPathsNow`, `saveTabNow`), or it waits for itself.
- **The row and the shown tab change together** (`present`): whatever is awaited (loading the tab, the input method) comes first, then the row is made from the tabs as they are then, and `showTab` runs right after. New tabs' documents are kept and stored with `adopt`.
- **A switch publishes the document before the view gets it** (`showTab`): `activeTabId`, then `transaction`, `path` and `importedFrom`, then `view.updateState`. The page view lays the new document out inside `updateState` and reads the path of its images then, and storage files the next document under `activeTabId`.
- **Every tab's state has its own plugin array, so a switch makes ProseMirror build every plugin view anew.** That is the reset of the last document's per-view state (pageSync's `teardown`, the toolbars, the handles). Don't keep what belongs to all tabs in a plugin view: images stay loaded (`forgetImages` runs only when files are opened), and the spell check results of a tab are reset (`resetSpellcheck`) when the spell checker changed while it was away.
- **What works on the shown document closes before a switch** (`closeRequests`, `src/editor/requests.ts`): the dialogs and popovers with their own cancel, the menus and pickers, and the header or footer strip through `bandEditorDone`, which keeps what was typed. A new request that closes over the view goes there too.
- **The page view resets what it kept of the last document on `tabSwitch`** and scrolls to the tab's `viewAnchor` once its layout has that page (`PageView.vue`).
- **The leaving tab's dot is worked out again on every switch:** closing what was open on it may still change it (the header strip's text).
- **Unsaved is a comparison, not a flag set on typing:** the document against the one last opened or saved (`baseline`), with `Node.eq`, which stops at shared nodes, so undoing back to the saved text clears the dot. The baseline is the document after the plugins' `appendTransaction` (`documentState`), or a file with a table would count as changed right away. Compare the view's state, not `transaction`, whose doc comes before `appendTransaction`.
- **Paths are canonical** (`canonical_path`), both of opened files and of saves, so a file named two ways has one tab.
- **Anything that reads the shown document's path across an `await`** (a save or export dialog) reads it before, since another tab may show when the dialog closes: `_saveFile` gets the file it saves, `exportAs` keeps `docPath`.

## Storage (`src/storage.ts`)

- `session` holds the order, the active tab and each tab without its document; `tab:<id>` holds each tab's `doc.toJSON()`. Only changed documents are written, at most a second after a change; the documents first, then the session, then the closed tabs' keys are removed, so the session never lists a document that isn't stored.
- Every tab has its document stored, a saved file's too: it is what shows when the file has gone. A tab without unsaved changes reads its file again when it's first shown; one with changes keeps them and reads the file in the background as its baseline.
- Restored tabs load when first shown, except the active one.
- An earlier Blank's `doc`, `path` and `importedFrom` become the first tab (`migrate`), marked unsaved until its file says otherwise. A stored document that can't be read is kept as `tab-backup:<id>`, a session that can't be read (e.g. a newer Blank's) as `session-backup`.
- A write that fails keeps what it didn't store pending for the next one; closing the window always writes the session, with the view's spot.

## One Blank at a time (`src-tauri/src/open.rs`, `session.rs`)

- `tauri-plugin-single-instance` (2.4, which works with tauri 2.11) is registered first. A second start hands its command line and working directory to the running Blank, which resolves the paths against that directory and opens them as tabs.
- Files that come before the webview listens wait in `OpenQueue`. The webview listens for `open-paths` first and then empties the queue with `take_open_paths` (`openedPaths` in `src/editor/tabs.ts`); after that, files are sent as the event. The files Blank is started with go the same way, and so do Finder's (`RunEvent::Opened`, macOS).
- On Linux the plugin needs a session bus, and panics without one, so Blank registers it only when the bus can be reached (`single_instance`). E2E runs under `dbus-run-session`, and debug builds run as `….debug`, each E2E spec as an instance of its own (`BLANK_INSTANCE_ID`, set by `wdio.conf.ts`).
- Where two Blanks run anyway, only the one holding `<app local data>/session.lock` (`session_lock`, `File::try_lock`) restores and stores the tabs; the other says so and keeps none.
- macOS: the app menu leaves out Close Window (`src-tauri/src/menu.rs`), so `Cmd` `W` closes the tab.
