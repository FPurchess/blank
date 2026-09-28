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
  - "src/*Dialog.ts"
  - "src/pageSetup.ts"
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
| `dialogs.ts` | the requests of open dialogs (`linkDialog`, `imageDialog`, `pageSetup`) and of the open header or footer strip (`bandEditor`), and `pageSetupRequests` |
| `popups.ts` | `tablePicker`, `tableToolbar`, `tableHandles` (with `Point`, `Span`), `contextMenu`, `MenuItem`, `Anchor` |
| `messages.ts` | `announcement` and `spellcheckMessage`, written through `announce()` and `flashSpellcheckMessage()`; `bootMessages()` clears each after a moment |
| `page.ts` | `frontmatter` (of the document, notifying only when it changes), `pageLayout` (its `resolveLayout` over `config`'s defaults, resolved again only when either changes) and `pageFields` (what the placeholders of headers and footers show, the same object while they stay the same) |
| `focus.ts` | `uiTakesFocus`, whether a dialog, the context menu or the caption field holds the focus |

`config` (blank.json over the defaults) stays in `src/config.ts`, next to its loader.

## Rules

- **Every shared value is a `shallowRef`, and it is replaced whole.** Never change it in place (`x.value.foo = …` or `push`), because a shallow ref doesn't see that. Shallow refs keep ProseMirror objects (`Transaction`, `EditorView` in closures), the spell checker and `config` out of Vue's proxies. They also keep identity checks working, like `contextMenu.value?.close === close` in `src/editor/plugins/contextMenu.ts`, or `menuKey(request.close)`, which tells the requests of one open menu apart from a new menu.
- **Derived state is a `computed`** (e.g. `uiTakesFocus`). It's lazy and only notifies when its result changes, which matters for state that changes on every key.
- **State with rules of its own is written through a function in its module:** `announce()`, `flashSpellcheckMessage()`, and the language picker's functions in `src/languagePicker.ts`. Plain values (`theme`, `language`, `spellcheck`, `path`) are assigned directly.
- **A ref doesn't notify when the new value is `Object.is`-equal to the old one.** That is usually what you want: confirming the current language doesn't reload the dictionary. For events that may repeat (the same message twice), write a new object each time, like `Message` (`{ text, id }`) in `messages.ts`. For requests the editor handles (`pageSetupRequests`, a counter), make each write differ, or set the ref back to null once it's handled and return early on null.
- **Side effects are `watch`ers started by a `boot…()` function, never at import time.** A boot runs in `bootScope()` (`src/scope.ts`), a Vue effect scope that collects its watchers and computeds. Cleanups register with `onScopeDispose` (elements to remove, timers), and window listeners go through `listenOnWindow`. The boot returns the scope's `dispose`, which stops all of it, including boots it started; calling it twice does nothing. Don't keep lists of stop functions by hand. A boot with a single watcher may return that watcher's stop handle (`bootAppearance`, `bootSpellcheck`). Storage and the editor boot once per app and don't return one (`bootEditor` returns the editor handle instead). `bootState()` (in `main.ts`, first) starts the theme on `document.body`, `textContent`, and the clearing of messages after a moment.
- **Watchers use `{ flush: "sync" }`** where code relies on the effect right after the write, as it did with the old synchronous Observables. That covers the imperative UI renderers, storage, and the plugin views. Vue components need no watchers, since their templates react by themselves. Watchers outside the UI may move to the default flush where batching helps (see `vue-migration.md`).
- **Several refs, one effect:** `watch([a, b], fn, …)` rather than two watchers.
- **Plugin views** start their watchers in `view()` and stop them in `destroy()` (see `plugins/images.ts`, `plugins/spellcheck.ts`).

## Adding shared state

1. Add a `shallowRef` (with a comment on what it holds and when it's null) to the module of its domain, or a new module that `index.ts` re-exports.
2. If it has rules (events, invariants), write it only through a function next to it.
3. If a part of the UI takes the focus while it's open, add it to `uiTakesFocus` in `focus.ts`.
4. Test the module next to it (`src/state/<domain>.test.ts`).
