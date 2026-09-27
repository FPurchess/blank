---
paths:
  - "src/editor/plugins/tables/**"
  - "src/editor/commands/table/**"
  - "src/markdown/tables.ts"
  - "src/markdown/html.ts"
  - "src/markdown/tokenizer.ts"
  - "src/exporters/table.ts"
  - "src/importers/docx/cleanup.ts"
  - "src/table*.ts"
---

# Tables

## Saving and reading

- A table is saved as a GFM pipe table while `gfmBlocker` (`src/markdown/tables.ts`) returns null, and as an HTML table otherwise (merged cells, blocks in cells, a caption, column widths, ...), which the `html_table` rule in `tokenizer.ts` reads back; other HTML stays text.
- `normalizeTableHtml` (`html.ts`) cleans every HTML table that comes in.

## Editing

- The editing lives in `src/editor/plugins/tables/`:
  - `keys.ts`: Tab, Enter as a line break in plain cell text, leaving at the edges, Backspace only clears cells;
  - `guard.ts`: no table, heading or rule in a cell, and a paragraph next to tables at the edges of the document;
  - `view.ts`: the NodeView, which freezes the column widths while the cursor is in the table;
  - `picker.ts`, `tools.ts` (the table toolbar and table mode) and `handles.ts` (the mouse handles, below).
- The commands are in `src/editor/commands/table/`. `actions.ts` there lists every action on a table once, with its label, icon, table-mode key and announcement. The toolbar (`src/tableToolbar.ts`), table mode (`Mod+T` in a table) and the context menu's Table submenu all use that list, so a new action goes there.
- Actions announce what they did through `announcement`, which the status bar shows and screen readers read. `reporting()` in `tools.ts` joins that with what it led to, e.g. a table that's now saved as HTML.

## Mouse handles

- `src/editor/plugins/tables/handles.ts` measures the table under the mouse (the rows in its `<tbody>`, without the caption) and publishes its rows, columns, header layout and actions in `tableHandles`. It measures again only when the mouse reaches another table or the document, the selection, scrolling or the window changes. `src/tableHandles.ts` works out the hovered row and column from the pointer itself and runs the drags. Keep the overlay's ids and classes stable (listed in `vue-migration.md`).
- Commands on a table at a position live in `src/editor/commands/table/grid.ts`. They select what they work on with `selectIn` and run the toolbar's commands (`addRows`, `moveRows`, `deleteColumns`, ...) through `sequence`/`repeated` from `rect.ts`, so the same rules apply (nothing above the header row, a header column stays first) and each is one transaction and one undo step. `sequence` copies the steps of what plugins append too, so the next command's steps fit.
- WebKitWebDriver sends `pointerup` at 0, 0, so a drop uses the last `pointermove` position; and pointer capture sends `dblclick` to the overlay's root, so a double click on a column line is told apart from two quick presses.

## Column widths

- Widths set with the mouse are percentages in the cells' `colwidth`, one per column a cell spans (`columnPercents`, `cellWidths`, `withColumnPercents` in `src/markdown/tables.ts`). prosemirror-tables keeps them through inserts, deletes, merges and splits, and its `fixTables` gives new rows their columns' widths; a new column has none and gets the average.
- They make a table an HTML table (the `widths` reason of `gfmBlocker`), saved as a `<colgroup>` of percentages. `parseHtmlTable` reads them back only from Blank's own files; `normalizeTableHtml` drops `<colgroup>`, so pasted and imported tables size to their content.
- The NodeView renders them and doesn't freeze such tables.

## Export and import

- Both exporters lay tables out with `tableGrid` (`src/exporters/table.ts`: cells with spans, header rows, the column widths set or else by content) and draw them in the colours of the light theme (`TABLE_COLORS`).
- The Word import keeps tables through `normalizeTableHtml` in `cleanup.ts`.
