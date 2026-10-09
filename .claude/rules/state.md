---
paths:
  - "src/state/**"
  - "src/storage.ts"
  - "src/config.ts"
  - "src/main.ts"
  - "src/editor/**"
  - "src/spellcheck/**"
  - "src/ui.ts"
  - "src/ui/**"
  - "src/nativeMenu.ts"
  - "src/table*.ts"
---

# Shared state

Blank's modules share state through Vue refs in `src/state/`, instead of importing each other. The ProseMirror plugins, commands, storage, the spell check service and the UI all import the same refs from `src/state` (the barrel `index.ts`). There is no Pinia, and no `use…()` wrapper around state.

## Where things live

| Module | Holds |
|---|---|
| `document.ts` | `path`, `importedFrom`, `transaction` (every editor transaction), `textContent` (50 ms after the last one), all of the active tab |
| `tabs.ts` | the open tabs: `tabs`, `activeTabId`, `activeTab`, `tabSwitch` (a new object on every switch), `tabRowFocused` (part of `uiTakesFocus`), and their names (`tabLabel`, `tabTooltip`, `tabAnnouncement`); what tabs do is in `src/editor/tabs.ts` (see `tabs.md`) |
| `appearance.ts` | `themes`, `theme`, `isTheme`, and `colorMode` (accent or mono, see `design.md`) |
| `language.ts` | `language`, `languagePicker` |
| `spellcheck.ts` | `spellcheck`, `spellcheckStatus`, `spellchecker` |
| `dialogs.ts` | the requests of open dialogs (`linkDialog`, `imageDialog`, `pageSetup`, `unsavedDialog`, `settingsDialog`, `printDialog`) and popovers (`tocPopover`) and of the open header or footer strip (`bandEditor`, with `bandEditorDone`, which closes it), `focusTakingDialogs`, those of them that take the focus, and `closeDialog` |
| `blocksPane.ts` | the blocks pane: `blocksPaneOpen` (persisted), `blocksPaneFocused` (part of `uiTakesFocus`), `blockChoices` (the blocks it offers) and `focusBlocksSearch()`, which asks it for the focus in its search |
| `popups.ts` | `tablePicker`, `tableToolbar`, `tableHandles` (with `Point`, `Span`), `blockToolbar`, `ToolbarItem` (with the `command` whose shortcut its tooltip shows), `BoxAnchor` (an `Anchor` with its right end), `contextMenu` (its `owner`, the button that opened it, if a button did), `MenuItem` (with an optional `icon`, `detail` and `look`, a class that draws it like what it makes), `Anchor`, `tooltipsSuppressed` (keeps the controls' tooltips hidden), and `wordCountCard` (whether the word count's card shows) |
| `messages.ts` | `announcement` and `spellcheckMessage`, written through `announce()` (`quiet` for what only screen readers hear) and `flashSpellcheckMessage()`; `bootMessages()` clears each after a moment |
| `page.ts` | `frontmatter` (of the document, notifying only when it changes), `pageLayout` (its `resolveLayout` over `config`'s defaults, resolved again only when either changes) and `pageFields` (what the placeholders of headers and footers show, the same object while they stay the same) |
| `pageView.ts` | the page view: `pageView` (the view chosen), `pageLayoutState` (the pages as laid out), `pageCaret`, `pageSelection`, `pageHeadBox` (where the selection's head is painted, with its affinity, e.g. for the IME), `pageDropCaret` (where dragged text would drop), `pageDropGap` (where a dragged block would drop), `pageHoverBlock` (the content block under the pointer), `engineMissing` (true once the editor shows the text itself), `pageScrollRequest`, and `pageViewport` (where the view is and how far it scrolled, for `src/engine/geometry.ts`; written at most once per frame, and only when it changed) |
| `print.ts` | `printSettings`, what the print dialog remembers (persisted, see `print.md`) |
| `settingsDialog.ts` | `settingsSections` and `settingsSection`, the section the settings open on (see `settings.md`) |
| `focusMode.ts` | `focusMode`, `controlsFaded`, `controlsStay` (what the controls stay for), `setFocusMode()`, `leaveFocusMode()` (Esc) and `focusModeMessage()` (see `focus-mode.md`) |
| `focus.ts` | `uiTakesFocus`, whether a dialog, the context menu, the caption field, the blocks pane, the tab row or the formatting toolbar holds the focus; the parts F6 moves through (`registerFocusStop`, `cycleFocus`) |
| `toolbar.ts` | the formatting toolbar: `toolbarFocused` (part of `uiTakesFocus`); Alt-F10 gives it the focus through its focus stop (`focusStop("toolbar")` in `focus.ts`) |
| `headings.ts` | `headings`, the document's listed headings (`listedHeadings`: at the top and in forms' fields, with text), the same list the outline, tables of contents and the PDF's bookmarks use, published by the editor's `headings` plugin view through `publishHeadings` (from the view, so it sees what `appendTransaction` changed) |
| `outline.ts` | the outline: `outlinePinned` (kept open, persisted), `outlinePeek` (the floating list), `outlineEntries` (the headings it lists, the same objects while they stay the same), and `toggleOutline()`, its rules for the shortcut and the dashes |

`config` (blank.json over the defaults) stays in `src/config.ts`, next to its loader and its one writer, `saveSettings` (see `settings.md`).

## Rules

- **Every shared value is a `shallowRef`, and it is replaced whole.** Never change it in place (`x.value.foo = …` or `push`), because a shallow ref doesn't see that. Shallow refs keep ProseMirror objects (`Transaction`, `EditorView` in closures), the spell checker and `config` out of Vue's proxies. They also keep identity checks working, like `contextMenu.value?.close === close` in `src/editor/plugins/contextMenu.ts`, or `keyOf(request.close)` in `App.vue`, which tells the requests of one open menu apart from a new menu.
- **Derived state is a `computed`** (e.g. `uiTakesFocus`). It's lazy and only notifies when its result changes, which matters for state that changes on every key.
- **State with rules of its own is written through a function in its module:** `announce()`, `flashSpellcheckMessage()`, and the language picker's functions in `src/languagePicker.ts`. Plain values (`theme`, `language`, `spellcheck`, `path`) are assigned directly.
- **A ref doesn't notify when the new value is `Object.is`-equal to the old one.** That is usually what you want: confirming the current language doesn't reload the dictionary. For events that may repeat (the same message twice), write a new object each time, like `Message` (`{ text, id }`) in `messages.ts`. Don't publish a counter or flag to ask the editor for something: a component calls it through `useEditor()` (see `editor-boundary.md`).
- **Side effects are `watch`ers started by a `boot…()` function, never at import time.** A boot runs in `bootScope()` (`src/scope.ts`), a Vue effect scope that collects its watchers and computeds. Cleanups register with `onScopeDispose` (elements to remove, timers), and window listeners go through `listenOnWindow`. The boot returns the scope's `dispose`, which stops all of it, including boots it started; calling it twice does nothing. Don't keep lists of stop functions by hand. A boot with a single watcher may return that watcher's stop handle (`bootAppearance`, `bootSpellcheck`). Storage and the editor boot once per app and don't return one (`bootEditor` returns the editor handle instead). `bootState()` (in `main.ts`, first) starts the theme on `document.body`, `textContent`, and the clearing of messages after a moment.
- **Watchers run after the writes of a tick (Vue's default flush), unless code relies on their effect right after the write; then they use `{ flush: "sync" }`.** The default batches: `bootSpellcheck` loads one dictionary when spell check and the language change together, and `textContent`'s debounce starts one timer however many transactions a tick had. Sync, and why:
  - storage (`src/storage.ts`): each change marks the tab's document and the session pending at once, so closing the window right after it still writes it (`flush` on close);
  - the theme and color mode on `document.body` (`bootAppearance`), before the first paint;
  - the plugin views (`plugins/images.ts`, `plugins/spellcheck.ts`, `plugins/pageView.ts`) and `followLayout` (`plugins/followLayout.ts`), which dispatch, measure or publish while the editor's state they follow is current;
  - the message timers (`bootMessages`), which restart on every message.

  Components rarely need watchers, since their templates react by themselves; one watches only for effects outside its own DOM, e.g. `PageView.vue` scrolling after a render (`flush: "post"`) or the body's classes (`useBodyClass`). In tests, `await nextTick()` after a write that a default-flush watcher follows.
- **Several refs, one effect:** `watch([a, b], fn, …)` rather than two watchers.
- **Plugin views** start their watchers in `view()` and stop them in `destroy()` (see `plugins/images.ts`, `plugins/spellcheck.ts`).

## Adding shared state

1. Add a `shallowRef` (with a comment on what it holds and when it's null) to the module of its domain, or a new module that `index.ts` re-exports.
2. If it has rules (events, invariants), write it only through a function next to it.
3. If a part of the UI takes the focus while it's open, add it to `focusTakingDialogs` in `dialogs.ts` (a dialog) or to `uiTakesFocus` in `focus.ts` (anything else).
4. Test the module next to it (`src/state/<domain>.test.ts`).
