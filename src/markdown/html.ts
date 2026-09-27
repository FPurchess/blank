import { DOMParser as SchemaParser, Node } from "prosemirror-model";

import { alignment, schema } from "./schema";

/**
 * LinkRules normalize and check link and image URLs, like the markdown-it
 * instance that reads markdown does
 */
export interface LinkRules {
  normalizeLink(url: string): string;
  validateLink(url: string): boolean;
}

export interface NormalizeOptions {
  // gives a table without header cells a header row, as a pipe table needs
  // one, e.g. a table imported from Word
  promoteHeader?: boolean;
}

// the largest span HTML allows
const MAX_SPAN = 1000;
// what separates the cells of a nested table that became text
export const CELL_SEPARATOR = " | ";

/**
 * rename replaces `element` with an element named `tag` that has the same
 * attributes and children
 */
export const rename = (element: Element, tag: string) => {
  const renamed = element.ownerDocument.createElement(tag);
  for (const { name, value } of [...element.attributes]) {
    renamed.setAttribute(name, value);
  }
  renamed.append(...element.childNodes);
  element.replaceWith(renamed);
};

/**
 * rowsOf returns the rows of `table` in reading order, without those of
 * tables nested in its cells
 */
const rowsOf = (table: HTMLTableElement): HTMLTableRowElement[] =>
  [...table.querySelectorAll("tr")].filter(
    (row) => row.closest("table") === table,
  );

/**
 * cellsOf returns the cells of `row`
 */
const cellsOf = (row: HTMLTableRowElement): HTMLTableCellElement[] =>
  [...row.children].filter(
    (child): child is HTMLTableCellElement =>
      child.tagName === "TD" || child.tagName === "TH",
  );

/**
 * flatten replaces the nested `table` with one paragraph per row, its cells'
 * text joined by " | "
 */
