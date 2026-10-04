# Tables

Tables in Blank work like the rest of your writing: you type, press `Tab` to go to the next cell, and the table grows as you need it. The columns stay put while you type, and nothing is ever lost by a key pressed at the wrong time. Your tables are saved as plain markdown tables that GitHub, Obsidian, Typora and pandoc show as tables too.

<img class="shot" src="/screenshots/table-insert.gif" alt="Mod T opens a grid, the arrow keys make it four columns wide, Enter inserts the table, Tab fills it cell by cell and the arrow key leads out of it" />

## Make a table {#make}

There are three ways:

- **`Mod` `T`** shows a small grid under the cursor. Pick the size with the arrow keys and press Enter, or point at the size and click. Want the usual? `Mod` `T` then Enter gives you three columns with a header row and two rows.

- **Type the header.** On an empty line, type the column titles between pipes and press Enter:

  ```md
  | Name | Qty | Price |
  ```

  The line becomes a table with that header and an empty row, and the cursor waits in the first cell. Changed your mind? `Mod` `Z` gives you back the line as you typed it.

  <img class="shot" src="/screenshots/table-header.gif" alt="Typing | Name | Role | and Enter turns the line into a table, which Tab then fills" />

- **Paste one** from a spreadsheet, a web page or Word, see [Copy and paste](#clipboard).

The first row is the header. It's bold and tinted, and screen readers announce it with every cell.

## Move around {#move}

| Key                    | What it does                                              |
| ---------------------- | --------------------------------------------------------- |
| `Tab`                  | Next cell, with its text selected so you can type over it |
| `Shift` `Tab`          | Previous cell                                             |
| `Tab` in the last cell | Adds a row and moves into it                              |
| Arrow keys             | Move through the text and from cell to cell               |

**You can't get stuck in a table.** The arrow keys leave it at every edge: down from the last row, up from the first, right from the end of the last cell and left from the start of the first. Blank always keeps an empty line before a table at the start of the document, after one at the end and between two tables, so there's always a place to click and write.

## Write in a cell {#cells}

A cell is a small page of its own. Bold, italic, code, links and images all work in it, and so do several paragraphs, lists, quotes and code blocks. Only headings, tables and horizontal lines stay outside cells.

<img class="shot" src="/screenshots/table-cells.gif" alt="Enter starts a second line in a cell; Shift and the left arrow select two cells, which Backspace clears" />

- **Enter** starts a new line in the cell.
- **Enter on an empty line** turns it into a new paragraph.
- **Lists and quotes**: `Mod` `8` starts a bullet list in the cell, `Mod` `9` a numbered one and `Mod` `G` a quote. Inside them, Enter continues the list as usual.

Typing `1. `, `- ` or `> ` at the start of a cell keeps the text as you typed it, since cells often hold values like _1. place_ rather than lists. For the same reason, Blank doesn't capitalize the first word of a cell, so `kg`, `n/a` or `yes` stay as they are.

## Select and delete {#select}

`Shift` + arrow keys selects whole cells as soon as the selection crosses a cell border. The selected cells are tinted.

| Key                            | What it does                                            |
| ------------------------------ | ------------------------------------------------------- |
| `Backspace` or `Delete`        | Clears the selected cells, rows and columns stay        |
| `Mod` `A`                      | Selects the cell, then the whole table, then everything |
| `Backspace` on the whole table | Deletes the table                                       |

To delete a table, click the bin on its toolbar, or press `Mod` `A` twice in it and then `Backspace`. Or press `Backspace` at the start of the line after the table: the first press selects the table, the second deletes it. A table you just made and haven't written in yet goes away with `Backspace` in its first cell. `Mod` `Z` brings anything back.

## Change a table {#change}

While the cursor is in a table, a small toolbar sits above its right end. It adds and deletes rows and columns, aligns columns, sorts, merges cells, switches the header row and a header column on and off, and sets the caption. Everything on it works on what you've selected: with three rows selected, _Insert row below_ adds three rows, and _Align right_ aligns every selected column. Rest the pointer on a button to see what it does.

<img class="shot" src="/screenshots/table-mode.gif" alt="Mod T shows a key on every button of the table toolbar; the down arrow adds a row, S sorts by the column, R aligns it right, and Esc ends table mode" />

**From the keyboard:** press `Mod` `T` in a table. Every button of the toolbar shows its key, and the keys work until you press `Esc` or `Mod` `T` again:

| Key                               | What it does                                           |
| --------------------------------- | ------------------------------------------------------ |
| `↑` `↓` / `←` `→`                 | Insert rows above or below / columns left or right     |
| `Shift` + `↑` `↓` / `←` `→`       | Move the selected rows / columns                       |
| `Backspace` / `Shift` `Backspace` | Delete the selected rows / columns                     |
| `Mod` `Backspace`                 | Delete the table                                       |
| `L` `C` `R`                       | Align the selected columns left, centered or right     |
| `S`                               | Sort by this column; press again to sort the other way |
| `M`                               | Merge the selected cells, or split a merged cell       |
| `H` / `Shift` `H`                 | Header row / header column on or off                   |
| `T`                               | Write the caption, Enter keeps it                      |
| `W`                               | Reset the column widths you set with the mouse         |

The letters stay where they are on your keyboard, whatever its layout. Any other key ends table mode without typing anything, and shortcuts like `Mod` `S` still do their job.

**From the menu:** right-click a cell and open _Table_, which has everything, including moving rows and columns.

A few things good to know:

- **Sorting** keeps the header row on top and puts empty cells last. Numbers sort by their value, also with a decimal comma like _1,5_ in German, dates by their day, and text the way your language sorts it, _item 9_ before _item 10_.
- **Rows move below the header** and a header column stays first. Deleting the header row makes the row below it the header.
- **Merged cells** keep everything they held. Splitting a cell leaves its content in the first cell.
- The status bar says what happened, like _2 rows added_, and screen readers read it out.

## Change a table with the mouse {#mouse}

Move the mouse over a table and it shows handles right where you need them. They step aside while you type.

<img class="shot" src="/screenshots/table-mouse.gif" alt="Dragging the handle of the Kiwis row moves it to the top; the + between two rows inserts one, which gets filled; dragging the line between two columns widens the first; dragging the bottom edge adds two rows" />

- **Move rows and columns:** grab the handle on the left edge of a row, or on the top edge of a column, and drag it where it should go. A line shows where it lands. With several rows selected, dragging one of their handles moves them all.
- **Select them:** click a handle. The row or column gets selected and the table menu opens right there, to delete it, align it, sort by it and more.
- **Insert one:** point at the line between two rows on the table's left edge, or between two columns on its top edge, and click the **+** that shows up.
- **Resize columns:** drag the line between two columns. The columns on both sides share their width anew, and the table keeps its width. A double click on the line gives the columns their widths by content again, as does _Reset column widths_ in the table menu.
- **Grow and shrink the table:** drag its right edge, its bottom edge or its corner. A dashed outline shows the new size, like _4 × 6_. Growing adds empty rows and columns at the end; shrinking only takes away empty ones, so nothing you wrote gets lost.

`Esc` cancels a drag, and `Mod` `Z` undoes any change in one step.

## Copy and paste {#clipboard}

Tables move between Blank and your spreadsheet in both directions.

<img class="shot" src="/screenshots/table-paste.gif" alt="Mod V pastes cells copied from a spreadsheet as a table; with the cursor in the table, Mod V pastes two more rows, and the table grows to take them" />

- **Paste cells** you copied in LibreOffice Calc, Excel, Google Sheets or Numbers, or a table from a web page or Word, and you get a table. Its first row becomes the header. A column keeps its alignment when all its cells agree, like numbers aligned right.
- **Paste into a table**, and the cells fill from the cursor, or fill the cells you selected. The table grows when they need more room. The pasted cells fit in where they land: header cells in the header row, plain cells below it.
- **Copy cells**, selected with `Shift` + arrows or `Mod` `A`, and paste them into a spreadsheet: every cell lands in its own cell there.
- **Paste as plain text** in the right-click menu keeps copied cells as text.

Tables pasted from elsewhere get their widths from their content, like any other table.

## How tables are saved {#saving}

A table is saved as a markdown table, with the columns lined up so the file reads well in any text editor:

```md
| Name   | Qty | Price |
| ------ | --: | ----: |
| Apples |   3 |  1.20 |
| Pears  |  12 |  0.80 |
```

Line breaks in a cell are saved as `<br>`, and the colons in the second line keep the alignment of each column.

A markdown table holds one line of text per cell. When a table needs more, like a list or several paragraphs in a cell, merged cells, a header column, a caption or column widths you set, Blank saves that one table as an HTML table in the same markdown file, and tells you the first time. GitHub, Obsidian, Typora and pandoc show it as a table as well. Once the table fits a markdown table again, Blank saves it as one.

Blank opens both kinds, so you can also open markdown files with tables written in other editors.

## PDF and Word {#export}

Tables go into your [PDF and Word documents](./files) the way you see them in Blank: the tinted header, the lines between the rows and columns, the alignment of each column, merged cells and the caption above the table. Everything a cell holds comes along too: several paragraphs, lists, quotes, code and images. Columns get the widths you set, or else their width from their content, like in the editor.

- A table longer than a page repeats its header row at the top of every page.
- Rows stay whole instead of breaking across two pages, unless a row is too tall for one.
- A caption never ends a page on its own: it moves to the next page with its table.

In Word, tables are real Word tables and the caption uses Word's caption style, so the document stays easy to edit. When you [open a Word document](./files#open-word-documents), its tables come along with their merged cells, header rows and captions.
