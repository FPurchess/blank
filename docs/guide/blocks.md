# Blocks

Besides your text, Blank can put blocks into your document: a table of contents it fills in for you, forms you fill in, such as a recipe, and drawings of other apps. Press `Mod` `Alt` `B` where you want one, pick it with the arrow keys and press Enter.

## Table of contents {#toc}

A table of contents lists your headings with the page each one starts on, and keeps itself up to date: rename a heading, add one, or let the text before it grow onto another page, and the table follows right away. The page numbers are the ones your footer shows, roman numerals and a later first page number included.

<img class="shot" src="/screenshots/toc.gif" alt="Mod Alt B and Enter insert a table of contents, which lists the headings with their pages and follows a heading as it is renamed" />

- **Insert it:** press `Mod` `Alt` `B` and Enter. On an empty line, it takes the line's place; otherwise it goes right after the paragraph, list, quote or table the cursor is in. You can also type `[toc]` (or `[TOC]`) on an empty line and press Enter, though not inside a list or a quote.
- **Change it:** click it or move the cursor onto it, so it's selected, and press Enter. Choose how deep it lists your headings (only headings 1, or down to heading 2, 3 and further; 1 – 3 is where it starts) and its title, or leave the title empty for none.
- **Jump to a heading:** `Mod` + Click on an entry scrolls to its heading, as a link opens. The [outline](./pages#outline) does the same from the keyboard.
- **Remove it:** select it and press `Backspace`, or press **Remove** in its dialog. With the mouse, click it: its toolbar above it edits it (the pencil) and removes it (the bin).

It lists the headings the outline lists: those at the top of your document, not in a list or a quote, and not an empty one.

**In your PDF**, every entry is a link to its heading, and readers that read aloud know it as a table of contents.

**In Word**, it becomes Word's own table of contents, with the page numbers of your pages in Blank and links to the headings. Word lays the pages out a little differently, so to number them as Word does, right-click it and choose **Update Field**. A table of contents from Word, LibreOffice or pandoc comes into Blank as a table of contents too, which Blank fills in again from the document's headings.

**In the file**, it's one line, `<!-- blank:toc@1 depth="3" title="Contents" -->`, which other markdown apps don't show. Blank writes the entries anew every time, so your file never holds an outdated list.

## Drawings of other apps {#embeds}

A document can hold content of another app, such as a diagram of draw.io or a sketch of Excalidraw: an embed. Apps will bring their embeds to Blank as plugins, which aren't there yet. Blank already shows, prints and exports the embeds a file holds, the same everywhere, and keeps them as they were.

- **On the pages and in your PDF**, an embed is the drawing it was saved with.
- **Select it** with a click or the arrow keys: its toolbar removes it, as `Backspace` does. With its plugin, Enter (or the pencil) will edit it.
- **In Word**, an embed is a picture of its drawing. Blank keeps what the app needs inside the Word file too, so the embed comes back whole when you open the file in Blank again.
- **In the file**, an embed is its app's data and its drawing as SVG, between `<!-- blank:embed@1 type="…" -->` and `<!-- /blank:embed -->`, in plain text, so you can see what changed from one version to the next. Blank removes from a drawing what isn't drawing, such as scripts or links to the web, before it shows it.

## Forms {#forms}

A form is a block of fields to fill in, laid out the same every time: a recipe with its name, a photo beside the ingredients, and the steps. Blank comes with the recipe; you can [write your own forms](#your-own-forms) too.

<img class="shot" src="/screenshots/form.gif" alt="Mod Alt B, the arrow down and Enter put in a recipe; Tab goes from its name to the photo, the ingredients beside it and the steps below, each filled in" />

- **Put one in:** press `Mod` `Alt` `B`, pick it and press Enter. The cursor goes into its first field. The recipe starts on a page of its own.
- **Add the photo:** click its box, or press `Mod` `Alt` `I` in it, and choose a picture. The box is on the screen only.
- **Fill it in:** `Tab` goes to the next field and `Shift` `Tab` back. In a table, `Tab` goes from cell to cell and on to the next field after the last cell (the table's toolbar still adds rows); in a list or a code block, `Tab` indents as usual. In a field of one line, such as a name, `Enter` goes on to the next field too, and `Shift` `Enter` breaks the line. An empty field says what goes in it, on the screen only: the PDF and your printout leave it blank.
- **Its fields stay as they are:** a field's text, list, table or picture is yours to change, but the fields themselves stay in their order. A name stays one line in its own style, and nothing you paste can take a field out.
- **Select, copy or remove it:** press `Escape` in a field to select the whole form. `Backspace` removes it, as the bin on the toolbar above the form does while the cursor is in it, and a copy pasted into another document is the same form, template and all. A part of a form you copy is pasted as its text, tables and pictures.

Headings in a form are headings of your document: the outline shows them, a table of contents lists them, and so do the PDF's bookmarks. A cookbook of recipes gets a table of contents of its recipes. When your [page setup](./pages#chapters) starts headings on a new page, it starts those in forms there too, except in a column beside another.

**In Word**, a form becomes Word's own content controls, one for the form and one for each field, named after it. Word users fill them in, but can't take them apart, and an empty field shows its placeholder, as Word's own do. Fields side by side stand in the cells of a table without lines, and fields at a place of the page in Word's frames. Blank opens such a document as forms again, with what was written in Word.

**In the file**, a form is its fields between lines like `<!-- blank:form@1 def="blank/recipe@2#…" -->` and `<!-- blank:field name="title" -->`, which other markdown apps don't show. At the end of the file, Blank keeps a copy of each form's template, so the file opens the same everywhere, however the template changes later.

### Your own forms {#your-own-forms}

A form is made from a template: a small YAML file in the `templates` folder next to [`blank.json`](./configuration). Blank reads the folder whenever you press `Mod` `Alt` `B`, and offers each template there by its name. One that has a mistake shows up too, with what's wrong.

```yaml
# templates/letter.yaml
version: 1
name: Letter
description: A letter, with the address, date and subject
newPage: true
fields:
  - name: address
    kind: rich
    label: Address
    placeholder: Who it goes to
  - name: date
    kind: text
    label: Date
  - name: subject
    kind: text
    style: h2
    label: Subject
  - name: body
    kind: rich
    label: Letter
```

| Key           | What it says                                                       |
| ------------- | ------------------------------------------------------------------ |
| `version`     | a whole number; count it up when you change the fields             |
| `name`        | what the block picker calls it                                     |
| `description` | a few words on what it is, optional                                |
| `newPage`     | `true` starts every such form on a page of its own, optional       |
| `fields`      | the fields, in order: up to 32                                     |
| `layout`      | where the fields stand on the page, optional; see below            |
| `flowTop`     | where the fields not in frames start on the first page; see below  |

Each field has a `name` (lowercase letters, digits and dashes), a `label` and a `kind`:

| Kind    | It holds                                                                 |
| ------- | ------------------------------------------------------------------------ |
| `text`  | one line; `style` sets it as `p` (the default), `small` print or a heading `h1` to `h6` |
| `image` | a picture, which `Mod` `Alt` `I` puts in                                 |
| `table` | a table, which starts with the `columns` you list (up to 8)              |
| `rich`  | anything: paragraphs, lists, quotes, code, tables                        |

A `placeholder` is what the field says while it's empty. A form you placed keeps the template as it was then: change the template later, and the forms already in your documents stay as they are.

#### Fields side by side {#layout}

Without a `layout`, the fields stand one below the other. With one, you can put fields side by side in a grid: each cell of a grid is a column, holding its fields one below the other, and the next field goes on below the longest column. The recipe puts its photo beside its ingredients:

```yaml
layout:
  - field: title
  - grid:
      columns: [1fr, 1fr]
      gap: 8mm
    cells:
      - [field: photo]
      - [field: ingredients]
  - field: steps
```

- **`columns`** says how wide each column is: a length like `40mm`, `2cm`, `1in` or `12pt`, or a share like `1fr` of the width the lengths leave. `[40mm, 1fr]` is a narrow column and a wide one. A grid has up to 4 columns.
- **`gap`** is the room between two columns, `6mm` if you leave it out.
- **`cells`** fill the columns from the left. More cells than columns start a new row below.
- The layout names every field once, in the order of `fields`, which is the order you go through them with `Tab`, read them and find them in the file.

A column that is longer than the room left on the page goes on to the next page, beside the others.

#### Fields at a place of the page {#frames}

A field can also stand at a place of its own on the page, in a frame, like a letter's address in the window of an envelope. Frames come first in the layout, and a template with frames starts a new page (`newPage: true`), on which they stand. The other fields flow as usual, from `flowTop` down if you set it:

```yaml
newPage: true
flowTop: 98.5mm
layout:
  - frame: { x: 20mm, y: 62.7mm, width: 85mm, height: 27.3mm }
    field: recipient
  - field: subject
  - field: body
```

- **`x` and `y`** are measured from the page's left and top edges, **`width`** is how wide the frame is, and **`height`** how high it is at least: a frame grows when its field holds more.
- A frame holds one field, which can't be a table. Its lines stand one below the other without space between them, as an address's do.
