---
paths:
  - "src/**/*.test.ts"
  - "src/test/**"
  - "e2e/**"
---

# Testing the UI and shared state

- **Test through the DOM, as a user sees it:** query by id, role and label text, dispatch real events (`keydown`, `input`, `mousedown`), and check what's shown and what state changed. Don't test component internals.
- **Every boot is disposed.** A UI or state boot returns `dispose`. Keep it in a `let dispose = () => {}` and call it in `afterEach`, so watchers, timers and listeners don't pile up across tests. Clearing `document.body` alone leaves them running. `ui.test.ts`, `ui/StatusBars.test.ts` and `state/*.test.ts` show the pattern.
- **Reset shared refs** that a test writes in `beforeEach`/`afterEach` (e.g. `tablePicker.value = null`). The refs are module singletons shared by every test in a file. `storage.test.ts` imports fresh modules with `vi.resetModules()`, and boots `bootState()` before storage, as `main.ts` does.
- **Refs don't notify for an equal value.** A test that writes the same value twice sees one change. Use the event functions (`announce`, `flashSpellcheckMessage`) for messages, and compare `announcement.value?.text`.
- **To record changes of a ref**, use `watch(ref, fn, { flush: "sync" })` and stop it after the test.
- **Vue components render in a microtask.** After changing state or dispatching an event that changes a component's state, `await nextTick()` (or `flushPromises()` from `src/test/async.ts`) before checking the DOM. Sync watchers still update right away.
- **Mount components through the app** (`dispose = bootApp(createTestHandle())`, see `src/ui/TableToolbar.test.ts`), and drive them through the state they show. `createTestHandle()` (`src/test/editor.ts`) is an editor handle on a test view, for `useEditor()`.
- **Keep the logic in `.ts` modules, where coverage counts it.** v8 coverage doesn't count branches in templates, and `bun run test:coverage` fails below 80%.
- **E2E and the docs shots find the UI by its ids and classes** (`#link-dialog`, `#table-toolbar .caption input`, …). Keep them stable, and wait for elements with the auto-retrying matchers (`toBeExisting`, `toBeFocused`) instead of sleeping. The main text is the ProseMirror editor `#editor`, which is hidden (the slot editors of the header and footer strips are `.ProseMirror` too). What the user sees is painted on canvases, so tests read where text, the caret and the selection are through `window.blankGeometry` (`src/engine/geometry.ts`), and what a page shows from its pixels (`canvasInk`, `screenStats` in `e2e/helpers.ts`), not from `#editor`'s DOM.
- **The docs shots** (`e2e/shots/*.shots.ts`, one per topic, on `e2e/shots/shots.ts`): change the scripts, never the images in `docs/public/screenshots/`, which CI captures on `main` and proposes in the screenshots PR (see Website in CLAUDE.md). Look at one with `make docs-shot NAME="<title of its it()>"`, which writes to `e2e/screenshots/docs/`. Start new documents with `newDocument()`/`filmNew()`, which give the pages a header and a footer (`{ bands: false }` only for recordings of adding them) and take the page view (`{ view: "pages" }`). Each picture comes in light and dark; a recording that switches themes itself passes `{ dark: false }`. Keep the frames repeatable: nothing that depends on how long a step took in real time (timers, tooltips); CSS transitions are fine, they run on the recorder's virtual clock.
