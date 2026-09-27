---
paths:
  - "src/editor/plugins/tables/**"
  - "src/editor/commands/table/**"
  - "src/markdown/tables.ts"
  - "src/markdown/html.ts"
  - "src/exporters/table.ts"
  - "src/table*.ts"
---

# Tables: mouse handles and column widths

- **Mouse handles:** `src/editor/plugins/tables/handles.ts` measures the table under the mouse (the rows in its `<tbody>`, without the caption) and publishes its rows, columns, header layout and actions in `tableHandles`. It measures again only when the mouse reaches another table or the document, the selection, scrolling or the window changes; `src/tableHandles.ts` works out the hovered row and column from the pointer itself and runs the drags. Keep the overlay's ids and classes stable (listed in `vue-migration.md`).
- **Commands on a table at a position** live in `src/editor/commands/table/grid.ts`. They select what they work on with `selectIn` and run the toolbar's commands (`addRows`, `moveRows`, `deleteColumns`, ...) through `sequence`/`repeated` from `rect.ts`, so the same rules apply (nothing above the header row, a header column stays first) and each is one transaction and one undo step. `sequence` copies the steps of what plugins append too, so the next command's steps fit.
- **Column widths** set with the mouse are percentages in the cells' `colwidth`, one per column a cell spans (`columnPercents`, `cellWidths`, `withColumnPercents` in `src/markdown/tables.ts`). prosemirror-tables keeps them through inserts, deletes, merges and splits, and its `fixTables` gives new rows their columns' widths; a new column has none and gets the average. They make a table an HTML table (the `widths` reason of `gfmBlocker`), saved as a `<colgroup>` of percentages. `parseHtmlTable` reads them back only from Blank's own files; `normalizeTableHtml` drops `<colgroup>`, so pasted and imported tables size to their content. The NodeView renders them and doesn't freeze such tables; `tableGrid` gives them to the PDF and Word exports.
- **WebKitWebDriver** sends `pointerup` at 0, 0, so a drop uses the last `pointermove` position, and pointer capture sends `dblclick` to the overlay's root, so a double click on a column line is told apart from two quick presses.
