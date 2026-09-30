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

Commit: e9f8ef2 `feat: report which pages changed and version bodies and bands apart`.

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

## S5: the engine validates and clamps what it's handed (task 3)

Commit: `fix: validate what the webview hands the layout engine and never panic on it` (its hash is in the next section's commit, or `git log --grep "never panic on it"`).

The shapes don't change. What changes is how odd values behave:

| input | before | now |
|---|---|---|
| `new LayoutEngine(bytes, lengths)` with lengths past `bytes` | trap | throws an `Error` (the constructor returns a Result) |
| `startNumber` | an `i32`: `3000000000` made `setSettings` throw | any JSON number: truncated and clamped to ±1 000 000 000 (`START_NUMBER_LIMIT`). Only a non-number still throws |
| `numberStyle` other than `1`, `i`, `I` | roman | arabic (`1`) |
| roman page numbers above 3999 | one "m" per thousand (seconds per page) | arabic |
| `width`, `height` | as given | clamped to 36–14400 pt; not finite → A4's |
| margins | as given | not finite → 0, clamped to ≥ 0; opposite margins shrink proportionally until 36 pt are left for the text |
| item `indent`, `before`, `after`, `bars` | as given | not finite → 0, negative → 0 |
| image `width`/`height` not finite or negative | laid out with them | the image counts as not loaded (its alt text shows) |
| table `widths` | as given | not finite or negative → 0 |
| cell `col`/`colspan` | `u32::MAX` overflowed or allocated the grid | the grid has at most 1000 columns (`MAX_COLUMNS`) |
| `hit`, `word`, `vertical` with a non-finite x, y or goal | undefined | `[]` (nothing) |
| any position or page out of range | mostly nothing, some panics | nothing (empty arrays, `-1` for `lineEdge`) |

- A panic hook writes any panic that is left to `console.error` ("the layout engine panicked: …") before the instance traps, so a trap is never silent.
- TS side: nothing is required. Code that catches `setSettings` errors for big start numbers can drop that. The frontmatter reader may keep its own checks: the engine clamps anyway.
