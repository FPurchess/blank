# engine-core progress

The tasks of `TASK.md`, ticked as each one is committed. The integrator deletes this file on merge.

- [x] 0. Split `engine.rs` into `engine/` and `items.rs` into `items/`, as a pure move
- [ ] 1. B1: incremental re-layout equals a full layout
- [ ] 2. S6: changed page ranges, body and band versions, `updateMany`
- [ ] 3. B2 / S5: no panic from JS input
- [ ] 4. B4 / S1: line affinity for ↑/↓ and End
- [ ] 5. Up/Down through the paragraphs of a cell, and past a table's caption
- [ ] 6. A page break near the bottom makes no blank page
- [ ] 7. A row nearly a page tall under repeated header rows
- [ ] 8. A heading stays with a captioned table
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
