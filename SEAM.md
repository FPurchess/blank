# The seam between the layout engine and the TS side

What engine-core changed in the wasm API (`src-tauri/layout/src/model.rs` and `wasm.rs`, against `src/engine/flatten.ts` and `src/engine/engine.ts`). engine-editor adapts once the integrator has merged each commit, with a rebuilt wasm.

Each change gives:
- the old and new signature or JSON shape
- what the TS side must do
- whether the old form still works
- the commit it came in

Old forms are kept where that's cheap, so the TS side keeps working with the new wasm until it switches.

In the order they landed: S6 (task 2), S5 (task 3), S1 (task 4), S2 (task 9), S3 (task 11), S4 (tasks 12 and 13), then the font indices of task 14 and `test-hooks` of task 17, which change no shape.

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
  - Fixed after e9f8ef2, in e2ac963 ("fix: settle updateMany only on a tail that reaches the old end"): an `updateMany` whose last entry deleted the last items could copy their old fragments and panic. `update` alone was never affected. Merge the fix together with S6 if `updateMany` is used.
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
| image `width`/`height` above 100 000 pt (`MAX_IMAGE`), top-level or in a cell | a cell image of 1e20 pt hung the engine; 1e36 wrote `inf` into the page JSON | scaled down to 100 000 pt on its longer side, keeping its shape |
| numbers in the page JSON | `inf`/`NaN` possible | always a JSON number, 0 for what isn't finite |
| `bars` | any number | at most 64 (`MAX_BARS`), top-level and in cells |
| table `widths` whose sum isn't finite or ≤ 0 | every column at the indent | equal columns |
| links in one textblock | the 65 536th turned into inline code | at most 65 535, the rest shown as text |
| a font's units per em outside 16–16384 | used as it is (0: NaN underlines) | 1000 |
| a band slot | expanded without a limit | at most 1000 characters (`MAX_SLOT`) |
| table `widths` | as given | not finite or negative → 0 |
| cell `col`/`colspan` | `u32::MAX` overflowed or allocated the grid | the grid has at most 1000 columns (`MAX_COLUMNS`) |
| `hit`, `word`, `vertical` with a non-finite x, y or goal | undefined | `[]` (nothing) |
| any position or page out of range | mostly nothing, some panics | nothing (empty arrays, `-1` for `lineEdge`) |

- A panic hook writes any panic that is left to `console.error` before the instance traps, so a trap is never silent. The message is `the layout engine panicked: ` followed by Rust's panic info, which holds the location and the payload (`panicked at src/…/file.rs:12:5:\n<message>`). engine-editor's guard can pass it on as it is.
- TS side: nothing is required. Code that catches `setSettings` errors for big start numbers can drop that. The frontmatter reader may keep its own checks: the engine clamps anyway.

## S1: line affinity for ↑/↓, Home and End (task 4)

Commit: 2285ac5 `fix: keep the caret on its line at line ends when moving up, down and to the end`.

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

