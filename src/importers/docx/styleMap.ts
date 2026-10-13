import { STYLE_NAMES } from "../../exporters/docx/styleNames";
import { PAGE_BREAK_STYLE } from "./pageBreaks";
import { TOC_STYLE } from "./toc";
import { FORM_STYLE } from "./forms";
import { DIAGRAM_STYLE, EMBED_STYLE } from "./embeds";
import { ALIGN_CLASS, alignStyle, WORD_ALIGNMENTS } from "./align";

// How the styles of Word, LibreOffice, pandoc and Blank's own Word export
// (src/exporters/docx/template.ts) map to the HTML the markdown schema reads.
// mammoth itself maps headings 1-6, lists, bold, italic, links and breaks.
// Styles are matched by name, which LibreOffice translates to the language
// of its user interface: only the English names are known here.

// marks the paragraphs pageBreaks.ts puts where a new page starts
export const PAGE_BREAK_CLASS = "blank-page-break";
// a table of contents, see toc.ts
export const TOC_CLASS = "blank-toc";
// where a form or a field starts or a form ends, see forms.ts
export const FORM_CLASS = "blank-form";
// an embed, its attributes as JSON, see embeds.ts
export const EMBED_CLASS = "blank-embed";
// a diagram, its source and settings as JSON, see embeds.ts
export const DIAGRAM_CLASS = "blank-diagram";

// marks the paragraphs of a horizontal line, which are empty and so need a
// class to survive until src/importers/docx/cleanup.ts turns them into <hr>
export const HORIZONTAL_LINE_CLASS = "blank-hr";
// marks caption paragraphs, which cleanup.ts moves into the table next to them
export const CAPTION_CLASS = "blank-caption";
// marks the paragraphs of header cells: cleanup.ts makes a cell that holds
// only such paragraphs a header cell, e.g. in a header column
export const TABLE_HEADING_CLASS = "blank-th";

const paragraphs = (names: string[], html: string) =>
  names.map((name) => `p[style-name='${name}'] => ${html}`);
const runs = (names: string[], html: string) =>
  names.map((name) => `r[style-name='${name}'] => ${html}`);

export const STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Subtitle'] => h2:fresh",
  ...paragraphs(
    // Word and Blank, Word, pandoc, LibreOffice and its older name
    [
      STYLE_NAMES.quote,
      "Intense Quote",
      "Block Text",
      "Block Quotation",
      "Quotations",
    ],
    "blockquote > p:fresh",
  ),
  ...paragraphs(
    // Blank, pandoc, LibreOffice, Word
    [
      STYLE_NAMES.codeBlock,
      "Source Code",
      "Preformatted Text",
      "HTML Preformatted",
    ],
    "pre:separator('\\n')",
  ),
  ...runs(
    // Blank, pandoc, LibreOffice (two spellings), Word
    [
      STYLE_NAMES.inlineCode,
      "Verbatim Char",
      "Source_Text",
      "Source Text",
      "HTML Code",
    ],
    "code",
  ),
  // Blank and LibreOffice
  ...paragraphs(
    [STYLE_NAMES.horizontalLine],
    `p.${HORIZONTAL_LINE_CLASS}:fresh`,
  ),
  // table captions: Word and Blank, pandoc, LibreOffice. cleanup.ts makes the
  // one next to a table its caption.
  ...paragraphs(
    [STYLE_NAMES.caption, "Table Caption", "Table"],
    `p.${CAPTION_CLASS}:fresh`,
  ),
  // Blank and LibreOffice
  ...paragraphs([STYLE_NAMES.tableHeading], `p.${TABLE_HEADING_CLASS}:fresh`),
  // matched by the style's id, since it is in no styles.xml
  `p.${PAGE_BREAK_STYLE} => p.${PAGE_BREAK_CLASS}:fresh`,
  `p.${TOC_STYLE} => p.${TOC_CLASS}:fresh`,
  `p.${FORM_STYLE} => p.${FORM_CLASS}:fresh`,
  `p.${EMBED_STYLE} => p.${EMBED_CLASS}:fresh`,
  `p.${DIAGRAM_STYLE} => p.${DIAGRAM_CLASS}:fresh`,
  // the runs that mark an aligned paragraph, see align.ts
  ...WORD_ALIGNMENTS.map(
    (align) => `r.${alignStyle(align)} => span.${ALIGN_CLASS}${align}`,
  ),
  // underlined runs; links' underlines go in importDocx
  "u => u",
  // renders comments, only to count them (see cleanup.ts)
  "comment-reference => sup",
];
