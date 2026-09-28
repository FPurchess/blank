---
paths:
  - "src/layout/**"
  - "src/bandStrip.ts"
  - "src/bandStrips.ts"
  - "src/slotEditor.ts"
  - "src/state/page.ts"
  - "src/state/dialogs.ts"
  - "src/ui.ts"
  - "src/exporters/pdf/**"
  - "src/exporters/docx/**"
  - "src/importers/docx/**"
  - "src/editor/index.ts"
  - "src/editor/commands/editBand.ts"
  - "src/editor/commands/frontmatter.ts"
  - "src/editor/commands/pageSetup.ts"
  - "src/pageSetup.ts"
---

# Headers, footers and page numbers

- They are page settings (`src/layout/settings.ts`), in the `page` key of the frontmatter like the rest:
  - `header`/`footer`: `left`/`center`/`right` slots of one line each
  - `first-page`: `same`, `plain` (none) or its own `header`/`footer`
  - `even-pages`: the header and footer of even pages
  - `number-style`: `1`, `i` or `I`
  - `start-number`
  
  `BAND_KEYS`/`bandSettings` are these keys; the page setup dialog keeps them as they are, and **Make This My Default** saves only the dialog's keys.
- The slots hold plain text with the fields of `src/layout/tokens.ts` (`{page}`, `{pages}`, `{title}`, `{author}`, `{chapter}`, `{date}`, `{file}`; `{{` for a brace). There is no formatting, on purpose.
- `src/layout/bands.ts` is what both exporters share:
  - the band's size and distance from the edge (`BAND`, `BAND_ROOM`)
  - `bandsOn`: the bands of a page. The first page's own or none; even pages by the number they show, as in Word.
  - `variantsOf`, `formatNumber` (roman numerals), `documentFields`, `chapterOn`, `fieldValues`
- PDF (`src/exporters/pdf/bands.ts`, `index.ts`): pdfmake's `header`/`footer` functions draw the bands.
  - `{chapter}` comes from the `positions` pdfmake leaves on the top-level heading 1 blocks (`chapterPages`). pdfmake lays out the text before it draws the headers and doesn't copy the document definition, so one pass is enough.
  - A test against the real pdfmake guards this (`index.test.ts`).
- Word (`src/exporters/docx/bands.ts`):
  - One paragraph per band in Word's `Header`/`Footer` style, with center and right tab stops.
  - Word's own fields: `PAGE`, `NUMPAGES`, `TITLE`, `AUTHOR`, `STYLEREF "Heading 1"`, `DATE \@ "<picture>"` (`datePicture`) and `FILENAME`. Their names and the page number formats are in `fields.ts`, which the Word import reads them back by.
  - `first` and `even` parts, `titlePage`, `evenAndOddHeaderAndFooters` and `pgNumType`.
  - A band without text anywhere gets no parts, and every part has a paragraph.
- Word import (`src/importers/docx/bands.ts`):
  - It reads the parts of the first section back into slots, by their tabs, `w:ptab` and `w:jc`.
  - It descends into `w:sdt` content controls, where Word's page number gallery puts its fields.
  - It maps the fields back, and keeps the shown text of other fields.
  - It warns about pictures, tables, several lines and number styles Blank lacks.
- The strips (`src/bandStrips.ts`) are edited at the top and bottom of the window, not in the dialog.
  - At rest they show the band faintly, or a hint while the pointer is on the bar.
  - They show what `pageLayout` resolves and `pageFields` fills in (`src/state/page.ts`). Both stay the same while typing leaves the frontmatter, the first heading and the file alone, so the strips render again only then.
  - A click on a band runs `editBand(band, insert?)` (`src/editor/commands/editBand.ts`) through the editor's handle, which `bootUI` gives `bootBandStrips(editor)` (see `editor-boundary.md`). `insert` is what the strip puts into its center, `{page}` for **# Page numbers**.
  - `openBand` publishes a `bandEditor` request, whose `apply` writes all band settings as one undo step.
  - `bootBandStrips()` runs in `bootScope()`: its watchers, the window listeners and the elements and body classes it adds all go with its `dispose`, which also closes an open strip, and booting again replaces it. The open strip runs in a detached scope of its own, which closing it stops.
  - What the open strip does is in `src/bandStrip.ts`, without its DOM: `openStrip`, the functions that change the strip, its menus, and `stripSettings`, what it keeps. `bandStrips.ts` only renders it and wires the DOM.
  - The open strip has tabs for the first and even pages when they have their own. `src/slotEditor.ts` is the small ProseMirror editor of one slot, with the fields as atom chips.
