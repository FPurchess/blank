import { DOMSerializer, Node } from "prosemirror-model";

import { Alignment, schema } from "../schema";

/**
 * GfmBlocker names what keeps a table from being written as a pipe table
 */
export type GfmBlocker =
  "merged" | "headerColumn" | "noHeader" | "blocks" | "caption" | "mixedAlign";

const isHeader = (cell: Node) => cell.type === schema.nodes.table_header;

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
      if (r === 0 && !isHeader(cell)) found.add("noHeader");
      if (r > 0 && isHeader(cell)) found.add("headerColumn");
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
  const order: GfmBlocker[] = [
    "merged",
    "headerColumn",
    "noHeader",
    "blocks",
    "caption",
    "mixedAlign",
  ];
  return order.find((blocker) => found.has(blocker)) ?? null;
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

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * displayWidth returns how many columns `text` takes in a monospaced font, so
 * pipe tables line up in the file with CJK text and emoji too
 */
export const displayWidth = (text: string): number => {
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
  const rows: string[][] = [];
  table.forEach((row) => {
    const texts: string[] = [];
    row.forEach((cell) => texts.push(cellText(cell)));
    rows.push(texts);
  });
  const aligns: (Alignment | null)[] = [];
  table.firstChild?.forEach((cell) => aligns.push(cell.attrs.align));
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
 * can't: merged cells, header columns, blocks in cells and a caption
 */
export const htmlLines = (table: Node): string[] => {
  const rows: Node[] = [];
  table.forEach((row) => rows.push(row));
  let headerRows = 0;
  while (
    headerRows < rows.length &&
    rows[headerRows].content.content.every(isHeader)
  ) {
    headerRows++;
  }

  const rowLines = (row: Node, inHead: boolean): string[] => {
    const cells: string[] = [];
    row.forEach((cell) => {
      const tag = isHeader(cell) ? "th" : "td";
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
  const section = (tag: string, part: Node[], inHead: boolean) =>
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
  return [
    "<table>",
    ...caption,
    ...section("thead", rows.slice(0, headerRows), true),
    ...section("tbody", rows.slice(headerRows), false),
    "</table>",
  ];
};
