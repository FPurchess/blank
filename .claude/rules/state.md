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
| `document.ts` | `path`, `importedFrom`, `transaction` (every editor transaction), `textContent` (50 ms after the last one) |
| `appearance.ts` | `themes`, `theme` |
| `language.ts` | `language`, `languagePicker` |
| `spellcheck.ts` | `spellcheck`, `spellcheckStatus`, `spellchecker` |
| `dialogs.ts` | the requests of open dialogs (`linkDialog`, `imageDialog`, `pageSetup`) and of the open header or footer strip (`bandEditor`) |
| `popups.ts` | `tablePicker`, `tableToolbar`, `tableHandles` (with `Point`, `Span`), `contextMenu`, `MenuItem`, `Anchor` |
| `messages.ts` | `announcement` and `spellcheckMessage`, written through `announce()` and `flashSpellcheckMessage()`; `bootMessages()` clears each after a moment |
| `page.ts` | `frontmatter` (of the document, notifying only when it changes), `pageLayout` (its `resolveLayout` over `config`'s defaults, resolved again only when either changes) and `pageFields` (what the placeholders of headers and footers show, the same object while they stay the same) |
| `pageView.ts` | the page view: `pageView` (the view chosen), `pageLayoutState` (the pages as laid out), `pageCaret`, `pageSelection`, `pageHeadBox` (where the selection's head is painted, with its affinity, e.g. for the IME), `pageDropCaret` (where dragged text would drop), `engineMissing` (true once the editor shows the text itself), `pagePosition`, `pageScrollRequest`, and `pageViewport` (where the view is and how far it scrolled, for `src/engine/geometry.ts`; written at most once per frame, and only when it changed) |
| `focus.ts` | `uiTakesFocus`, whether a dialog, the context menu or the caption field holds the focus |
| `headings.ts` | `headings`, the document's top-level headings for the outline and, later, a table of contents, published by the editor's `headings` plugin view through `publishHeadings` (from the view, so it sees what `appendTransaction` changed) |
| `outline.ts` | the outline: `outlinePinned` (kept open, persisted), `outlinePeek` (the floating list), `outlineEntries` (the headings it lists, the same objects while they stay the same), and `toggleOutline()`, its rules for the shortcut and the dashes |

`config` (blank.json over the defaults) stays in `src/config.ts`, next to its loader.

## Rules

- **Every shared value is a `shallowRef`, and it is replaced whole.** Never change it in place (`x.value.foo = …` or `push`), because a shallow ref doesn't see that. Shallow refs keep ProseMirror objects (`Transaction`, `EditorView` in closures), the spell checker and `config` out of Vue's proxies. They also keep identity checks working, like `contextMenu.value?.close === close` in `src/editor/plugins/contextMenu.ts`, or `keyOf(request.close)` in `App.vue`, which tells the requests of one open menu apart from a new menu.
- **Derived state is a `computed`** (e.g. `uiTakesFocus`). It's lazy and only notifies when its result changes, which matters for state that changes on every key.
- **State with rules of its own is written through a function in its module:** `announce()`, `flashSpellcheckMessage()`, and the language picker's functions in `src/languagePicker.ts`. Plain values (`theme`, `language`, `spellcheck`, `path`) are assigned directly.
- **A ref doesn't notify when the new value is `Object.is`-equal to the old one.** That is usually what you want: confirming the current language doesn't reload the dictionary. For events that may repeat (the same message twice), write a new object each time, like `Message` (`{ text, id }`) in `messages.ts`. Don't publish a counter or flag to ask the editor for something: a component calls it through `useEditor()` (see `editor-boundary.md`).
- **Side effects are `watch`ers started by a `boot…()` function, never at import time.** A boot runs in `bootScope()` (`src/scope.ts`), a Vue effect scope that collects its watchers and computeds. Cleanups register with `onScopeDispose` (elements to remove, timers), and window listeners go through `listenOnWindow`. The boot returns the scope's `dispose`, which stops all of it, including boots it started; calling it twice does nothing. Don't keep lists of stop functions by hand. A boot with a single watcher may return that watcher's stop handle (`bootAppearance`, `bootSpellcheck`). Storage and the editor boot once per app and don't return one (`bootEditor` returns the editor handle instead). `bootState()` (in `main.ts`, first) starts the theme on `document.body`, `textContent`, and the clearing of messages after a moment.
- **Watchers use `{ flush: "sync" }`** where code relies on the effect right after the write, as it did with the old synchronous Observables. That covers the parts of the UI that aren't Vue yet (the table handles, the header and footer strips), storage, and the plugin views. Vue components need no watchers, since their templates react by themselves. Watchers outside the UI may move to the default flush where batching helps (see `vue-migration.md`).
- **Several refs, one effect:** `watch([a, b], fn, …)` rather than two watchers.
- **Plugin views** start their watchers in `view()` and stop them in `destroy()` (see `plugins/images.ts`, `plugins/spellcheck.ts`).

## Adding shared state

1. Add a `shallowRef` (with a comment on what it holds and when it's null) to the module of its domain, or a new module that `index.ts` re-exports.
2. If it has rules (events, invariants), write it only through a function next to it.
3. If a part of the UI takes the focus while it's open, add it to `uiTakesFocus` in `focus.ts`.
4. Test the module next to it (`src/state/<domain>.test.ts`).
