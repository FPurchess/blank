import type { Node } from "prosemirror-model";

import { fitBox } from "../../images/fit";
import { CONTENT_HEIGHT, CONTENT_WIDTH } from "../page";
import {
  cellShare,
  hasTallRows,
  tableGrid,
  TABLE_COLORS,
  TABLE_LINES,
  type GridCell,
  type TableGrid,
} from "../table";
import type { PdfImages } from ".";
import { TABLE_CELL_PADDING_X, TABLE_CELL_PADDING_Y } from "./template";

// renders the blocks of a node without outer margins, see edgeless in index.ts
type Blocks = (n: Node, images: PdfImages) => object[];

/**
 * tableLayout draws the table like the editor: a line under every row, a
 * stronger one under the header rows, lines between the columns and none
 * around the table's sides and top
 */
export const tableLayout = (headerRows: number) => ({
  hLineWidth: (i: number) =>
    i === 0
      ? 0
      : headerRows && i === headerRows
        ? TABLE_LINES.headerLine
        : TABLE_LINES.line,
  vLineWidth: (i: number, node: { table: { widths: unknown[] } }) =>
    i === 0 || i === node.table.widths.length ? 0 : TABLE_LINES.line,
  hLineColor: (i: number) =>
    headerRows && i === headerRows
      ? TABLE_COLORS.headerLine
      : TABLE_COLORS.line,
  vLineColor: () => TABLE_COLORS.line,
  paddingLeft: () => TABLE_CELL_PADDING_X,
  paddingRight: () => TABLE_CELL_PADDING_X,
  paddingTop: () => TABLE_CELL_PADDING_Y,
  paddingBottom: () => TABLE_CELL_PADDING_Y,
});

/**
 * percentages turns column shares into pdfmake widths in percent, which it
 * takes of the width available where the table is, e.g. inside a list
 */
const percentages = (widths: number[]) =>
  widths.map((width) => `${(width * 100).toFixed(3)}%`);

/**
 * fitImages returns `images` sized to fit `maxWidth`, for the images of a cell
 */
const fitImages = (images: PdfImages, maxWidth: number): PdfImages =>
  new Map(
    [...images].map(([src, image]) => [
      src,
      { ...image, ...fitBox(image, maxWidth, CONTENT_HEIGHT) },
    ]),
  );

/**
 * cellBlock renders `cell`, with its alignment, and bold and tinted if it's
 * a header cell
 */
const cellBlock = (
  cell: GridCell,
  grid: TableGrid,
  images: PdfImages,
  blocks: Blocks,
) => {
  const maxWidth =
    cellShare(grid, cell) * CONTENT_WIDTH - 2 * TABLE_CELL_PADDING_X;
  return {
    stack: blocks(cell.node, fitImages(images, maxWidth)),
    ...(cell.colspan > 1 ? { colSpan: cell.colspan } : {}),
    ...(cell.rowspan > 1 ? { rowSpan: cell.rowspan } : {}),
    ...(cell.node.attrs.align ? { alignment: cell.node.attrs.align } : {}),
    ...(cell.header ? { bold: true, fillColor: TABLE_COLORS.headerFill } : {}),
  };
};

/**
 * tableBlock renders a table for pdfmake: the header rows repeat on every
 * page, rows stay whole unless they might not fit on one, and a caption goes
 * above the table
 */
export const tableBlock = (n: Node, images: PdfImages, blocks: Blocks) => {
  const grid = tableGrid(n);
  const table = {
    table: {
      headerRows: grid.headerRows,
      ...(grid.headerRows ? { keepWithHeaderRows: 1 } : {}),
      dontBreakRows: !hasTallRows(n),
      widths: percentages(grid.widths),
      // pdfmake wants an empty object where a merged cell covers a position
      body: grid.rows.map((row) =>
        row.map((cell) => (cell ? cellBlock(cell, grid, images, blocks) : {})),
      ),
    },
    layout: tableLayout(grid.headerRows),
  };
  const caption = n.attrs.caption as string | null;
  if (!caption) return table;
  return {
    stack: [
      // kept with the table, see pageBreakBefore in template.ts
      { text: caption, style: "table_caption" },
      table,
    ],
  };
};
