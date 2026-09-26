import type { ILevelsOptions, IStylesOptions } from "docx";

import { PAGE_HEIGHT, PAGE_MARGIN, PAGE_WIDTH } from "../page";

// Mirrors the PDF styles in ../pdf/template.ts (and so the editor typography
// in src/scss/_typography.scss): 11pt body, headings on a major third scale.
// Change them together. Word measures font sizes in half points, spacing in
// twentieths of a point (twips) and line heights in 240ths of a line.

export const FONT = "IBM Plex Sans";
const CODE_FONT = "Courier New";
const CODE_BACKGROUND = "F2F2F2";

const twips = (points: number) => Math.round(points * 20);
const halfPoints = (points: number) => Math.round(points * 2);
// pdfmake multiplies lineHeight with the natural line height of IBM Plex Sans
const line = (pdfLineHeight: number) => Math.round(pdfLineHeight * 1.3 * 240);

// the space between blocks, like BLOCK_MARGIN in the PDF
export const BLOCK_SPACING = twips(8);
// like HEADING_MARGIN in the PDF
const HEADING_SPACING_BEFORE = twips(16);
const HEADING_SPACING_AFTER = twips(5);
// like HEADING_AFTER_HEADING_MARGIN_TOP in the PDF
export const HEADING_AFTER_HEADING_SPACING = twips(4);
// the space between the items of a tight list, like the PDF's list_item margin
export const LIST_ITEM_SPACING = twips(2);

// each list level indents by this much, the bullet or number hangs into it
export const LIST_INDENT = 720;
export const LIST_HANGING = 360;
// blockquotes indent by this much per level, next to their left border
export const QUOTE_INDENT = 360;
export const QUOTE_BORDER = {
  style: "single",
  size: 18,
  color: "auto",
  space: 12,
} as const;

export const PAGE = {
  size: { width: twips(PAGE_WIDTH), height: twips(PAGE_HEIGHT) },
  margin: {
    top: twips(PAGE_MARGIN),
    right: twips(PAGE_MARGIN),
    bottom: twips(PAGE_MARGIN),
    left: twips(PAGE_MARGIN),
  },
};

// Only the regular face of IBM Plex Sans is embedded, so the large headings
// that the PDF sets in medium use the regular weight instead of a synthesized
// bold, which would be much heavier.
const heading = (
  level: number,
  size: number,
  lineHeight: number,
  run: { bold?: boolean; italics?: boolean; characterSpacing?: number } = {},
) => ({
  run: {
    font: FONT,
    size: halfPoints(size),
    color: "000000",
    bold: false,
    italics: false,
    ...run,
  },
  paragraph: {
    spacing: {
      before: HEADING_SPACING_BEFORE,
      after: HEADING_SPACING_AFTER,
      line: line(lineHeight),
      lineRule: "auto" as const,
    },
    keepNext: true,
    // makes it a heading for Word's navigation and tables of contents, and
    // for other readers such as pandoc
    outlineLevel: level - 1,
  },
});

const BODY_LINE_HEIGHT = 1.12;

// the style names are what the Word import maps back, see
// src/importers/docx/styleMap.ts
export const STYLE = {
  quote: "Quote",
  codeBlock: "CodeBlock",
  horizontalLine: "HorizontalLine",
  inlineCode: "InlineCode",
  hyperlink: "Hyperlink",
};

const codeShading = {
  type: "clear",
  color: "auto",
  fill: CODE_BACKGROUND,
} as const;

export const STYLES: IStylesOptions = {
  default: {
    document: {
      run: { font: FONT, size: halfPoints(11) },
      paragraph: {
        spacing: {
          after: BLOCK_SPACING,
          line: line(BODY_LINE_HEIGHT),
          // a multiple of the line height, so images make their line taller
          lineRule: "auto" as const,
        },
      },
    },
    heading1: heading(1, 21.5, 0.92, { characterSpacing: -8 }),
    heading2: heading(2, 17, 0.96, { characterSpacing: -4 }),
    // 13.75pt doesn't fit half points
    heading3: heading(3, 13.75, 1),
    heading4: heading(4, 11, BODY_LINE_HEIGHT, { bold: true }),
    heading5: heading(5, 11, BODY_LINE_HEIGHT, { bold: true, italics: true }),
    heading6: heading(6, 11, BODY_LINE_HEIGHT, { italics: true }),
  },
  paragraphStyles: [
    {
      // docx doesn't write the style everything is based on, which other
      // readers need, e.g. pandoc to find headings. See fixups.ts for why
      // it is the default.
      id: "Normal",
      name: "Normal",
      quickFormat: true,
    },
    {
      // Word's own name, so it shows up as its built-in quote style
      id: STYLE.quote,
      name: "Quote",
      basedOn: "Normal",
      next: "Normal",
      quickFormat: true,
      paragraph: {
        indent: { left: QUOTE_INDENT },
        border: { left: QUOTE_BORDER },
      },
    },
    {
      id: STYLE.codeBlock,
      name: "Code Block",
      basedOn: "Normal",
      quickFormat: true,
      run: { font: CODE_FONT, size: halfPoints(10) },
      paragraph: {
        shading: codeShading,
        spacing: { after: 0, line: 240, lineRule: "auto" as const },
      },
    },
    {
      // also the name LibreOffice gives its horizontal line style
      id: STYLE.horizontalLine,
      name: "Horizontal Line",
      basedOn: "Normal",
      next: "Normal",
      paragraph: {
        border: {
          bottom: { style: "single", size: 6, color: "auto", space: 1 },
        },
      },
    },
  ],
  characterStyles: [
    {
      id: STYLE.inlineCode,
      name: "Inline Code",
      quickFormat: true,
      run: { font: CODE_FONT, shading: codeShading },
    },
  ],
};

const BULLETS = ["•", "◦", "▪"];
const LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

const levelIndent = (level: number) => ({
  paragraph: {
    indent: { left: LIST_INDENT * (level + 1), hanging: LIST_HANGING },
  },
});

export const BULLET_LEVELS: ILevelsOptions[] = LEVELS.map((level) => ({
  level,
  format: "bullet",
  text: BULLETS[level % BULLETS.length],
  alignment: "left",
  style: levelIndent(level),
}));

export const orderedLevels = (start: number): ILevelsOptions[] =>
  LEVELS.map((level) => ({
    level,
    format: "decimal",
    text: `%${level + 1}.`,
    alignment: "left",
    start,
    style: levelIndent(level),
  }));