const flatten = (table: HTMLTableElement) => {
  const doc = table.ownerDocument;
  const rows = rowsOf(table).map((row) => {
    const p = doc.createElement("p");
    p.textContent = cellsOf(row)
      .map((cell) => cell.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .join(CELL_SEPARATOR);
    return p;
  });
  table.replaceWith(...rows);
};

/**
 * span reads a colspan or rowspan attribute as a whole number of at least 1
 */
const span = (cell: Element, name: string): number => {
  const value = parseInt(cell.getAttribute(name) ?? "1", 10);
  return Number.isFinite(value) ? Math.min(Math.max(value, 1), MAX_SPAN) : 1;
};

/**
 * cleanCell keeps only the attributes Blank understands on `cell` and turns
 * what a cell can't hold into what it can
 */
const cleanCell = (cell: HTMLTableCellElement) => {
  const align = alignment(cell.style.textAlign || cell.getAttribute("align"));
  const colspan = span(cell, "colspan");
  const rowspan = span(cell, "rowspan");
  for (const { name } of [...cell.attributes]) cell.removeAttribute(name);
  if (colspan > 1) cell.setAttribute("colspan", String(colspan));
  if (rowspan > 1) cell.setAttribute("rowspan", String(rowspan));
  if (align) cell.setAttribute("style", `text-align: ${align}`);

  const doc = cell.ownerDocument;
  // headings become bold paragraphs and rules are dropped
  for (const heading of cell.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    const p = doc.createElement("p");
    const strong = doc.createElement("strong");
    strong.append(...heading.childNodes);
    p.append(strong);
    heading.replaceWith(p);
  }
  for (const rule of cell.querySelectorAll("hr")) rule.remove();

  // empty paragraphs go, but a cell keeps at least one
  const empty = [...cell.querySelectorAll(":scope > p")].filter(
    (p) => !p.textContent?.trim() && !p.querySelector("img, br"),
  );
  const keepOne =
    empty.length === cell.children.length && !cell.textContent?.trim();
  for (const p of keepOne ? empty.slice(1) : empty) p.remove();
  if (!cell.childNodes.length) cell.append(doc.createElement("p"));
};

/**
 * cleanLinks checks links and images with the rules markdown links get, so
 * HTML can't bring in what markdown would drop (e.g. javascript: links)
 */
const cleanLinks = (table: HTMLTableElement, links: LinkRules) => {
  const check = (url: string | null): string | null => {
    if (url === null) return null;
    const normalized = links.normalizeLink(url.trim());
    return links.validateLink(normalized) ? normalized : null;
  };
  for (const link of table.querySelectorAll("a")) {
    const href = check(link.getAttribute("href"));
    if (href) link.setAttribute("href", href);
    else link.removeAttribute("href");
  }
  for (const image of table.querySelectorAll("img")) {
    const src = check(image.getAttribute("src"));
    if (src) image.setAttribute("src", src);
    else image.remove();
  }
};

/**
 * rectangular adds empty cells to rows that are shorter than the table, and
 * shortens row spans that reach below the last row
 */
const rectangular = (rows: HTMLTableRowElement[]) => {
  const taken: boolean[][] = rows.map(() => []);
  rows.forEach((row, r) => {
    let c = 0;
    for (const cell of cellsOf(row)) {
      while (taken[r][c]) c++;
      const rowspan = Math.min(span(cell, "rowspan"), rows.length - r);
      if (rowspan > 1) cell.setAttribute("rowspan", String(rowspan));
      else cell.removeAttribute("rowspan");
      const colspan = span(cell, "colspan");
      for (let dr = 0; dr < rowspan; dr++) {
        for (let dc = 0; dc < colspan; dc++) taken[r + dr][c + dc] = true;
      }
      c += colspan;
    }
  });
  const width = Math.max(...taken.map((row) => row.length));
  rows.forEach((row, r) => {
    const filled = taken[r].filter(Boolean).length;
    const tag = cellsOf(row).every((cell) => cell.tagName === "TH")
      ? "th"
      : "td";
    for (let i = filled; i < width; i++) {
      const cell = row.ownerDocument.createElement(tag);
      cell.append(row.ownerDocument.createElement("p"));
      row.append(cell);
    }
  });
};

/**
 * normalizeTableHtml turns the HTML `table` into one the schema holds exactly:
 * its caption goes into `data-caption`, nested tables become text, cells keep
 * only their spans and alignment, and the grid becomes rectangular
 * @returns how many nested tables became text
 */
export const normalizeTableHtml = (
  table: HTMLTableElement,
  links: LinkRules,
  { promoteHeader = false }: NormalizeOptions = {},
): number => {
  const nested = [...table.querySelectorAll("table")].reverse();
  for (const inner of nested) flatten(inner);

  const caption = table.querySelector(":scope > caption");
  for (const { name } of [...table.attributes]) table.removeAttribute(name);
  if (caption) {
    const text = caption.textContent?.replace(/\s+/g, " ").trim();
    if (text) table.setAttribute("data-caption", text);
    caption.remove();
  }
  for (const col of table.querySelectorAll("colgroup, col")) col.remove();
  // a footer written before the body belongs below it
  for (const foot of table.querySelectorAll(":scope > tfoot")) {
    table.append(foot);
  }

  let rows = rowsOf(table);
  for (const row of rows) {
    if (!cellsOf(row).length) row.remove();
  }
  rows = rowsOf(table);
  for (const row of rows) cellsOf(row).forEach(cleanCell);
  rectangular(rows);
  cleanLinks(table, links);
  if (promoteHeader && rows.length && !table.querySelector("th")) {
    cellsOf(rows[0]).forEach((cell) => rename(cell, "th"));
  }
  return nested.length;
};

/**
 * parseHtmlTable reads the HTML of a single table, as Blank writes a table a
 * pipe table can't hold. Returns null if the HTML is anything but exactly one
 * table, e.g. with text after it, or if there's no DOM to read it with.
 */
export const parseHtmlTable = (html: string, links: LinkRules): Node | null => {
  if (typeof DOMParser === "undefined") return null;
  const dom = new DOMParser().parseFromString(html, "text/html");
  const content = [...dom.body.childNodes].filter(
    (node) => node.nodeType !== 3 /* text */ || node.textContent?.trim(),
  );
  const [table] = content;
  if (content.length !== 1 || table.nodeName !== "TABLE") return null;
  normalizeTableHtml(table as HTMLTableElement, links);
  try {
    const parsed = SchemaParser.fromSchema(schema).parse(dom.body);
    const node = parsed.firstChild;
    if (parsed.childCount !== 1 || node?.type !== schema.nodes.table) {
      return null;
    }
    node.check();
    return node;
  } catch {
    return null;
  }
};
