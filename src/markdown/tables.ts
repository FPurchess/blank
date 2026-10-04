import { DOMSerializer, Fragment, Node } from "prosemirror-model";
import { TableMap } from "prosemirror-tables";

import { Alignment, headerRowCount, isHeaderCell, schema } from "./schema";

/**
 * GfmBlocker names what keeps a table from being written as a pipe table
 */
export type GfmBlocker =
  | "merged"
  | "headerColumn"
  | "noHeader"
  | "blocks"
  | "caption"
  | "mixedAlign"
  | "widths";

// the order in which gfmBlocker names what it found
const BLOCKERS: GfmBlocker[] = [
  "merged",
  "headerColumn",
  "noHeader",
  "blocks",
  "caption",
  "mixedAlign",
  "widths",
];

/**
 * cellAt returns the offset in `map`'s table of the cell that covers `row`
 * and `col`, as TableMap counts them
 */
export const cellAt = (map: TableMap, row: number, col: number) =>
  map.map[row * map.width + col];

/**
 * roundPercent rounds a percentage to a tenth, as the file keeps it
 */
export const roundPercent = (value: number) => Math.round(value * 10) / 10;

/**
 * columnPercents returns the width of each column of `table` as a percentage
 * of the table, as set by resizing a column, or null if its columns size to
 * their content. The widths live in the `colwidth` of the cells, one per
 * column a cell spans; a column without one gets the average of the others.
 */
export const columnPercents = (table: Node): number[] | null => {
  const map = TableMap.get(table);
  const widths: (number | null)[] = Array(map.width).fill(null);
  for (const offset of new Set(map.map)) {
    const { colwidth, colspan } = table.nodeAt(offset)!.attrs as {
      colwidth: number[] | null;
      colspan: number;
    };
    const col = map.colCount(offset);
    for (let i = 0; i < colspan; i++) {
      if (colwidth?.[i]) widths[col + i] ??= colwidth[i];
    }
  }
  const known = widths.filter((width): width is number => width !== null);
  if (!known.length) return null;
  const average = known.reduce((sum, width) => sum + width, 0) / known.length;
  const filled = widths.map((width) => width ?? average);
  const total = filled.reduce((sum, width) => sum + width, 0);
  return filled.map((width) => roundPercent((width / total) * 100));
};

/**
 * cellWidths returns the `colwidth` each cell of `table` gets for the column
 * widths `percents`, or null for all of them, by the cell's offset in the
 * table
 */
export const cellWidths = (
  table: Node,
  percents: readonly number[] | null,
): Map<number, number[] | null> => {
  const map = TableMap.get(table);
  const result = new Map<number, number[] | null>();
  for (const offset of new Set(map.map)) {
    const col = map.colCount(offset);
    const { colspan } = table.nodeAt(offset)!.attrs as { colspan: number };
    result.set(offset, percents ? percents.slice(col, col + colspan) : null);
  }
  return result;
};

/**
 * mapCells returns `table` with each cell replaced by what `change` makes of
 * it, given the column it starts in
 */
const mapCells = (
  table: Node,
  change: (cell: Node, col: number) => Node,
): Node => {
  const map = TableMap.get(table);
  const rows: Node[] = [];
  let offset = 0;
  table.forEach((row) => {
    const cells: Node[] = [];
    let cellOffset = offset + 1;
    row.forEach((cell) => {
      cells.push(change(cell, map.colCount(cellOffset)));
      cellOffset += cell.nodeSize;
    });
    rows.push(row.copy(Fragment.from(cells)));
    offset += row.nodeSize;
  });
  return table.copy(Fragment.from(rows));
};

/**
 * withAttrs returns `cell` with `attrs` changed
 */
const withAttrs = (cell: Node, attrs: Record<string, unknown>) =>
  cell.type.create({ ...cell.attrs, ...attrs }, cell.content, cell.marks);

/**
 * withColumnPercents returns `table` with the column widths `percents`, see
 * columnPercents
 */
export const withColumnPercents = (
  table: Node,
  percents: readonly number[],
): Node =>
  mapCells(table, (cell, col) =>
    withAttrs(cell, {
      colwidth: percents.slice(col, col + (cell.attrs.colspan as number)),
    }),
  );

