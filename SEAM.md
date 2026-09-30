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
  - Fixed after e9f8ef2 (the next commit, "fix: settle updateMany only on a tail that reaches the old end"): an `updateMany` whose last entry deleted the last items could copy their old fragments and panic. `update` alone was never affected. Merge the fix together with S6 if `updateMany` is used.
- **Positions**: the single `shift` covers every position the engine keeps: the items (texts, breaks, rules, images, tables and their cells) and the text boxes it laid out. Fragments, pages and table grids hold item indices and points, not positions. So unchanged items are never sent again, and there are no block-relative positions.
- **TS side (engine-editor, engine-ui)**:
  - Repaint a page's body layer when `bodyVersions()[i]` changes, and its band layer when `bandVersions()[i]` changes. Paint them from `pageBody`/`pageBands`.
  - Use the returned ranges instead of comparing all versions.
  - Batch several steps with `updateMany` if the step-map approach needs it.

## S5: the engine validates and clamps what it's handed (task 3)

Commit: 412f709 `fix: validate what the webview hands the layout engine and never panic on it`.

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

- A panic hook writes any panic that is left to `console.error` before the instance traps, so a trap is never silent. The message is `the layout engine panicked: ` followed by Rust's panic info, which holds the location and the payload (`panicked at src/…/file.rs:12:5:\n<message>`). engine-editor's guard can pass it on as it is.
- TS side: nothing is required. Code that catches `setSettings` errors for big start numbers can drop that. The frontmatter reader may keep its own checks: the engine clamps anyway.

## S1: line affinity for ↑/↓, Home and End (task 4)

Commit: `fix: keep the caret on its line at line ends when moving up, down and to the end` (its hash is in the handoff message and the next section).

Where a line ends at the position where the next one starts (after a word broken because it is wider than the line), one position has two carets: at the end of one line and at the start of the next. `caret(pos, after)` already paints either one, and now the moves say which one they land on.

| | old | new |
|---|---|---|
| `vertical(pos, down, goal)` | `[kind, pos]` | unchanged (it assumes `after` false). A third element would break `toHit`, which wants exactly two |
| `verticalAt(pos, after, down, goal)` | — | `[kind, pos, after]` or `[]`: the move from the line the caret at `pos` is painted on (`after`, as `caret` takes it). The third number is 1 when the caret at the new position is to be painted at the end of its line (`caret(pos, true)`), 0 otherwise and for nodes |
| `lineEdge(pos, end)` | `pos` or -1 | unchanged (it assumes `after` false) |
| `lineBoundary(pos, after, end)` | — | `[pos, after]` or `[]`: the start (`after` 0) or end of the line the caret is painted on, with how to paint the caret there |

- Past the end of a line, `vertical` lands on that line's end, before its trailing space, never on the start of the next line. It never returns `end - 1` either: the end of the last line is the end of the text.
- TS side (engine-editor):
  - Keep an `after` flag with the caret, pass it to `verticalAt`/`lineBoundary` in place of `vertical`/`lineEdge`, and paint with `caret(pos, after)`.
  - Reset it to false on any other selection change (typing, clicks, Home).
  - `vertical` and `lineEdge` still work as before, but keep the bugs (↑ stuck and lines skipped at ragged ends, a second End walking down a broken word) until the TS side moves to the new ones.

## S2: block content in table cells (task 9)

Commit: `feat: lay out lists, quotes and images in table cells` (its hash is in the handoff message and the next section).

A cell gets `blocks`, used instead of `paragraphs` when it isn't empty. `paragraphs` is still read as before, so the old flatten.ts keeps working.

```jsonc
// a cell (Cell in model.rs)
{
  "header": false, "align": "left", "col": 0, "colspan": 1, "rowspan": 1,
  "paragraphs": [ /* Text, as before: used when "blocks" is empty or missing */ ],
  "blocks": [
    // a textblock: all fields of Text (pos, text, spans, style, level, top),
    // plus where it stands in the cell
    { "kind": "text", "pos": 5, "text": "flour", "spans": [], "style": "p",
      "indent": 18,        // points from the left of the cell's text, default 0
      "marker": "•",       // a list marker, "•" or "3.", optional
      "bars": [0] },       // quote bars, by their distance from the left of the cell's text, default []
    // an image, in points at its own size (0 × 0 while it isn't loaded); the
    // engine fits it to the cell's width, scaling it down only
    { "kind": "image", "pos": 12, "src": "cat.png", "width": 120, "height": 80, "alt": "a cat" }
  ]
}
```

- Flatten a list in a cell as one `text` block per paragraph:
  - `indent` is what the top level uses for the list's depth, from the cell's text.
  - `marker` goes on the first paragraph of each item.
  - A quote's paragraphs carry its `bars`. A bar reaches down to the next block when that block has the same bar.
- An image in a cell has its own `pos`, the ProseMirror position of the image node.
  - The engine shows it at `min(1, cell width / width)` of its size.
  - Without a size it shows its alt text (or src) in italics, as a top-level image does.
  - `boxes(pos, pos + 1)` gives its box, for a node selection of it.
- A `text` block with `"style": "code"` is set in IBM Plex Mono on its grey fill, as outside a table. Headings keep their style name too.
- Markers and alt texts are painted but aren't text of the document: the caret and hits only land in the text blocks.
- Every position in `blocks` moves with `update`'s `shift`, like the rest.
- TS side (engine-editor): have `flatten.ts` send `blocks` for cells with lists, quotes or images, instead of "￼" and flattened paragraphs. Cells of plain paragraphs may keep `paragraphs`.
