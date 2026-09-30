# engine-editor progress

The tasks of `TASK.md`, plus A and B from the integrator. The integrator
deletes this file on merge.

## Tasks

- [x] 1. An engine error never blocks boot or breaks editing (B2, JS side)
- [ ] B. `blank.engine=off` starts Blank without the engine
- [ ] 2. Without the engine, a fully usable plain editor (B3)
- [ ] A. `HEADER_ROOM` above the first page's header in "page ends"
- [ ] 3. ↑/↓ and End keep the line affinity — waiting for S1
- [ ] 4. Flatten only the blocks a transaction changed (the shifting part and band versions wait for S6)
- [ ] 5. One unit for the column goal of ↑/↓ and Page Up/Down
- [ ] 6. Keyboard and mouse make cell selections in tables
- [ ] 7. Cells that share a node object get their own positions
- [ ] 8. Images, lists and quotes in table cells — waiting for S2
- [ ] 9. Image cache by resolved URL, retried, and no counter
- [ ] 10. Drag and drop of text
- [ ] 11. The PDF waits for fallback glyphs
- [ ] 12. The hidden `TableView` no longer freezes columns
- [ ] 13. Page setup and field watchers lay out on the new state
- [ ] 14. `frozen` is reset with the plugin view
- [ ] 15. Share the fonts between engines — waiting for S3
- [ ] 16. Test hooks only in dev and E2E builds
- [ ] 17. Dead code, and a parity test of the bands
- [ ] 18. Table handles measure only the tables under the pointer
- [ ] 19. The Word export's font loader recovers from a failed fetch
- [ ] 20. Incremental layout equals a fresh one on real transactions

## Notes for the other streams

- engine-ui: every call into the engine goes through `PageEngine`'s guard.
  Production code must not call `engine.raw` (tests may). After a failure,
  `pageEngine` is null, `pageEngineReady` notifies with null, and
  `body.without-engine` is set; `engineless()` and `engineStatus()` in
  `src/engine/engine.ts` tell why.
- engine-ui, engine-release: after a trap, the PDF export runs in a worker
  (`src/engine/pdfWorker.ts`, built by Vite from
  `new Worker(new URL("./pdfWorker.ts", import.meta.url), { type: "module" })`)
  with a wasm instance of its own, since the wasm-bindgen glue keeps one
  instance per module and `initSync` does nothing once it has one.
- engine-core: the worker needs the font bytes (base files and fallbacks);
  S3 must keep them obtainable (`fontFile(i)`), see task 15.
