# engine-core progress

The tasks of `TASK.md`, ticked as each one is committed. The integrator deletes this file on merge.

- [x] 0. Split `engine.rs` into `engine/` and `items.rs` into `items/`, as a pure move
- [x] 1. B1: incremental re-layout equals a full layout
- [x] 2. S6: changed page ranges, body and band versions, `updateMany`
- [x] 3. B2 / S5: no panic from JS input
- [x] 4. B4 / S1: line affinity for ↑/↓ and End
- [x] 5. Up/Down through the paragraphs of a cell, and past a table's caption
- [x] 6. A page break near the bottom makes no blank page
- [x] 7. A row nearly a page tall under repeated header rows
- [x] 8. A heading stays with a captioned table
- [ ] 9. S2: lists, quotes and images in table cells
- [ ] 10. The PDF text layer keeps combining marks and ligature parts
- [ ] 11. S3: one shared font store
- [ ] 12. S4: failed image decodes and broken fonts in the PDF
- [ ] 13. Tags, `/Lang` and bookmarks in the PDF
- [ ] 14. Variable-font coordinates
- [ ] 15. Fallback families as a list, not CSS
- [ ] 16. Waste in `page_ops` and per keystroke
- [ ] 17. Dead and test-only code
- [ ] 18. The exactness tests prove more

## Notes

### Task 0: the split

- `engine.rs` (1996 lines) is now:
  - `engine/mod.rs`: `Engine`, `Page`, `Frag`, `Stats`, setting up and changing the items, band texts
  - `engine/paginate.rs`: `Paginator`, `Tail`, `paginate_from`, `page_of_frag`
  - `engine/navigate.rs`: `Hit`, positions, caret, hit, word, vertical, line edges
  - `engine/select.rs`: selection, boxes, page spans, `table_grid`
  - `engine/display.rs`: `Op`, `page_ops`, the bands' boxes
  - `engine/text_layer.rs`: `Word`, `lines`, `words`
  - `engine/test_support.rs`: the builders the tests share