/**
 * withColumnAlignment returns `table` aligned by columns, as a pipe table
 * is: a column keeps the alignment all its body cells agree on, for all its
 * cells, and none otherwise. Left, the default, counts as none. Merged cells
 * aren't aligned.
 */
export const withColumnAlignment = (table: Node): Node => {
  const map = TableMap.get(table);
  // the header rows unless they're all there is
  const headerRows = headerRowCount(table);
  const body = headerRows < map.height ? headerRows : 0;
  const found: Set<Alignment | null>[] = Array.from(
    { length: map.width },
    () => new Set(),
  );
  for (const offset of new Set(map.map)) {
    const cell = table.nodeAt(offset)!;
    const { top, left } = map.findCell(offset);
    if (top >= body && cell.attrs.colspan === 1) {
      const align = cell.attrs.align as Alignment | null;
      found[left].add(align === "left" ? null : align);
    }
  }
  const aligns = found.map((set) => (set.size === 1 ? [...set][0] : null));
  return mapCells(table, (cell, col) =>
    withAttrs(cell, {
      align: cell.attrs.colspan === 1 ? aligns[col] : null,
    }),
  );
};

/**
 * gfmBlocker returns what keeps `table` from being written as a GitHub
 * flavored markdown pipe table, or null if it fits one
 */
export const gfmBlocker = (table: Node): GfmBlocker | null => {
  const found = new Set<GfmBlocker>();
  const aligns: (Alignment | null)[] = [];
  table.forEach((row, _, r) => {
    row.forEach((cell, _, c) => {
      if (cell.attrs.colspan > 1 || cell.attrs.rowspan > 1) found.add("merged");
      if (r === 0 && !isHeaderCell(cell)) found.add("noHeader");
      if (r > 0 && isHeaderCell(cell)) found.add("headerColumn");
      const { firstChild } = cell;
      if (
        cell.childCount !== 1 ||
        firstChild?.type !== schema.nodes.paragraph
      ) {
        found.add("blocks");
      }
      if (r === 0) aligns[c] = cell.attrs.align;
      else if (aligns[c] !== cell.attrs.align) found.add("mixedAlign");
    });
  });
  if (table.attrs.caption) found.add("caption");
  if (columnPercents(table)) found.add("widths");
  return BLOCKERS.find((blocker) => found.has(blocker)) ?? null;
};

/**
 * isWide tells whether the character `code` takes two columns in a monospaced
 * font, as East Asian wide and fullwidth characters do
 */
