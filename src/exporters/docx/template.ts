import type { ILevelsOptions, IStylesOptions } from "docx";

import { type Layout } from "../../layout/resolve";
import { BAND } from "../../layout/bands";
import {
  BLOCK_AFTER,
  HEADING_AFTER,
  HEADING_AFTER_HEADING,
  HEADING_BEFORE,
  ITEM_SPACE,
} from "../../layout/spacing";
import { BULLETS } from "../../markdown/lists";
import { STYLE_NAMES } from "./styleNames";
import { WORD_NUMBER_FORMATS } from "./fields";
import { TABLE_COLORS, TABLE_LINES, TABLE_PADDING } from "../table";

// Mirrors the PDF styles of the layout engine in
// src-tauri/layout/src/style.rs (and so the editor typography
// in src/scss/_typography.scss): 11pt body, headings on a major third scale.
// Change them together. Word measures font sizes in half points, spacing in
// twentieths of a point (twips) and line heights in 240ths of a line.

export const FONT = "IBM Plex Sans";
// code, as on the pages and in the PDF; only its regular face is embedded
// (see font.ts), so Word slants or emboldens it itself where code is italic
// or bold
export const CODE_FONT = "IBM Plex Mono";
// the code fill on paper, as the pages show it (see src/layout/paperColors.ts)
export const CODE_BACKGROUND = "EFF0F1";

export const twips = (points: number) => Math.round(points * 20);
// borders are measured in eighths of a point
const eighths = (points: number) => Math.round(points * 8);
const BODY_SIZE = 11;
const halfPoints = (points: number) => Math.round(points * 2);
// the PDF's line heights are a factor of IBM Plex Sans' natural 1.3 em (see
// src-tauri/layout/src/style.rs)
const line = (pdfLineHeight: number) => Math.round(pdfLineHeight * 1.3 * 240);

// the space around blocks, as on the pages (src/layout/spacing.ts)
export const BLOCK_SPACING = twips(BLOCK_AFTER);
const HEADING_SPACING_BEFORE = twips(HEADING_BEFORE);
const HEADING_SPACING_AFTER = twips(HEADING_AFTER);
export const HEADING_AFTER_HEADING_SPACING = twips(HEADING_AFTER_HEADING);
// the space between the items of a tight list
export const LIST_ITEM_SPACING = twips(ITEM_SPACE);

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

// tables mirror the PDF (the engine's table_units): thin lines between rows and
// columns, a stronger one under the header rows, none around the table's
// sides and top
export const TABLE_CELL_MARGINS = {
  top: twips(TABLE_PADDING.y * BODY_SIZE),
  bottom: twips(TABLE_PADDING.y * BODY_SIZE),
  left: twips(TABLE_PADDING.x * BODY_SIZE),
  right: twips(TABLE_PADDING.x * BODY_SIZE),
};
const hex = (color: string) => color.slice(1).toUpperCase();
const TABLE_LINE = {
  style: "single",
  size: eighths(TABLE_LINES.line),
  color: hex(TABLE_COLORS.line),
} as const;
const NO_LINE = { style: "none", size: 0, color: "auto" } as const;
// a grid's table has no lines at all
export const GRID_BORDERS = {
  top: NO_LINE,
  left: NO_LINE,
  right: NO_LINE,
  bottom: NO_LINE,
  insideHorizontal: NO_LINE,
  insideVertical: NO_LINE,
};
export const TABLE_BORDERS = {
  top: NO_LINE,
  left: NO_LINE,
  right: NO_LINE,
  bottom: TABLE_LINE,
  insideHorizontal: TABLE_LINE,
  insideVertical: TABLE_LINE,
};
export const TABLE_HEADER_BORDER = {
  style: "single",
  size: eighths(TABLE_LINES.headerLine),
  color: hex(TABLE_COLORS.headerLine),
} as const;
export const TABLE_HEADER_SHADING = {
  type: "clear",
  color: "auto",
  fill: hex(TABLE_COLORS.headerFill),
} as const;

/**
 * pageProperties returns the page of the Word document for `layout`. docx
 * swaps the width and height of landscape pages itself, so it gets the
 * portrait size.
 */
export const pageProperties = ({
  paper,
  orientation,
  margins,
  startNumber,
  numberStyle,
}: Layout) => ({
  size: {
    width: twips(paper.width),
    height: twips(paper.height),
    orientation,
  },
  margin: {
    top: twips(margins.top),
    right: twips(margins.right),
    bottom: twips(margins.bottom),
    left: twips(margins.left),
    // the distance of headers and footers from the edge, like the PDF's
    header: twips(BAND.distance),
    footer: twips(BAND.distance),
    gutter: 0,
  },
  // docx writes an empty <w:pgNumType/> for the defaults
  pageNumbers: {
    ...(startNumber === 1 ? {} : { start: startNumber }),
    ...(numberStyle === "1"
      ? {}
      : { formatType: WORD_NUMBER_FORMATS[numberStyle] }),
  },
});

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

const HEADING2 = heading(2, 17, 0.96, { characterSpacing: -4 });