- Every test now sits next to the code it tests.
- `items.rs` is split into `items/mod.rs` and `items/table.rs` (the table layout).
- `pub use` keeps the public paths (`crate::engine::{Engine, Hit, Op, Word, GridRow, TableGrid}`, `crate::items::TableSpec`).
- `text.rs` stays one file. It is one type, `TextBox`, whose methods all work on one Parley layout, plus `push_span` and its tests. No seam splits it into concerns that could be reviewed apart.
- Proof:
  - `cargo test -p blank-layout`: 32 unit tests and 2 exact tests before and after.
  - clippy on wasm32 is clean. `--all-targets` keeps the two warnings it had before, in test code: `+ 0` in a test (task 17) and `read_words` in `tests/exact.rs` (engine-release's).
  - The wasm (`blank_layout.wasm` before wasm-bindgen, from `bun run engine:build`): the code section is 3,145,645 bytes in both, with 4165 functions. The data section grew by 192 bytes, from the longer file paths of the panic locations.
  - Method: `wasm-tools strip --all`, then `wasm-tools print`, dropping the data segments. Types were canonicalized by signature, and every `i32.const` and load/store `offset` that points into the data (≥ 1 MiB) was masked. The text still differs from function 298 on, because LTO orders the functions differently (legacy mangling puts the impl's module path into the symbol names).
  - With function numbers and call targets normalized too, the multisets of function bodies are identical: 0 bodies only before, 0 only after. So only the order and the addresses of panic locations changed.

### Task 1: incremental equals full

- `update` starts paginating at the page before the change's first fragment, so what follows can flow back onto it.
  - Pagination only looks ahead within an item and from a run of headings to what follows it, and `update` already walks back over the headings.
- Keeping versions:
  - A page paginated again keeps its version when it has the old page's fragments, of items that weren't laid out again (`ItemMap`).
  - So the extra page isn't painted again.
  - `add_font`, `set_settings` and `set_items` still give every page a new version.
- The settled shortcut is sound: a page starts the same way wherever it opens, and what is placed on it from there only looks ahead at old items. The comment in `Paginator::place` says why.
- `incremental_equals_full` (`engine/incremental_tests.rs`):
  - 4 settings × 25 random edits by default
  - The settings: new pages before chapters, bands with `{page} of {pages}` and `{chapter}`, and a small page.
  - The edits: paragraphs, headings, list items, quotes, breaks, rules, images (loaded, not loaded, taller than the page), and tables (header rows, captions, rows taller than a page).
  - After each edit it compares the items, the text positions, the laid-out count, fragments, pages and `page_ops` with a fresh engine, and checks the versions both ways.
  - Against the old code it fails at step 20 of the first run.
  - `BLANK_PROPERTY_STEPS=2000 cargo test --release` (8000 edits) passed in 18 min.
  - Mutation checks: never keeping a repaginated page's version, and keeping it unconditionally, each fail the version assertions.

### Task 2: S6

- Pages have three versions:
  - `version`: the body or the bands changed, as before
  - `body_version`
  - `band_version`
- `update`, `update_many`, `set_items`, `set_settings` and `add_font` return `Changes`, the ranges of pages whose body and bands changed. See `SEAM.md`.
- A `set_settings` that doesn't lay out again (new bands, say) keeps the body versions of pages with the same fragments.
- `update_many` applies several changes and paginates once. `ItemMap` keeps track of which items are the old ones, and the tail after the last change still settles.
- The `shift` covers every position the engine keeps. Checked by the property test, which compares the items and the text boxes' positions after every edit.
- The `Laid` cache is reused: the property test checks that only the inserted items are laid out (`stats.laid_out`).
- Tests:
  - The property test now also sends a quarter of its steps as 2–3 edits through `update_many` (sometimes out of order).
  - It checks body and band versions both ways, and that the reported ranges are exactly the pages whose versions changed.
  - New tests:
    - `a_new_page_changes_only_the_bands_of_the_others` (`{pages}` in the footer)
    - `new_bands_keep_the_bodies`
    - `a_new_font_changes_every_body`
    - `splices_runs_of_items`
  - Mutation checks: ignoring out-of-order entries, and keeping band versions whose texts changed, each fail it.

### Task 3: B2 / S5

- Every check sits in native code so cargo can test it: `fonts::split_files`, `Settings::sanitize`, `Item::sanitize`, `read_start_number`, `items::table::place` (`MAX_COLUMNS`) and `bands::format_number` (`LARGEST_ROMAN`). `wasm.rs` only calls them. `wasm.rs` is wasm32-only, so its methods can't run under cargo test.
- The engine sanitizes in `set_settings`, `set_items` and `update_many`, so every entry point is covered.
- The unwraps and indexing that input could reach are gone: `Paginator::place`, `vertical`, `box_near` and the list marker's baseline.
- What stays is indexing by construction:
  - every `Laid` has at least one unit (`lay_out`)
  - the table's `edges`/`tops` start with one entry
  - a text box always has a line (an empty one lays out a space)
  - `text_layer::lines` checks `first()` before `last()`
- Positions near `u32::MAX` add with `saturating_add` (`Item::to`, `TextBox::pos_of`, `selection`).
- `boundary_tests.rs`: start numbers, huge roman numbers, a page out of range, items with infinite numbers, merged cells at `u32::MAX`, and every query with out-of-range and non-finite arguments on an empty engine and one with a table. `fonts::tests` checks the font lengths, and `bands::tests` the roman limit.

### Task 4: B4 / S1

- `TextBox::hit_line(line, x)`: past a line's end it lands on that end (before the trailing space), with `after` true where the next line starts at the same position.
- `TextBox::line_end(line)`: the end, with the same `after`.
- `vertical(pos, after, down, goal)` starts from the line the caret is painted on (`caret(pos, after)`) and returns `(Hit, after)`. `line_edge(pos, after, end)` returns `(pos, after)`.
- wasm: `vertical` and `lineEdge` keep their shapes. A third element in `vertical`'s result broke the TS `toHit`, which wants exactly two, so the new calls are `verticalAt` and `lineBoundary` (`SEAM.md` S1).
- Tests:
  - `moves_up_and_down_along_ragged_lines` (↓↓↑↑ visits lines 1, 2, 1, 0)
  - `ends_a_line_broken_inside_a_word_on_that_line` (End paints on the same line, a second End stays put, Home, ↓, the last line's End is the text's end)
  - Both fail without the snapping and the `after`.

### Task 5: arrows in cells and over captions

- Before leaving a table row's unit, `vertical` moves to the next or previous paragraph of the same cell (`box_in_column`: the nearest box below or above that overlaps the current one horizontally).
- Entering a unit, ties between boxes break by y: the first going down, the last going up.
- A sliced row starts from the first or last line that slice shows.
- The text-less caption unit is skipped, so ↓ above a captioned table lands in its first cell, and ↑ from there goes back into the text above.
- Tests: `multi_paragraph_cell_down_arrow`, `multi_paragraph_cell_up_arrow` and `down_arrow_over_captioned_table`. All three failed before, as the probes did (24 / 6 / `Node(20)`).

### Task 6: page breaks

- A `Break` gets no space above it and no fit check. It ends the page it is on, even when the space below the paragraph before it reaches past the bottom.
- Decision, matching the Word export (`src/exporters/docx/index.ts:155-173`):
  - A trailing page break makes an empty last page.
  - Two breaks in a row leave an empty page.
  - A break at the very start still makes no empty first page.
- Tests: `break_near_bottom_has_no_blank_page` (3 pages before, 2 now) and `page_break_at_end`.

### Task 7: tall rows under repeated headers

- In a table with header rows, a body row stays whole only if it fits under the header rows (`slice_room(false)`). Otherwise it's sliced between its lines like a row taller than the page.
- The paginator needed no change: after the repeats a page is no longer fresh, so the fit check runs.
- Test `nearly_page_tall_row_under_repeated_header`: every fragment ends above the content bottom (before: 777.15 against 771.02), and every line of the row is shown once.

### Task 8: headings before captioned tables

- `keep_height` adds the whole `keep_next` chain of the block after the headings: its first unit and the ones that stay with it, e.g. a table's caption, header rows and first row. This is the same loop `run` uses.
- This lookahead still stays within the item right after the heading run, so `update`'s restart point (task 1) still holds.
- Test `heading_stays_with_captioned_table` (before: the heading on page 0, the table on page 1).

### Timings: ms per `update`, one character typed into the middle paragraph, release

`update_timing` (`--ignored`), the best of 5 runs of 40 updates, and here the best of 3 such runs. The machine was shared with other builds (load average about 35), so differences below about 30% are noise. Task 1's code and task 2's code were run alternately.

| pages | after task 1 | after task 2 | after task 16 |
|---|---|---|---|
| 1 | 0.147 | 0.139 | |
| 39 | 0.165 | 0.166 | |
| 200 | 0.311 | 0.286 | |
| 823 | 1.019 | 1.267 | |
