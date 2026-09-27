import { TABLE_PADDING } from "../table";

// Mirrors the editor typography in src/scss/_typography.scss: 11pt body and
// headings on a major third scale (1.25). pdfmake multiplies lineHeight with
// the natural line height of IBM Plex Sans (1.3em), so 1.12 is ~1.45 leading.
// The Word export mirrors these styles in ../docx/template.ts.
const FONT = "IBM Plex Sans";
const HEADING_FONT = "IBM Plex Sans Medium";
const BODY_SIZE = 11;
const BODY_LINE_HEIGHT = 1.12;

// margin: [left, top, right, bottom]
type Margin = [number, number, number, number];

const textStyleMixin = (
  fontSize: number,
  lineHeight: number,
  margin: Margin,
  options: {
    font?: string;
    italics?: boolean;
    bold?: boolean;
    characterSpacing?: number;
  } = {},
) => ({
  fontSize,
  lineHeight,
  margin,
  ...options,
});

// Unlike CSS, pdfmake doesn't collapse margins, so the top margin of a
// heading adds to the bottom margin of the block above: 8 + 16 = 24pt above
// a heading, 5pt below it. Headings sit closer to the text they introduce.
const BLOCK_MARGIN: Margin = [0, 0, 0, 8];
const HEADING_MARGIN: Margin = [0, 16, 0, 5];
// 5 + 4 = 9pt between consecutive headings
export const HEADING_AFTER_HEADING_MARGIN_TOP = 4;
// space between blocks inside a list item, e.g. a nested list
export const LIST_ITEM_BLOCK_MARGIN_TOP = 2;

// blockquotes mirror the editor: a 3px bar on the left and 1em of space
// between the bar and the text (src/scss/main.scss)
const BLOCKQUOTE_BAR = 2.25;
export const BLOCKQUOTE_LAYOUT = {
  hLineWidth: () => 0,
  vLineWidth: (index: number) => (index === 0 ? BLOCKQUOTE_BAR : 0),
  paddingLeft: () => BODY_SIZE,
  paddingRight: () => 0,
  paddingTop: () => 0,
  paddingBottom: () => 0,
};

// tables mirror the editor, see TABLE_PADDING and TABLE_LINES
export const TABLE_CELL_PADDING_Y = TABLE_PADDING.y * BODY_SIZE;
export const TABLE_CELL_PADDING_X = TABLE_PADDING.x * BODY_SIZE;
// a caption moves to the next page with its table when less room is left
// below it: enough for the caption, the header row and a first row
const CAPTION_ROOM = 72;

// a horizontal rule: the top line of an empty one-cell table, like the
// editor's 1px line
export const RULE_LAYOUT = {
  hLineWidth: (index: number) => (index === 0 ? 0.75 : 0),
  vLineWidth: () => 0,
  paddingLeft: () => 0,
  paddingRight: () => 0,
  paddingTop: () => 0,
  paddingBottom: () => 0,
};

type PageNode = {
  headlineLevel?: number;
  style?: string;
  // where the node starts on its page
  startPosition?: { top: number };
};
type PageNodes = {
  getFollowingNodesOnPage: () => PageNode[];
  getNodesOnNextPage: () => PageNode[];
};

// the page size and margins come from the document's layout, see
// src/layout/resolve.ts
export const BASE_DOCUMENT = {
  defaultStyle: {
    font: FONT,
    fontSize: BODY_SIZE,
    lineHeight: BODY_LINE_HEIGHT,
  },
  // heading1-3 are set in medium and stand out by size; bold is kept for
  // the body-sized headings
  styles: {
    paragraph: textStyleMixin(BODY_SIZE, BODY_LINE_HEIGHT, BLOCK_MARGIN),
    heading1: textStyleMixin(21.5, 0.92, HEADING_MARGIN, {
      font: HEADING_FONT,
      characterSpacing: -0.4,
    }),
    heading2: textStyleMixin(17, 0.96, HEADING_MARGIN, {
      font: HEADING_FONT,
      characterSpacing: -0.2,
    }),
    heading3: textStyleMixin(13.75, 1, HEADING_MARGIN, { font: HEADING_FONT }),
    heading4: textStyleMixin(BODY_SIZE, BODY_LINE_HEIGHT, HEADING_MARGIN, {
      bold: true,
    }),
    heading5: textStyleMixin(BODY_SIZE, BODY_LINE_HEIGHT, HEADING_MARGIN, {
      bold: true,
      italics: true,
    }),
    heading6: textStyleMixin(BODY_SIZE, BODY_LINE_HEIGHT, HEADING_MARGIN, {
      italics: true,
    }),
    list_item: textStyleMixin(BODY_SIZE, BODY_LINE_HEIGHT, [0, 2, 0, 2]),
    bullet_list: { margin: BLOCK_MARGIN },
    ordered_list: { margin: BLOCK_MARGIN },
    blockquote: { margin: BLOCK_MARGIN },
    table: { margin: BLOCK_MARGIN },
    // a step down on the scale, like the caption in the editor
    table_caption: textStyleMixin(
      BODY_SIZE / 1.25,
      BODY_LINE_HEIGHT,
      [0, 0, 0, 4],
      {
        italics: true,
      },
    ),
    // 2em of space around it, like in the editor
    horizontal_rule: { margin: [0, 14, 0, 22] },
  },
};

/**
 * pageBreakBefore keeps headings with the text they introduce: it moves a
 * heading to the next page when only headings follow it on this page.
 * Checking for "only headings" rather than "nothing" moves a run of headings
 * as a whole, since pdfmake asks about every node just once. A table caption
 * moves when there's no room for its table's first rows below it: pdfmake
 * still counts rows it later moves to the next page as on this one, so the
 * following nodes can't tell.
 * @param bottom where the text ends on the page, from its top edge
 */
export const pageBreakBefore =
  (bottom: number) => (node: PageNode, nodes: PageNodes) => {
    if (node.style === "table_caption" && node.startPosition) {
      return bottom - node.startPosition.top < CAPTION_ROOM;
    }
    return (
      node.headlineLevel !== undefined &&
      nodes.getNodesOnNextPage().length > 0 &&
      nodes
        .getFollowingNodesOnPage()
        .every((following) => following.headlineLevel !== undefined)
    );
  };
