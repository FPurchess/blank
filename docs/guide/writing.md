# Writing in Blank

Blank shows your text as it will look, not as markdown syntax. There are no toolbars: you format with [keyboard shortcuts](./shortcuts) or by typing markdown, which Blank turns into formatting as you go.

<img class="shot" src="/screenshots/theme-light.png" alt="A document in Blank's light theme" />

## Format as you type

At the start of an empty line, type one of these to turn the line into a block:

| Type at the start of a line | Then  | You get         |
| --------------------------- | ----- | --------------- |
| `#` … `######`              | Space | Heading 1–6     |
| `-` `*` `+`                 | Space | Bullet list     |
| `1.` (any number)           | Space | Numbered list   |
| `>`                         | Space | Blockquote      |
| `---` `***` `___`           | Enter | Horizontal line |
| ` ``` ` or ` ```lang `      | Enter | Code block      |

Changed your mind? `Mod` `Z` right away gives you back the line as you typed it.

Inline markdown works too: `**bold**`, `*italic*`, `` `code` ``, `[title](url)` and plain URLs become formatting once you finish the word. See [Autocorrect](./autocorrect) for everything Blank corrects.

## Images

Press `Mod` `Alt` `I` to add an image where the cursor is. In the dialog, press _Choose file…_ (Tab gets you there) to pick a picture from your computer, give it a short description and press Enter. Blank puts the picture into the document itself, so your markdown file stays a single file you can move, copy and send without losing images. Large pictures are scaled down to a size that still prints well.

Instead of choosing a file, you can also type an address into the dialog, or type `![description](address)` and a space right in the text:

- a web address, like `https://example.com/map.png`,
- a file next to your document, like `images/chart.png`, which appears once the document has been saved, since Blank needs to know its folder,
- any file on your computer, like `/home/me/logo.png`.

These images stay where they are and the document links to them.

To change or remove an image, put the cursor right before or after it and press `Mod` `Alt` `I` again.

Images are as wide as they are in the file, up to the width of the page. PDFs and Word documents include every image at the size you see in Blank, also images from the web. If one can't be loaded, for example because you're offline, the export shows its description instead and Blank tells you which one.

## Blank remembers your document

Blank keeps what you write as you go, at least once a second and once more when you close the window, and restores it on the next start, together with the open file, the theme and the language. So you can close the window mid-thought without saving, and pick up right where you left off.

## Save, open and export

Documents are plain markdown files, so any other editor can open them.

| Command        | Shortcut          |
| -------------- | ----------------- |
| New file       | `Mod` `N`         |
| Open file      | `Mod` `O`         |
| Save           | `Mod` `S`         |
| Save as        | `Mod` `Shift` `S` |
| Export as PDF  | `Mod` `Alt` `P`   |
| Export as Word | `Mod` `Alt` `W`   |

`Mod` is `Cmd` on macOS and `Ctrl` on Windows and Linux.

The PDF looks like your document in Blank: quotes keep their bar on the left and every paragraph, list and heading inside them, line breaks you made with `Shift` `Enter` stay, and a numbered list that starts at 3 starts at 3.

### Open Word documents

`Mod` `O` also opens Word documents (.docx), and so does starting Blank with one, e.g. `blank report.docx`. Blank turns it into a new, untitled markdown document and never changes the Word file. Press `Mod` `S` to keep it: Blank suggests the same name with `.md`, next to the original. The top of the window shows _report.docx (imported)_ until then.

Headings, bold and italic text, links, lists, quotes, code, line breaks and images come along. Images are stored inside the markdown file, so it stays a single file; large ones are scaled down to a size that still prints well. Word has more than markdown, so a few things change on the way, and Blank tells you when they do:

- tables become one line per row, with the cells separated by `|`,
- footnotes move to the end of the document,
- comments, headers and footers, underlining and colours are left out,
- tracked changes count as accepted,
- charts and drawings Blank can't show are replaced by their description,
- numbered lists start at 1.

Older formats (.doc, .odt, .rtf, .pages) can't be opened. Save them as .docx in their app first.

### Word documents for others

When someone needs your text in Word, press `Mod` `Alt` `W`. Blank writes a .docx that looks like its PDFs, with the same fonts and spacing, and that stays easy to edit: headings, quotes and code use real Word styles, so they show up in Word's style gallery, navigation pane and table of contents. Lists, links and images come along. Your markdown file stays as it is.

The document embeds Blank's font, IBM Plex Sans, so it looks the same in Word on computers without the font. LibreOffice and Google Docs ignore embedded fonts and use a similar one instead.

## The status bar

The top of the window shows the open file, _Untitled_, or the Word document an untitled document was imported from. The bottom shows the word and character count and the [autocorrect language](./autocorrect#language).
