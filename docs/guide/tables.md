# Tables

Tables in Blank work like the rest of your writing: you type, press `Tab` to go to the next cell, and the table grows as you need it. The columns stay put while you type, and nothing is ever lost by a key pressed at the wrong time. Your tables are saved as plain markdown tables that GitHub, Obsidian, Typora and pandoc show as tables too.

<img class="shot" src="/screenshots/table-insert.gif" alt="Mod T opens a grid, the arrow keys make it four columns wide, Enter inserts the table, Tab fills it cell by cell and the arrow key leads out of it" />

## Make a table {#make}

There are two ways:

- **`Mod` `T`** shows a small grid under the cursor. Pick the size with the arrow keys and press Enter, or point at the size and click. Want the usual? `Mod` `T` then Enter gives you three columns with a header row and two rows.

- **Type the header.** On an empty line, type the column titles between pipes and press Enter:

  ```md
  | Name | Qty | Price |
  ```

  The line becomes a table with that header and an empty row, and the cursor waits in the first cell. Changed your mind? `Mod` `Z` gives you back the line as you typed it.

  <img class="shot" src="/screenshots/table-header.gif" alt="Typing | Name | Role | and Enter turns the line into a table, which Tab then fills" />

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

A cell is a small page of its own. Bold, italic, code, links and images all work in it.

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

To delete a table, press `Mod` `A` twice in it and then `Backspace`. Or press `Backspace` at the start of the line after the table: the first press selects the table, the second deletes it. A table you just made and haven't written in yet goes away with `Backspace` in its first cell. `Mod` `Z` brings anything back.

## How tables are saved {#saving}

A table is saved as a markdown table, with the columns lined up so the file reads well in any text editor:

```md
| Name   | Qty | Price |
| ------ | --: | ----: |
| Apples |   3 |  1.20 |
| Pears  |  12 |  0.80 |
```

Line breaks in a cell are saved as `<br>`, and the colons in the second line keep the alignment of each column.

A markdown table holds one line of text per cell. When a table needs more, like a list or several paragraphs in a cell, Blank saves that one table as an HTML table in the same markdown file. GitHub, Obsidian, Typora and pandoc show it as a table as well. Once the table fits a markdown table again, Blank saves it as one.

Blank opens both kinds, so you can also open markdown files with tables written in other editors.
