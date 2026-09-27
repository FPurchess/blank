---
paths:
  - "src/**/*.test.ts"
  - "src/test/**"
  - "e2e/**"
---

# Testing the UI and shared state

- **Test through the DOM, as a user sees it:** query by id, role and label text, dispatch real events (`keydown`, `input`, `mousedown`), and check what's shown and what state changed. Don't test component internals.
- **Every boot is disposed.** A UI or state boot returns `dispose`. Keep it in a `let dispose = () => {}` and call it in `afterEach`, so watchers, timers and listeners don't pile up across tests. Clearing `document.body` alone leaves them running. `ui.test.ts`, `linkDialog.test.ts` and `state/*.test.ts` show the pattern.
- **Reset shared refs** that a test writes in `beforeEach`/`afterEach` (e.g. `tablePicker.value = null`). The refs are module singletons shared by every test in a file. `storage.test.ts` imports fresh modules with `vi.resetModules()`, and boots `bootState()` before storage, as `main.ts` does.
- **Refs don't notify for an equal value.** A test that writes the same value twice sees one change. Use the event functions (`announce`, `flashSpellcheckMessage`) for messages, and compare `announcement.value?.text`.
- **To record changes of a ref**, use `watch(ref, fn, { flush: "sync" })` and stop it after the test.
- **Vue components (from the migration's PR B on) render in a microtask.** After changing state or dispatching an event that changes a component's state, `await nextTick()` (or `flushPromises()` from `src/test/async.ts`) before checking the DOM. The imperative UI modules and sync watchers still update right away.
- **Keep the logic in `.ts` modules, where coverage counts it.** v8 coverage doesn't count branches in templates, and `bun run test:coverage` fails below 80%.
- **E2E and the docs shots find the UI by its ids and classes** (`#link-dialog`, `#table-toolbar .caption input`, …). Keep them stable, and wait for elements with the auto-retrying matchers (`toBeExisting`, `toBeFocused`) instead of sleeping.
