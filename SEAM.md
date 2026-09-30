# The seam between the layout engine and the TS side

What engine-core changed in the wasm API (`src-tauri/layout/src/model.rs` and `wasm.rs`, against `src/engine/flatten.ts` and `src/engine/engine.ts`). engine-editor adapts once the integrator has merged each commit, with a rebuilt wasm.

Each change gives:
- the old and new signature or JSON shape
- what the TS side must do
- whether the old form still works
- the commit it came in

Old forms are kept where that's cheap, so the TS side keeps working with the new wasm until it switches.

Planned, in the order they land: S6 (task 2), S5 (task 3), S1 (task 4), S2 (task 9), S3 (task 11), S4 (tasks 12 and 13).

Not a seam change: task 0 (`refactor: split the layout engine into modules by concern`) only moved code.
