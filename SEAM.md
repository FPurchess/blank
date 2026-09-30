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

## S6: changed page ranges, body and band versions, `updateMany` (task 2)

Commit: `feat: report which pages changed and version bodies and bands apart` (hash: see the handoff message and `git log --grep "version bodies and bands"`).

Everything is additive, so the old TS code keeps working with the new wasm.

| | old | new |
|---|---|---|
| `update(start, delete, json, shift)` | `-> undefined` | `-> Uint32Array [bodyFrom, bodyTo, bandFrom, bandTo]` |
| `setItems(json)`, `setSettings(json)` | `-> undefined` | the same four numbers |
| `updateMany(json)` | — | `json` = `[[start, delete, items, shift], …]`, returns the same four numbers |
| `versions()` | combined version per page | unchanged: it still changes when the body **or** the bands change |
| `bodyVersions()` | — | `Uint32Array`, one per page: changes when the body changes |
| `bandVersions()` | — | `Uint32Array`, one per page: changes when the header or footer text changes |
| `page(page)` | body and bands | unchanged (deprecated: use the two below) |
| `pageBody(page)` | — | the same JSON as `page`, without the bands |
| `pageBands(page)` | — | the same JSON as `page`, only the bands (role Band = 1) |

- **Ranges** (from, to): half-open ranges of page indices whose body or band version differs from the version the page at the **same index** had before the call. A page that didn't exist before counts as changed. `from == to` (always `0, 0`) means none. Pages that were dropped are not in them: compare `pageCount()`.
- **Versions** identify content, not an index: after pages move (a page inserted before them), a page may carry a version another index had before, and it shows exactly what that page showed. A cache keyed by version can reuse it.
- **When a body version is kept**:
  - Only an incremental `update`/`updateMany`, or a `setSettings` that doesn't lay out again (bands, number style, new pages before headings), keeps body versions, and only for pages whose fragments are the old page's, of items that weren't laid out again.
  - `setItems`, `addFont` and a `setSettings` that changes the paper or the margins lay out everything again, and every page gets a new body version. So after `addFont`, every page whose glyphs may change is repainted.
- **`updateMany`**:
  - The entries are in document order, applied one after another: each `start` counts the items as the entries before it left them, its items carry their final positions, and its `shift` moves the items after it.
  - The pages are paginated once, from the page before the first entry.
  - Out-of-order entries still apply, but paginate from the first page.
  - `update(...)` is `updateMany` with one entry.
- **Positions**: the single `shift` covers every position the engine keeps: the items (texts, breaks, rules, images, tables and their cells) and the text boxes it laid out. Fragments, pages and table grids hold item indices and points, not positions. So unchanged items are never sent again, and there are no block-relative positions.
- **TS side (engine-editor, engine-ui)**:
  - Repaint a page's body layer when `bodyVersions()[i]` changes, and its band layer when `bandVersions()[i]` changes. Paint them from `pageBody`/`pageBands`.
  - Use the returned ranges instead of comparing all versions.
  - Batch several steps with `updateMany` if the step-map approach needs it.
