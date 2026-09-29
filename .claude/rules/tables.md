---
paths:
  - "src/editor/plugins/tables/**"
  - "src/editor/commands/table/**"
  - "src/markdown/tables.ts"
  - "src/markdown/html.ts"
  - "src/markdown/tokenizer.ts"
  - "src/exporters/table.ts"
  - "src/importers/docx/cleanup.ts"
  - "src/editor/contextMenu/model.ts"
  - "src/table*.ts"
  - "src/ui/TableToolbar.vue"
  - "src/ui/ToolbarButton.vue"
  - "src/ui/CaptionField.vue"
  - "src/ui/tableToolbarModel.ts"
  - "src/ui/TablePicker.vue"
  - "src/ui/tablePickerModel.ts"
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
- The commands are in `src/editor/commands/table/`. `actions.ts` there lists every action on a table once, with its label, icon, table-mode key and announcement. The toolbar (`src/ui/TableToolbar.vue`), table mode (`Mod+T` in a table) and the context menu's Table submenu all use that list, so a new action goes there.
- Actions announce what they did through `announcement`, which the status bar shows and screen readers read. `reporting()` in `tools.ts` joins that with what it led to, e.g. a table that's now saved as HTML.

## Mouse handles

- `src/editor/plugins/tables/handles.ts` measures the table under the mouse through the engine (`tableGeometry` in `src/engine/geometry.ts`, the rows without the caption) and publishes its rows, columns, header layout and actions in `tableHandles`. A table on several pages shows the handles of its piece under the mouse: `rows` are that page's rows, from `firstRow` of `rowCount`, without the header rows repeated there, and its bottom edge only where the table ends. It measures again only when the mouse reaches another table or piece, or the document, the selection or `pageViewport` changes. `src/tableHandles.ts` works out the hovered row and column from the pointer itself and runs the drags. Keep the overlay's ids and classes stable (listed in `vue-migration.md`).
- Commands on a table at a position live in `src/editor/commands/table/grid.ts`. They select what they work on with `selectIn` and run the toolbar's commands (`addRows`, `moveRows`, `deleteColumns`, ...) through `sequence`/`repeated` from `rect.ts`, so the same rules apply (nothing above the header row, a header column stays first) and each is one transaction and one undo step. `sequence` copies the steps of what plugins append too, so the next command's steps fit.
- WebKitWebDriver sends `pointerup` at 0, 0, so a drop uses the last `pointermove` position; and pointer capture sends `dblclick` to the overlay's root, so a double click on a column line is told apart from two quick presses.

## Column widths

- Widths set with the mouse are percentages in the cells' `colwidth`, one per column a cell spans (`columnPercents`, `cellWidths`, `withColumnPercents` in `src/markdown/tables.ts`). prosemirror-tables keeps them through inserts, deletes, merges and splits, and its `fixTables` gives new rows their columns' widths; a new column has none and gets the average.
- They make a table an HTML table (the `widths` reason of `gfmBlocker`), saved as a `<colgroup>` of percentages. `parseHtmlTable` reads them back only from Blank's own files; `normalizeTableHtml` drops `<colgroup>`, so pasted and imported tables size to their content.
- The NodeView renders them and doesn't freeze such tables.
- The page view lays tables out in the engine (`src-tauri/layout/src/items.rs`, `table_units`) with the widths of `tableGrid`, which `flatten.ts` sends. While the cursor is in a table without set widths, `frozenWidths` (`plugins/pageView.ts`) keeps the widths it had when the cursor went in, so the painted columns don't move while typing; they follow the text again once the cursor leaves. The NodeView's own freezing only concerns the hidden DOM.
- The engine keeps rows that merged cells join together, slices a row taller than a page between its lines (each slice is a unit, see `Unit::clip`), repeats the header rows on every page, keeps the header rows with the first row and the caption with the table.

## Clipboard

- `src/editor/plugins/tables/clipboard.ts` (`tableClipboard`, before `tableEditing`, whose paste it wraps):
  - `transformPastedHTML` runs every table from another app (HTML without `data-pm-slice`) through `normalizeTableHtml`, promoting the first row to the header outside a table; `transformPasted` then aligns those tables by column (`withColumnAlignment`), since spreadsheets align each cell by what it holds. Blank's own copies are kept as they are.
  - `clipboardTextParser` turns tab-separated text (`parseTsv`, with spreadsheet quoting, a quote that doesn't enclose a whole cell read as text, and lines indented with tabs, an empty first column, kept as text) into a table, unless it's a paste as plain text: ProseMirror's `pasteText` always says plain, so the menu's paste goes through `pasteText(view, text, plain)` from this module.
  - `handlePaste` runs prosemirror-tables' paste, for cells and for anything pasted into selected cells, with a dispatch that retypes the cells it lands on (header cells in the header rows and header column, plain cells elsewhere).
  - `clipboardTextSerializer` writes copied cells as tab-separated text (`tsvOf`), with empty cells where merged cells span; the menu's copy fallback gets it through `view.serializeForClipboard`.
- E2E and the docs recordings paste with `paste()` from `e2e/helpers.ts`, a synthetic paste event with clipboard data, since the system clipboard is out of reach there.
- The mouse handles hide on the DOM `keydown`, not `handleKeyDown`: the table keys handle Tab and Enter before them.

## Export and import

- Both exporters lay tables out with `tableGrid` (`src/exporters/table.ts`: cells with spans, header rows, the column widths set or else by content) and draw them in the colours of the light theme (`TABLE_COLORS`).
- The Word import keeps tables through `normalizeTableHtml` in `cleanup.ts`.