// the style names are what the Word import maps back, see
// src/importers/docx/styleMap.ts
export const STYLE = {
  header: "Header",
  footer: "Footer",
  quote: "Quote",
  codeBlock: "CodeBlock",
  horizontalLine: "HorizontalLine",
  inlineCode: "InlineCode",
  hyperlink: "Hyperlink",
  caption: "Caption",
  small: "Small",
  tableHeading: "TableHeading",
  tocHeading: "TOCHeading",
  placeholder: "PlaceholderText",
};

// the name Word gives a table of contents, and its gallery of them, which
// the Word import knows one by (src/importers/docx/toc.ts)
export const TOC_NAME = "Table of Contents";

const codeShading = {
  type: "clear",
  color: "auto",
  fill: CODE_BACKGROUND,
} as const;

export const STYLES: IStylesOptions = {
  default: {
    document: {
      run: { font: FONT, size: halfPoints(BODY_SIZE) },
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
    heading2: HEADING2,
    // 13.75pt doesn't fit half points
    heading3: heading(3, 13.75, 1),
    heading4: heading(4, BODY_SIZE, BODY_LINE_HEIGHT, { bold: true }),
    heading5: heading(5, BODY_SIZE, BODY_LINE_HEIGHT, {
      bold: true,
      italics: true,
    }),
    heading6: heading(6, BODY_SIZE, BODY_LINE_HEIGHT, { italics: true }),
  },
  paragraphStyles: [
    // Word's own names, see ../bands.ts
    ...[STYLE.header, STYLE.footer].map((id) => ({
      id,
      name: id.toLowerCase(),
      basedOn: "Normal",
      run: { size: halfPoints(BAND.size), color: BAND.color.slice(1) },
      paragraph: {
        spacing: { after: 0, line: 240, lineRule: "auto" as const },
      },
    })),
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
      name: STYLE_NAMES.quote,
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
      name: STYLE_NAMES.codeBlock,
      basedOn: "Normal",
      quickFormat: true,
      run: { font: CODE_FONT, size: halfPoints(10) },
      paragraph: {
        shading: codeShading,
        spacing: { after: 0, line: 240, lineRule: "auto" as const },
      },
    },
    {
      // Word's own name, so it shows up as its built-in caption style; a step
      // down on the scale, like the caption in the editor
      id: STYLE.caption,
      name: STYLE_NAMES.caption,
      basedOn: "Normal",
      next: "Normal",
      quickFormat: true,
      run: { size: halfPoints(BODY_SIZE / 1.25), italics: true },
      paragraph: { keepNext: true, spacing: { after: twips(4) } },
    },
    {
      // small print, e.g. a letter's return address: a step down, like the
      // style "small" of the pages
      id: STYLE.small,
      name: "Small",
      basedOn: "Normal",
      quickFormat: true,
      run: { size: halfPoints(BODY_SIZE / 1.25) },
    },
    {
      // the text of header cells, named like LibreOffice's style for it
      id: STYLE.tableHeading,
      name: STYLE_NAMES.tableHeading,
      basedOn: "Normal",
      run: { bold: true },
    },
    {
      // the title of a table of contents, Word's own style for it: as a
      // heading 2, but no heading itself (no outline level), and close to
      // the entries
      id: STYLE.tocHeading,
      name: "TOC Heading",
      basedOn: "Normal",
      next: "Normal",
      run: HEADING2.run,
      paragraph: {
        keepNext: true,
        spacing: { ...HEADING2.paragraph.spacing, before: 0, after: twips(8) },
      },
    },
    // the entries of a table of contents, Word's own styles for them,
    // indented by level as on the pages
    ...[1, 2, 3, 4, 5, 6].map((level) => ({
      id: `TOC${level}`,
      name: `toc ${level}`,
      basedOn: "Normal",
      next: "Normal",
      paragraph: {
        indent: { left: (level - 1) * 240 },
        spacing: { after: twips(2) },
      },
    })),
    {
      // also the name LibreOffice gives its horizontal line style
      id: STYLE.horizontalLine,
      name: STYLE_NAMES.horizontalLine,
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
      // Word's own name, for what an empty content control says
      id: STYLE.placeholder,
      name: "Placeholder Text",
      run: { color: "808080" },
    },
    {
      id: STYLE.inlineCode,
      name: STYLE_NAMES.inlineCode,
      quickFormat: true,
      run: { font: CODE_FONT, shading: codeShading },
    },
  ],
};

/**
 * stylesFor returns the styles of a document whose headings of the levels
 * `newPageBefore` start a new page, which Word calls "Page break before"
 */
export const stylesFor = (newPageBefore: number[]): IStylesOptions => {
  const defaults = STYLES.default as Record<
    string,
    { paragraph?: object } | undefined
  >;
  const headings = Object.fromEntries(
    newPageBefore.map((level) => {
      const style = defaults[`heading${level}`];
      return [
        `heading${level}`,
        { ...style, paragraph: { ...style?.paragraph, pageBreakBefore: true } },
      ];
    }),
  );
  return { ...STYLES, default: { ...STYLES.default, ...headings } };
};

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
