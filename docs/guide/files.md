# Files & formats

Your writing lives in plain markdown files that any editor can read, today and in twenty years. When a piece goes out into the world, Blank hands it over as a finely typeset PDF or as a Word document. And when someone sends you a Word document, Blank opens that too.

## Which format for what {#formats}

| Format         | Open      | Save or export  | Best for             |
| -------------- | --------- | --------------- | -------------------- |
| Markdown (.md) | `Mod` `O` | `Mod` `S`       | your own writing     |
| PDF            |           | `Mod` `Alt` `P` | reading and printing |
| Word (.docx)   | `Mod` `O` | `Mod` `Alt` `W` | people who use Word  |

`Mod` is `Cmd` on macOS and `Ctrl` on Windows and Linux.

## Your documents: markdown {#markdown}

Everything you write is kept as markdown: plain text with a few marks like `#` for headings, so the file stays small, readable and yours.

| Command  | Shortcut          |
| -------- | ----------------- |
| New file | `Mod` `N`         |
| Open     | `Mod` `O`         |
| Save     | `Mod` `S`         |
| Save as  | `Mod` `Shift` `S` |

The open dialog shows your markdown files and Word documents together. Closed Blank without saving? It keeps your text anyway, see [Blank remembers your document](./writing#blank-remembers-your-document).

## Share a PDF {#pdf}

Press `Mod` `Alt` `P` and choose where to put the PDF. Blank suggests your document's name with `.pdf`.

The PDF is typeset with care, in the same font, sizes and spacing as the editor:

- A4 pages set in IBM Plex Sans,
- a heading never ends a page on its own; it moves to the next page with its text,
- quotes keep their bar on the left and everything inside them,
- line breaks you made with `Shift` `Enter` stay, and a numbered list that starts at 3 starts at 3,
- links stay clickable.

Images come along at the size they have in Blank, up to the width of the page. Images from the web are downloaded for the PDF, so that needs an internet connection. If an image can't be loaded, the PDF shows its description in its place, and Blank tells you which one it was.

## Word documents {#word}

### Send a Word document {#send-word}

When someone needs your text in Word, press `Mod` `Alt` `W`. Blank suggests your document's name with `.docx`.

The Word document looks like your PDF, and stays easy to edit: headings, quotes and code use real Word styles, so they show up in Word's style gallery, navigation pane and table of contents. Lists keep their numbers, and links and images come along. Blank's font is embedded, so Word shows it even on computers that don't have it installed. LibreOffice and Google Docs use a similar font instead.

Your markdown file stays exactly as it is.

### Open a Word document {#open-word-documents}

Open a Word document like any other file: with `Mod` `O`, by starting Blank with it (`blank report.docx`), or with **Open With → Blank** in your file manager (see [Install](./install)). Blank also opens .docm, .dotx and .dotm files, up to 50 MB.

Blank turns the document into a new, untitled markdown document, and the top of the window shows _report.docx (imported)_. Press `Mod` `S` to keep it: Blank suggests `report.md`, right next to the original.

::: tip Your Word file stays untouched
Blank never writes to the Word document you opened. It won't even save markdown over a .docx or .pdf if you pick one in the save dialog.
:::

### What comes along {#what-comes-along}

Headings, bold and italic text, links, lists, quotes, code, line breaks and images make it into your document. Images are stored inside the markdown file, so it stays a single file you can move and send; large pictures are scaled down to a size that still prints well.

Word can do more than markdown, so a few things change on the way:

- tables become one line per row, with the cells separated by `|`,
- footnotes move to the end of the document,
- comments, headers and footers, underlining and colours are left out,
- tracked changes count as accepted,
- charts and drawings Blank can't show are replaced by their description,
- numbered lists start at 1.

::: tip Nothing gets lost unnoticed
Right after opening, Blank tells you what changed, for example _1 table became text_ or _2 comments left out_.
:::

### Back and forth with Word users {#back-and-forth}

A colleague sends you a Word document to work on:

1. Open it with `Mod` `O`.
2. Write, and keep your version with `Mod` `S`, as markdown.
3. Send it back with `Mod` `Alt` `W`.

On their side, headings, quotes, lists, links and images arrive as they know them from Word. Tables come back as text, one line per row.

## Good to know {#good-to-know}

**File names.** On Linux, the save dialog doesn't add the extension for you. The name Blank suggests already has it, and an export refuses a name with another extension, such as an existing `.md` file, instead of overwriting it.

**Other formats.** Blank can't open .doc, .odt, .rtf or .pages files. Save them as .docx in the app they come from, then open that.

**Password-protected documents.** Blank can't open a Word document that is protected with a password. Remove the password in Word, or ask for an unprotected copy.
