import type { Node } from "prosemirror-model";
import { TableMap } from "prosemirror-tables";

import { headerRowCount, isHeaderCell, schema } from "../markdown";
import { columnPercents } from "../markdown/tables";

// Lays out a table for the PDF and the Word export alike: which cell sits
// where, which rows repeat as a header on every page, and how wide each
// column is. The widths are the ones set by resizing the columns, or follow
// the content like the editor's automatic layout does.

export interface GridCell {
  node: Node;
  // the first row and column the cell covers
  row: number;
  col: number;
  rowspan: number;
  colspan: number;
  header: boolean;
  // where the cell starts, counted from the start of the table's content
  // (TableMap's offset). The same node may stand in several cells, e.g.
  // after pasting one cell into a larger selection, so only this tells them
  // apart.
  offset: number;
}

export interface TableGrid {
  // one entry per row and column: the cell that starts there, or null where
  // a merged cell covers the position
  rows: (GridCell | null)[][];
  // the leading rows of header cells, repeated at the top of every page
  headerRows: number;
  // the width of each column as a share of the table, adding up to 1
  widths: number[];
}

// the colours of the table theme in src/scss/main.scss on paper (see
// src/layout/paperColors.ts): 20% of the text colour for the lines, 55% for
// the line under the header rows and 6% for the tint of header cells
export const TABLE_COLORS = {
  line: "#d1d4d6",
  headerLine: "#82898e",
  headerFill: "#f1f2f3",
};

// the lines and padding of the table theme: 1px lines and a 2px line under
// the header rows at the editor's 18px, set in points for 11pt body text, and
// cells padded by 0.4em and 0.7em
export const TABLE_LINES = { line: 0.6, headerLine: 1.2 };
export const TABLE_PADDING = { y: 0.4, x: 0.7 };

// a column is at least this many characters wide and counts at most this
// many, so a long paragraph doesn't squeeze its neighbours to nothing
const MIN_CHARS = 3;
const MAX_CHARS = 40;
// a cell with more text than this might not fit on a page
const TALL_TEXT = 600;

/**
 * textLength returns the length of the longest line of `cell`
 */
const textLength = (cell: Node) =>
  Math.max(
    0,
    ...cell
      .textBetween(0, cell.content.size, "\n", "\n")
      .split("\n")
      .map((line) => line.length),
  );

/**
 * tableGrid lays out `table` for an export
 */
export const tableGrid = (table: Node): TableGrid => {
  const map = TableMap.get(table);
  const rows: (GridCell | null)[][] = Array.from({ length: map.height }, () =>
    Array<GridCell | null>(map.width).fill(null),
  );
  const chars = Array<number>(map.width).fill(MIN_CHARS);
  const seen = new Set<number>();

  map.map.forEach((offset, index) => {
    if (seen.has(offset)) return;
    seen.add(offset);
    const node = table.nodeAt(offset)!;
    const row = Math.floor(index / map.width);
    const col = index % map.width;
    const { colspan, rowspan } = node.attrs as {
      colspan: number;
      rowspan: number;
    };
    const header = isHeaderCell(node);
    rows[row][col] = { node, row, col, rowspan, colspan, header, offset };
    if (colspan === 1) {
      chars[col] = Math.max(chars[col], Math.min(textLength(node), MAX_CHARS));
    }
  });

  // a table of header cells only has no body to repeat them over
  const leading = headerRowCount(table);
  const headerRows = leading === map.height ? 0 : leading;

  const percents = columnPercents(table);
  const total = chars.reduce((sum, n) => sum + n, 0);
  const widths = percents
    ? percents.map((percent) => percent / 100)
    : chars.map((n) => n / total);
  return { rows, headerRows, widths };
};

/**
 * cellShare returns the share of the table's width `cell` spans
 */
export const cellShare = (grid: TableGrid, cell: GridCell) =>
  grid.widths
    .slice(cell.col, cell.col + cell.colspan)
    .reduce((sum, width) => sum + width, 0);

/**
 * hasTallRows tells whether a row of `table` might not fit on a page: a cell
 * with an image or a lot of text. Such rows may break across pages instead
 * of being clipped.
 */
export const hasTallRows = (table: Node) =>
  table.children.some((row) =>
    row.children.some((cell) => {
      let image = false;
      cell.descendants((node) => {
        image ||= node.type === schema.nodes.image;
        return !image;
      });
      return image || cell.textContent.length > TALL_TEXT;
    }),
  );
