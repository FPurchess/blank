import type { Command } from "prosemirror-state";
import { isInTable, selectedRect, type TableRect } from "prosemirror-tables";

import { headerRowCount } from "../../../markdown";
import { language } from "../../../state";
import { selectCells } from "./rect";

export type SortKind = "number" | "date" | "text";

/**
 * separators returns the group and decimal separators numbers are written
 * with in `lang`, e.g. "." and "," in German
 */
const separators = (lang: string) => {
  const parts = new Intl.NumberFormat(lang).formatToParts(12345.6);
  const find = (type: string) => parts.find((p) => p.type === type)?.value;
  return { group: find("group") ?? ",", decimal: find("decimal") ?? "." };
};

// a number, possibly with a sign, a currency symbol before it, and a percent
// sign, currency or unit after it. Letters before it make it text, e.g. "v2".
const reNumber =
  /^[^\p{L}\d+\-\u2212]*([+\-\u2212]?\d[\d\s\u00a0\u202f'.,]*)[^\d]*$/u;

/**
 * parseNumber reads `text` as a number written in `lang`, like "1.200,50 €"
 * in German, or returns undefined if it isn't one
 */
export const parseNumber = (text: string, lang: string) => {
  const match = reNumber.exec(text.trim());
  if (!match) return undefined;
  const { group, decimal } = separators(lang);
  const digits = match[1]
    .replace(/[\s\u00a0\u202f']/g, "")
    .split(group)
    .join("")
    .replace(decimal, ".")
    .replace("\u2212", "-");
  const value = Number(digits);
  return Number.isFinite(value) ? value : undefined;
};

/**
 * dayFirst tells whether dates are written day before month in `lang`
 */
const dayFirst = (lang: string) => {
  const parts = new Intl.DateTimeFormat(lang).formatToParts(
    new Date(2000, 11, 31),
  );
  const order = parts
    .map((p) => p.type)
    .filter((t) => t === "day" || t === "month");
  return order[0] === "day";
};

/**
 * parseDate reads `text` as a date: ISO (2024-12-31), with dots (31.12.2024)
 * or with slashes in the order of `lang` (12/31/2024 in English, 31/12/2024
 * in French). Returns its time, or undefined if it isn't a date.
 */
export const parseDate = (text: string, lang: string) => {
  const value = text.trim();
  let year: number, month: number, day: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (match) {
    [year, month, day] = [+match[1], +match[2], +match[3]];
  } else if ((match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value))) {
    [day, month, year] = [+match[1], +match[2], +match[3]];
  } else if ((match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value))) {
    const [first, second] = [+match[1], +match[2]];
    [day, month] = dayFirst(lang) ? [first, second] : [second, first];
    year = +match[3];
  } else {
    return undefined;
  }
  const date = new Date(year, month - 1, day);
  const valid =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;
  return valid ? date.getTime() : undefined;
};

/**
 * sortKind returns how `values` compare: as numbers if they all are numbers,
 * as dates if they all are dates, as text otherwise. Empty values don't count.
 */
export const sortKind = (values: string[], lang: string): SortKind => {
  const filled = values.filter((value) => value.trim());
  if (!filled.length) return "text";
  if (filled.every((value) => parseNumber(value, lang) !== undefined)) {
    return "number";
  }
  if (filled.every((value) => parseDate(value, lang) !== undefined)) {
    return "date";
  }
  return "text";
};

/**
 * compareValues returns how to compare values of `kind` in `lang`
 */
const compareValues = (kind: SortKind, lang: string) => {
  if (kind === "text") {
    const collator = new Intl.Collator(lang, {
      numeric: true,
      sensitivity: "base",
    });
    return collator.compare;
  }
  const parse = kind === "number" ? parseNumber : parseDate;
  return (a: string, b: string) => parse(a, lang)! - parse(b, lang)!;
};

/**
 * sortOrder returns the order of `values` sorted by `kind`, ascending, or
 * descending if they already are in ascending order. Empty values go last
 * either way, and equal values keep their order.
 */
export const sortOrder = (values: string[], lang: string) => {
  const kind = sortKind(values, lang);
  const compare = compareValues(kind, lang);
  const indices = values.map((_, index) => index);
  const empty = (i: number) => !values[i].trim();
  const sorted = (dir: 1 | -1) =>
    [...indices].sort((a, b) => {
      if (empty(a) || empty(b)) return Number(empty(a)) - Number(empty(b));
      return dir * compare(values[a], values[b]) || a - b;
    });
  const ascending = sorted(1);
  const already = ascending.every((index, position) => index === position);
  return { order: already ? sorted(-1) : ascending, kind, descending: already };
};

/**
 * sortColumn returns where the body rows of the table start and the values of
 * the selected column in them, or undefined if they can't be sorted: fewer
 * than two, or cells merged across them, so they don't stand on their own
 */
export const sortColumn = (rect: TableRect) => {
  const { map, table, left } = rect;
  const body = headerRowCount(table);
  if (map.height - body < 2) return undefined;
  for (let row = Math.max(body - 1, 0); row < map.height - 1; row++) {
    for (let col = 0; col < map.width; col++) {
      const here = map.map[row * map.width + col];
      if (here === map.map[(row + 1) * map.width + col]) return undefined;
    }
  }
  const values: string[] = [];
  for (let row = body; row < map.height; row++) {
    values.push(table.nodeAt(map.map[row * map.width + left])!.textContent);
  }
  return { body, values };
};

/**
 * sortByColumn sorts the body rows of the table by the column the selection
 * starts in, see sortOrder. The header rows stay on top.
 */
export const sortByColumn: Command = (state, dispatch) => {
  if (!isInTable(state)) return false;
  const rect = selectedRect(state);
  const column = sortColumn(rect);
  if (!column) return false;
  if (!dispatch) return true;

  const { table, tableStart, left } = rect;
  const { body, values } = column;
  const { order } = sortOrder(values, language.value);
  const rows = table.children.slice(body);
  let from = tableStart;
  for (let row = 0; row < body; row++) from += table.child(row).nodeSize;
  const tr = state.tr.replaceWith(
    from,
    tableStart + table.content.size,
    order.map((index) => rows[index]),
  );
  dispatch(
    selectCells(tr, rect, {
      top: body,
      bottom: body + 1,
      left,
      right: left + 1,
    }).scrollIntoView(),
  );
  return true;
};