const isWide = (code: number) =>
  (code >= 0x1100 && code <= 0x115f) ||
  (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
  (code >= 0xac00 && code <= 0xd7a3) ||
  (code >= 0xf900 && code <= 0xfaff) ||
  (code >= 0xfe30 && code <= 0xfe4f) ||
  (code >= 0xff00 && code <= 0xff60) ||
  (code >= 0xffe0 && code <= 0xffe6) ||
  (code >= 0x1f300 && code <= 0x1faff) ||
  (code >= 0x20000 && code <= 0x3fffd);

// made on first use, so importing the schema doesn't need Intl.Segmenter
let graphemes: Intl.Segmenter | undefined;

/**
 * displayWidth returns how many columns `text` takes in a monospaced font, so
 * pipe tables line up in the file with CJK text and emoji too
 */
export const displayWidth = (text: string): number => {
  graphemes ??= new Intl.Segmenter(undefined, { granularity: "grapheme" });
  let width = 0;
  for (const { segment } of graphemes.segment(text)) {
    const wide = isWide(segment.codePointAt(0) ?? 0) || segment.includes("️");
    width += wide ? 2 : 1;
  }
  return width;
};

/**
 * pad fills `text` with spaces to `width` columns, on the side the column's
 * alignment calls for
 */
const pad = (text: string, width: number, align: Alignment | null) => {
  const space = width - displayWidth(text);
  if (align === "right") return " ".repeat(space) + text;
  if (align === "center") {
    const left = Math.floor(space / 2);
    return " ".repeat(left) + text + " ".repeat(space - left);
  }
  return text + " ".repeat(space);
};

/**
 * delimiter returns the delimiter row cell for a column `width` wide
 */
const delimiter = (width: number, align: Alignment | null) => {
  if (align === "left") return ":" + "-".repeat(width - 1);
  if (align === "right") return "-".repeat(width - 1) + ":";
  if (align === "center") return ":" + "-".repeat(width - 2) + ":";
  return "-".repeat(width);
};

/**
 * gfmLines writes `table` as a pipe table, padded so the columns line up.
 * `cellText` returns the markdown of a cell on a single line.
 */
export const gfmLines = (
  table: Node,
  cellText: (cell: Node) => string,
): string[] => {
  const rows = table.children.map((row) => row.children.map(cellText));
  const aligns: (Alignment | null)[] = table.children[0].children.map(
    (cell) => cell.attrs.align,
  );
  const widths = aligns.map((_, c) =>
    Math.max(3, ...rows.map((row) => displayWidth(row[c] ?? ""))),
  );
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  const [header, ...body] = rows;
  return [
    line(header.map((text, c) => pad(text, widths[c], aligns[c]))),
    line(widths.map((width, c) => delimiter(width, aligns[c]))),
    ...body.map((row) =>
      line(row.map((text, c) => pad(text, widths[c], aligns[c]))),
    ),
  ];
};

/**
 * escapeHtml escapes `text` for HTML text and attribute values
 */
const escapeHtml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * cellHtml returns the content of `cell` as HTML on a single line: inline
 * content for a cell with a single paragraph, the blocks otherwise
 */
const cellHtml = (cell: Node): string => {
  const serializer = DOMSerializer.fromSchema(schema);
  const { firstChild } = cell;
  const content =
    cell.childCount === 1 && firstChild?.type === schema.nodes.paragraph
      ? firstChild.content
      : cell.content;
  const container = document.createElement("div");
  container.append(serializer.serializeFragment(content, { document }));
  // a blank line would end the HTML block, so newlines become references
  return container.innerHTML.replace(/\r?\n/g, "&#10;");
};

/**
 * htmlLines writes `table` as an HTML table that holds what a pipe table
 * can't: merged cells, header columns, blocks in cells, a caption and column
 * widths
 */
export const htmlLines = (table: Node): string[] => {
  const rows = table.children;
  const headerRows = headerRowCount(table);

  const rowLines = (row: Node, inHead: boolean): string[] => {
    const cells: string[] = [];
    row.forEach((cell) => {
      const tag = isHeaderCell(cell) ? "th" : "td";
      const attrs: string[] = [];
      if (tag === "th") attrs.push(`scope="${inHead ? "col" : "row"}"`);
      if (cell.attrs.colspan > 1) attrs.push(`colspan="${cell.attrs.colspan}"`);
      if (cell.attrs.rowspan > 1) attrs.push(`rowspan="${cell.attrs.rowspan}"`);
      if (cell.attrs.align) {
        attrs.push(`style="text-align: ${cell.attrs.align}"`);
      }
      const open = [tag, ...attrs].join(" ");
      cells.push(`      <${open}>${cellHtml(cell)}</${tag}>`);
    });
    return ["    <tr>", ...cells, "    </tr>"];
  };
  const section = (tag: string, part: readonly Node[], inHead: boolean) =>
    part.length
      ? [
          `  <${tag}>`,
          ...part.flatMap((row) => rowLines(row, inHead)),
          `  </${tag}>`,
        ]
      : [];

  const caption = table.attrs.caption
    ? [`  <caption>${escapeHtml(table.attrs.caption)}</caption>`]
    : [];
  const percents = columnPercents(table);
  const columns = percents
    ? [
        "  <colgroup>",
        ...percents.map((percent) => `    <col style="width: ${percent}%">`),
        "  </colgroup>",
      ]
    : [];
  return [
    "<table>",
    ...caption,
    ...columns,
    ...section("thead", rows.slice(0, headerRows), true),
    ...section("tbody", rows.slice(headerRows), false),
    "</table>",
  ];
};