Commit: d8a00cf `feat: lay out lists, quotes, code and images in table cells`.

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
- **Addition (list context on image blocks):** an `image` block takes the same `indent`, `marker` and `bars` as a `text` block. All three are optional (defaults 0, none, []), so old JSON lays out as before.
  - The image is placed at the cell's left + `indent` and fitted to the width left. Its marker is right-aligned before the indent, at the image's top (as a top-level image's marker is).
  - Its bars span it, and reach over the gap to the next block when it has the same bar. An image that isn't loaded shows its alt text at that place.
  - In the PDF, a marked image is an LI whose LBody holds its Figure.
  - Shape: `{"kind":"image","pos":12,"src":"cat.png","width":120,"height":80,"alt":"a cat","indent":18,"marker":"•","bars":[0]}`.
  - TS side (engine-editor): `flatten.ts` puts the list's `indent`/`marker` and the quote's `bars` on image blocks, as it does on text blocks.
- TS side (engine-editor): have `flatten.ts` send `blocks` for cells with lists, quotes or images, instead of "￼" and flattened paragraphs. Cells of plain paragraphs may keep `paragraphs`.

## S3: one shared font store (task 11)

Commit: 0a23959 `feat: let engines share one store of fonts`.

The font files live once in the wasm instance, shared by reference (`Arc`) between the engines made from one another. wasm memory never shrinks, so every copy of a 20 MB CJK font used to stay for good.

| | old | new |
|---|---|---|
| `new LayoutEngine(bytes, lengths)` | copies the files | unchanged: the first engine still gets its files this way |
| `LayoutEngine.withFontsOf(other)` | — | static: a new engine with `other`'s fonts at that moment (the ones it was made with and every `addFont` fallback), sharing their files. Its page, items and images are its own. Fonts added to either engine later stay its own |
| `fontFileCount()` | — | the number of font files, each once (a `.ttc` is one file), in the order they came: the constructor's, then `addFont`'s |
| `fontFile(i)` | — | `Uint8Array`, a copy of file `i`'s bytes (empty for none) |
| `fontFileFamily(i)` | — | the family file `i` was added for with `addFont`, `""` for the constructor's files and for none |

- TS side (engine-editor):
  - `src/engine/pdf.ts` makes the export engine with `LayoutEngine.withFontsOf(pageEngine.raw)` instead of `newEngine()`, so it doesn't copy the 14 base fonts and every fallback again, and frees it with `free()` as now.
  - Don't keep the font bytes in JS for it.
- For a PDF worker with a fresh wasm instance (after a trap):
  - Read `fontFileCount()`, `fontFile(i)` and `fontFileFamily(i)` from the page engine *before* it traps, or from where the files came from.
  - Pass the files with family `""` to `new LayoutEngine(bytes, lengths)` in their order, then `addFont(fontFile(i), fontFileFamily(i))` for the others, in their order.
  - This gives the same font indices and the same layout. `addFont` lays out again, which is cheap before `setItems`.
- A PDF from an engine that shares the fonts is byte for byte the PDF of an engine with its own copies (cargo test `engines_share_their_fonts`).

## S4: `pdf()` takes the language and reports warnings (tasks 12 and 13)

Commits: 6092203 `fix: write the alt text of images the PDF can't decode, and warn about them` (task 12), and 25439ad `feat: tag the PDF and give it a language and bookmarks` (task 13).

| | old | new |
|---|---|---|
| `pdf(title, author)` | `Uint8Array`; a failed image was left blank, or failed the whole export | `pdf(title, author, language?)` → `Uint8Array`. `language` is a BCP 47 tag (`"de"`, `"de-CH"`), optional: without it the PDF has no `/Lang` |
| `pdfWarnings()` | — | JSON of what went wrong in the last `pdf()`: `[{"kind":"image","src":"…"}, {"kind":"font","font":7,"family":"Noto Sans CJK SC"}]`, `[]` for nothing |

- **Images**:
  - An image handed over with `addImage` that can't be decoded shows its alt text (or its src) in italics in its box, as the screen shows an image that isn't loaded, and gets an `image` warning, once per src.
  - This holds both when its header can't be read and when only its pixels are broken: krilla finds the latter only while writing, so the engine writes the PDF again without it.
  - An image that was never handed over also shows its alt text, without a warning, since `prepareImages` already reports it.
- **Fonts**: a font krilla can't embed would be left out, with a `font` warning and its `family` (empty for the fonts the engine was made with), and the rest written. krilla 0.8.2 draws the glyphs of fonts without outline tables as Type3 glyphs, so none of the tried cases fails any more (see `PROGRESS-core.md`, task 12).
- **TS side (engine-editor)**:
  - `src/engine/pdf.ts` passes the document's language, the `language` setting, as the third argument.
  - Add `JSON.parse(raw.pdfWarnings())` to the export's `warnings`, e.g. "The image cat.png couldn't be put into the PDF", next to `failureWarning(failures)`.
  - Old callers of `pdf(title, author)` still work.

### Task 13: what the language and the tags give

- With `language`, the PDF's catalog has `/Lang`, and so does its structure's root. Screen readers read it in that language.
- The PDF is tagged (`pdfinfo`: "Tagged: yes"):
  - headings `H1`–`H6` (the heading text as their title)
  - paragraphs `P`, code blocks `P` > `Code`
  - lists `L` (numbered when the marker ends in "."), nested by indent, of `LI` > `Lbl` (the marker) + `LBody`
  - quotes `BlockQuote`, nested by their bars
  - tables `Table` > `Caption`, `TR` > `TH` (header cells and the cells of header rows) / `TD` > `P` and `Figure`
  - images `Figure` with their alt text (or src)
  - links `Link` with the link annotation
  - Headers, footers, rules, fills and lines are artifacts.
- The PDF has bookmarks: one per heading, nested by level, jumping to where it starts.
- TS side: nothing beyond passing `language` (above). There is no PDF/A: that's the owner's decision.

## Font indices of variable-font instances (task 14)

Commit: 53c9198 `fix: paint and embed glyphs of variable fonts at their coordinates`.

No shape changes. What changes is which numbers `font` can be:

- The `font` of a glyph run (in `page`/`pageBody`/`pageBands`), and what `glyphPath(font, id)` and `unitsPerEm(font)` take, is a **font index**.
  - Below the number of faces (as before), it's a face of a font file, at its default coordinates.
  - From `INSTANCE_BASE` = 1 048 576 (2^20) on, it's an instance of a variable face at other coordinates, e.g. the bold of Noto Emoji, whose weight varies.
- `glyphPath` gives an instance's outline at its coordinates, and `unitsPerEm` its face's.
- An index never changes its meaning, not even when `addFont` adds faces later, so a cache keyed by `font * 0x10000 + id` (as `engine.ts` has it) stays right.
- `fontFileCount`/`fontFile`/`fontFileFamily` count files, never instances.
- TS side: nothing to change. Just don't assume that `font` is less than the number of faces.

## `test-hooks`: the exports only tests use (task 17)

Commit: 2ae1a64 `chore: drop dead code, gate the test exports and check the casts`.

- `stats()` and `words()` (and `Engine::words`) are behind the cargo feature `test-hooks`, which is **on by default**. So `scripts/build-engine.sh` builds them as before, and `src/engine/engine.test.ts:73` (`raw.stats()`) and `src/engine/exact.test.ts` (`raw.words()`) keep working.
- Leaving them out of the production wasm is a later release decision (the coordinator's call, not part of these tasks). It needs `--no-default-features` in the production build and a separate build with the feature for the TS tests. The crate builds and passes clippy both ways.
- Removed, and not exported: `Engine::lines`, which nothing used.
