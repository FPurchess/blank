---
paths:
  - "src/markdown/alignment.ts"
  - "src/markdown/tokenizer.ts"
  - "src/markdown/serializer.ts"
  - "src/markdown/parser.ts"
  - "src/markdown/html.ts"
  - "src/editor/commands/align.ts"
  - "src/editor/commands/setTextblock.ts"
  - "src/editor/plugins/alignment.ts"
  - "src/importers/docx/align.ts"
  - "src/importers/docx/cleanup.ts"
  - "src/exporters/docx/index.ts"
---

# Text alignment

- **What it is:** `align` on `paragraph` and `heading` (`src/markdown/schema.ts`): null for left, or `center`, `right`, `justify` (`TextAlignment`, `textAlignment`, `alignOf` in `src/markdown/alignment.ts`). Blocks whose spec has `blockCaps.align` (diagrams, see `content-blocks.md`) have it too, without `justify`; the align commands find them through `capsOf`, and an image aligns through its paragraph. Table cells keep their own `align` (`Alignment`: left, center, right), as markdown aligns columns.
- **Only blocks at the top of the document keep it.** Markdown has no place for it inside lists, quotes, cells or form fields (a follow-up), so what shows is what gets saved:
  - `alignmentGuard` (`src/editor/plugins/alignment.ts`) clears it on nested textblocks a transaction changed (wrapping into a list, pasting into a cell, dropping into a field). Its repair joins the change in the history, so one undo brings both back; don't give it `addToHistory: false`.
  - `withoutNestedAlignment` does the same for what is read: `parseMarkdown`, the HTML a table or one-line block is parsed from (`parseOne` in `html.ts`), and the Word import.
- **Markdown:** a run of blocks aligned alike is written inside one `<div align="…">` with blank lines inside (GitHub keeps `align`, strips `style`, and shows markdown inside a div formatted). Left gets no wrapper, and an empty paragraph never opens or extends one.
  - Reading (`tokenizer.ts`): `alignWrapper` reads the `<div …>` and `</div>` lines at the top level (attributes in any order, `align` or a `text-align` style) as `align_open`/`align_close`, which `alignBlocks` turns into `data-align` on the tokens of `ALIGNABLE_TOKENS` between them (level 0: paragraphs, headings, and the fences and markers content blocks are read from) before the content blocks are read. A `</div>` without a `<div>` stays text, an unclosed wrapper runs to the end of the file, and a closing tag ends a list's lazy line. One line of `<p|hN|div align="…">inline</…>` is read as HTML (`parseHtmlBlock`, with links checked as markdown's).
  - The serializer escapes the opening and closing tags it reads when they are typed, `<div`, `<p`, `<h1`…`<h6`, `<u`, `<ins` and `<img`, like `<br>`, `<table` and `<!--`.
  - An image with a `width` (`blockCaps.width`, see `content-blocks.md`) is written `<img src="…" alt="…" width="50%">` (`writeImage`, for cells too), which `htmlImage` reads back with its src checked as a markdown image's; one without stays `![alt](src)`. The Word export writes it at that share of the text, and the import gives a picture of 50, 75 or 100 % of the text's width that share back (`src/importers/docx/widths.ts`, through a mark after its description, since mammoth reads no sizes).
- **Commands** (`src/editor/commands/align.ts`): `alignText(align)` aligns the top-level paragraphs and headings the selection touches, or back to left when they're aligned that way; in a table it aligns the columns (`alignColumns`), never justified; elsewhere it doesn't apply. `alignmentAt` gives the pressed state (null where it doesn't apply or blocks differ).
  - Type changes go through `setTextblock` (`src/editor/commands/setTextblock.ts`), which keeps each block's alignment; prosemirror's `setBlockType` would drop it and compares it. Enter at the end of an aligned block starts an aligned paragraph (`keepAlignment` in `keymap.ts`).
- **Pages and PDF:** `align` goes to the engine on text and image items (see `layout-engine.md`).
- **Word:** the export writes `w:jc` (`wordAlignment`: justify is `both`) and `doNotExpandShiftReturn`. mammoth reads `w:jc` but writes it nowhere, so the import's `markAlignment` (`src/importers/docx/align.ts`, run in `prepare.ts` after the page breaks) puts a marker run first in each aligned paragraph, by its own `w:jc`, its style's (`w:basedOn`), the default style's or the document defaults (`readStyleAlignment`). Its style id maps to `span.blank-align-*` (`styleMap.ts`), and `cleanup.ts`'s first step turns that into the block's `text-align` or the cell's `align` and removes it with its text, an invisible separator (`ALIGN_MARKER`), which it then strips wherever else it is left. The run needs text: mammoth drops empty runs. The import then aligns columns as their body cells agree (`withColumnAlignment` through `mapTables`).
