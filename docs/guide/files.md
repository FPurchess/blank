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

| Command      | Shortcut          |
| ------------ | ----------------- |
| New document | `Mod` `N`         |
| Open         | `Mod` `O`         |
| Save         | `Mod` `S`         |
| Save as      | `Mod` `Shift` `S` |

Alignment and underlining have no mark in markdown, so Blank writes them as the bit of HTML that GitHub and most markdown apps show too: centered text goes between `<div align="center">` and `</div>`, with the markdown inside kept as it is, and underlined text between `<u>` and `</u>`. Blank also reads a paragraph or heading written on one line as `<p align="…">…</p>`, or with `style="text-align: …"`, as other apps write them.

The open dialog shows your markdown files and Word documents together, and you can pick several at once: each opens in a [tab](./writing#tabs) of its own. A tab with changes you haven't saved shows a dot, and Blank asks before it closes. Closed the whole window without saving? Nothing is lost: every tab comes back with its text, see [Blank remembers your documents](./writing#blank-remembers-your-documents).

### Properties on top of the file {#frontmatter}

Notes from Obsidian, pandoc or a static site generator often start with a few properties between two `---` lines, called frontmatter:

```md
---
title: The Lighthouse
author: Ada Lovelace
tags: [sea, light]
---

# Chapter 1
```

Blank keeps this block exactly as it is, down to the comments and spacing, and saves it back unchanged. It stays out of your text, and the [page setup](./pages#page-setup) writes its settings into it. To change anything else in it, like the `title` and `author`, edit the file in another editor.

The `title` and `author` also go into your PDF and Word documents, where readers and search show them. Without a `title`, Blank uses your first heading.

### Blocks from a newer Blank {#unknown-blocks}

Some blocks are written as lines like `<!-- blank:… -->`, which other markdown apps don't show. A file saved by a newer Blank may hold blocks this Blank doesn't know yet. It shows each of them as a box that says so, and keeps it exactly as it was written, so nothing is lost when you edit the text around it and save. The box isn't in your Word documents, and your PDF shows it as on the pages. How the other blocks are kept in each format is in [Blocks](./blocks#storage).

## Share a PDF {#pdf}

Press `Mod` `Alt` `P` and choose where to put the PDF. Blank suggests your document's name with `.pdf`. To save only some pages, choose **PDF file** in the [print dialog](./print#pdf).

The PDF is typeset with care, in the same font, sizes and spacing as the editor:

- set in IBM Plex Sans on the paper of your region, or the [page setup](./pages) you chose, and code in IBM Plex Mono,
- every line and every page ends exactly where it ends on your screen,
- a heading never ends a page on its own; it moves to the next page with its text,
- [page breaks](./pages#page-breaks) start a new page, and horizontal lines are drawn across the text,
- your [page numbers, header and footer](./pages#headers-and-footers) are on every page,
- quotes keep their bar on the left and everything inside them,
- line breaks you made with `Shift` `Enter` stay, and a numbered list that starts at 3 starts at 3,
- [tables](./tables#export) look like in the editor, repeat their header row on every page, and keep their rows whole; a row too tall for a page goes on over the next,
- links stay clickable,
- emoji are black and white, in the colour of your text,
- Chinese, Japanese, Korean and other scripts come from the fonts your computer has for them, so a PDF of such text can look a little different when it's made on another computer.

Every PDF is a PDF/A, the standard for archiving: it holds its fonts, colours and metadata, so it opens the same in years to come, and theses, offices and courts that ask for PDF/A accept it. It's also tagged, so screen readers read it in order, in your document's language, and its headings are bookmarks. If a document can't be a PDF/A, for example because it uses a character no font has, Blank makes a normal PDF and tells you why.

If you made PDFs with Blank 2.1 or earlier, lines may now break in other places: the PDF is typeset by Blank itself now, the same way as your screen.

Images come along at the size they have in Blank, up to the width of the page. [Diagrams](./blocks#diagrams) stay sharp at any zoom, and their words can be searched. Images from the web are downloaded for the PDF, so that needs an internet connection. If an image can't be loaded, the PDF shows its description in its place, and Blank tells you which one it was.

## Word documents {#word}

### Send a Word document {#send-word}

When someone needs your text in Word, press `Mod` `Alt` `W`. Blank suggests your document's name with `.docx`.

The Word document looks like your PDF, and stays easy to edit: headings, quotes and code use real Word styles, so they show up in Word's style gallery, navigation pane and table of contents. Lists keep their numbers, tabs stay on their stops, links and images come along, and headers, footers and page numbers are Word's own, so they stay right however the document grows. Tables become real Word tables, with their header row repeated on every page, merged cells and their caption in Word's caption style. Blank's fonts are embedded, IBM Plex Sans for the text and IBM Plex Mono for code, so Word shows them even on computers that don't have them installed. LibreOffice and Google Docs use similar fonts instead.

Your markdown file stays exactly as it is. The document's title and author come along, and so do the [properties](#frontmatter) at the top of your file: open the Word document in Blank again and they're back, including the ones Word has no place for. If someone changed the title or author in Word, you get their version.

### Open a Word document {#open-word-documents}

Open a Word document like any other file: with `Mod` `O`, by starting Blank with it (`blank report.docx`), or with **Open With → Blank** in your file manager (see [Install](./install)). Blank also opens .docm, .dotx and .dotm files, up to 50 MB.

Blank turns the document into a new, untitled markdown document, and the top of the window shows _report.docx (imported)_. Press `Mod` `S` to keep it: Blank suggests `report.md`, right next to the original.

::: tip Your Word file stays untouched
Blank never writes to the Word document you opened. It won't even save markdown over a .docx or .pdf if you pick one in the save dialog.
:::

### What comes along {#what-comes-along}

Headings, bold, italic and underlined text, the alignment of paragraphs, headings and table columns (also when it comes from a Word style such as a centered title or justified body text), links, lists, quotes, code, tabs, line breaks, page breaks, images, tables and [tables of contents](./blocks#toc) make it into your document, and so do the header, the footer and the page numbers. Tables keep their merged cells, header rows and header columns, and their caption. A table without a header row gets its first row as the header, since a markdown table needs one. Images are stored inside the markdown file, so it stays a single file you can move and send; large pictures are scaled down to a size that still prints well.

Word can do more than markdown, so a few things change on the way:

- a table inside a table cell becomes text, one line per row with the cells separated by `|`,
- footnotes move to the end of the document,
- comments and colours are left out, and links lose the underline Word gives them, since every link shows underlined anyway,
- alignment inside lists and quotes is left out,
- tracked changes count as accepted,
- charts and drawings Blank can't show are replaced by their description,
- numbered lists start at 1.

::: tip Nothing gets lost unnoticed
Right after opening, Blank tells you what changed, for example _1 table inside a table became text_ or _2 comments left out_.
:::

### Back and forth with Word users {#back-and-forth}

A colleague sends you a Word document to work on:

1. Open it with `Mod` `O`.
2. Write, and keep your version with `Mod` `S`, as markdown.
3. Send it back with `Mod` `Alt` `W`.

On their side, headings, quotes, lists, links, images and tables arrive as they know them from Word, aligned as you aligned them, and come back the same way.

## Good to know {#good-to-know}

**File names.** On Linux, the save dialog doesn't add the extension for you. The name Blank suggests already has it, and an export refuses a name with another extension, such as an existing `.md` file, instead of overwriting it.

**Other formats.** Blank can't open .doc, .odt, .rtf or .pages files. Save them as .docx in the app they come from, then open that.

**Password-protected documents.** Blank can't open a Word document that is protected with a password. Remove the password in Word, or ask for an unprotected copy.
