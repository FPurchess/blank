import { PAGE_BREAK_STYLE } from "./pageBreaks";

// How the styles of Word, LibreOffice, pandoc and Blank's own Word export
// (src/exporters/docx/template.ts) map to the HTML the markdown schema reads.
// mammoth itself maps headings 1-6, lists, bold, italic, links and breaks.
// Styles are matched by name, which LibreOffice translates to the language
// of its user interface: only the English names are known here.

// marks the paragraphs pageBreaks.ts puts where a new page starts
export const PAGE_BREAK_CLASS = "blank-page-break";

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
    ["Quote", "Intense Quote", "Block Text", "Block Quotation", "Quotations"],
    "blockquote > p:fresh",
  ),
  ...paragraphs(
    // Blank, pandoc, LibreOffice, Word
    ["Code Block", "Source Code", "Preformatted Text", "HTML Preformatted"],
    "pre:separator('\\n')",
  ),
  ...runs(
    // Blank, pandoc, LibreOffice (two spellings), Word
    ["Inline Code", "Verbatim Char", "Source_Text", "Source Text", "HTML Code"],
    "code",
  ),
  // Blank and LibreOffice
  ...paragraphs(["Horizontal Line"], `p.${HORIZONTAL_LINE_CLASS}:fresh`),
  // table captions: Word and Blank, pandoc, LibreOffice. cleanup.ts makes the
  // one next to a table its caption.
  ...paragraphs(
    ["Caption", "Table Caption", "Table"],
    `p.${CAPTION_CLASS}:fresh`,
  ),
  // Blank and LibreOffice
  ...paragraphs(["Table Heading"], `p.${TABLE_HEADING_CLASS}:fresh`),
  // matched by the style's id, since it is in no styles.xml
  `p.${PAGE_BREAK_STYLE} => p.${PAGE_BREAK_CLASS}:fresh`,
  // renders comments, only to count them (see cleanup.ts)
  "comment-reference => sup",
];
