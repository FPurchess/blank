import { isMap, type Document } from "yaml";

import { isPaperName, PAPER, type PaperName } from "./paper";
import {
  formatLength,
  paperUnit,
  parseLength,
  sameLength,
  type Unit,
} from "./units";

// The page setup of a document, as the `page` key of its frontmatter and the
// `layout.page` key of blank.json hold it:
//
//   page:
//     size: a4              # auto, a3, a4, a5, b5, letter, legal or "W x H"
//     orientation: portrait # or landscape
//     margins: 2.5cm        # or { top, right, bottom, left }
//     new-page-before: 1    # the heading levels that start a new page
//     header: { left: "{title}" }   # left, center and right, one line each
//     footer: { center: "{page}" }  # see tokens.ts for {page} and the rest
//     first-page: plain     # none on the first page, or its own:
//                           #   { header: …, footer: … }
//     even-pages:           # the header and footer of even pages
//       header: { right: "{chapter}" }
//     number-style: i       # 1, i or I
//     start-number: 1       # the number of the first page

export type Orientation = "portrait" | "landscape";
export const ORIENTATIONS: Orientation[] = ["portrait", "landscape"];

// "auto" is the paper of the user's region, see paper.ts
export type PaperSize = "auto" | PaperName | { width: number; height: number };

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
export const SIDES: (keyof Margins)[] = ["top", "right", "bottom", "left"];

export interface PageSettings {
  size: PaperSize;
  orientation: Orientation;
  // in points
  margins: Margins;
  // the levels of the headings that start a new page, sorted, e.g. [1] for
  // chapters on new pages
  newPageBefore: number[];
  header: Slots;
  footer: Slots;
  // the header and footer of the first page, see FirstPage
  firstPage: FirstPage;
  // the header and footer of pages with an even number, null for the same
  // as on the others
  evenPages: Bands | null;
  // how page numbers are written: 1, 2, 3 or i, ii, iii or I, II, III
  numberStyle: NumberStyle;
  // the number of the first page
  startNumber: number;
}

// the text of a header or footer on the left, in the center and on the
// right, "" for nothing
export interface Slots {
  left: string;
  center: string;
  right: string;
}
export const SLOTS: (keyof Slots)[] = ["left", "center", "right"];
export const NO_SLOTS: Slots = { left: "", center: "", right: "" };

// a header and a footer
export interface Bands {
  header: Slots;
  footer: Slots;
}
export const NO_BANDS: Bands = { header: NO_SLOTS, footer: NO_SLOTS };

// "same" as the other pages, "plain" without a header and footer, e.g. a
// title page, or a header and footer of its own, e.g. a letterhead
export type FirstPage = "same" | "plain" | Bands;

export type NumberStyle = "1" | "i" | "I";
const NUMBER_STYLES: NumberStyle[] = ["1", "i", "I"];

// the heading levels of markdown
const LEVELS = [1, 2, 3, 4, 5, 6];

export const allMargins = (length: number): Margins => ({
  top: length,
  right: length,
  bottom: length,
  left: length,
});

export const DEFAULT_PAGE: PageSettings = {
  size: "auto",
  orientation: "portrait",
  margins: allMargins(parseLength("2.5cm") as number),
  newPageBefore: [],
  header: NO_SLOTS,
  footer: NO_SLOTS,
  firstPage: "same",
  evenPages: null,
  numberStyle: "1",
  startNumber: 1,
};

/**
 * portrait returns a size with the shorter side as its width
 */
export const portrait = (width: number, height: number) => ({
  width: Math.min(width, height),
  height: Math.max(width, height),
});

/**
 * sizeOf returns the portrait size of paper
 * @param size the paper
 * @param auto the paper "auto" stands for
 */
export const sizeOf = (size: PaperSize, auto: PaperName) => {
  const paper =
    typeof size === "string" ? PAPER[size === "auto" ? auto : size] : size;
  return { width: paper.width, height: paper.height };
};

// reading the settings as written; undefined for what can't be used

// a custom size, "176mm x 250mm"
const SIZE = /^(.+?)\s*[x×]\s*(.+)$/i;

const readSize = (value: unknown): PaperSize | undefined => {
  if (typeof value !== "string") return undefined;
  const name = value.trim().toLowerCase();
  if (name === "auto" || isPaperName(name)) return name;
  const match = SIZE.exec(value.trim());
  const width = parseLength(match?.[1]);
  const height = parseLength(match?.[2]);
  // whatever the order it was written in
  return width && height ? portrait(width, height) : undefined;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readMargins = (value: unknown, base: Margins): Margins | undefined => {
  const length = parseLength(value);
  if (length !== undefined) return allMargins(length);
  if (!isObject(value)) return undefined;
  const margins = { ...base };
  for (const [side, raw] of Object.entries(value)) {
    const length = parseLength(raw);
    if (!SIDES.includes(side as keyof Margins) || length === undefined) {
      return undefined;
    }
    margins[side as keyof Margins] = length;
  }
  return margins;
};

// one heading level or a list of them
const readLevels = (value: unknown): number[] | undefined => {
  const levels = Array.isArray(value) ? value : [value];
  if (!levels.every((level) => LEVELS.includes(level as number))) {
    return undefined;
  }
  return [...new Set(levels as number[])].sort((a, b) => a - b);
};

// slots of one line of text each; the others stay empty
const readSlots = (value: unknown): Slots | undefined => {
  if (!isObject(value)) return undefined;
  const slots = { ...NO_SLOTS };
  for (const [slot, text] of Object.entries(value)) {
    if (
      !SLOTS.includes(slot as keyof Slots) ||
      (typeof text !== "string" && typeof text !== "number") ||
      /[\r\n]/.test(String(text))
    ) {
      return undefined;
    }
    slots[slot as keyof Slots] = String(text);
  }
  return slots;
};

// a header and a footer, of which either may be left out
const readBands = (value: unknown): Bands | undefined => {
  if (!isObject(value)) return undefined;
  const bands = { ...NO_BANDS };
  for (const [band, slots] of Object.entries(value)) {
    const read = readSlots(slots);
    if ((band !== "header" && band !== "footer") || !read) return undefined;
    bands[band] = read;
  }
  return bands;
};

const readFirstPage = (value: unknown): FirstPage | undefined =>
  value === "same" || value === "plain" ? value : readBands(value);

// "same" is the same as leaving the key out
const readEvenPages = (value: unknown): Bands | null | undefined =>
  value === "same" ? null : readBands(value);

// 1 is written as a number, the way people write it
const readNumberStyle = (value: unknown) =>
  NUMBER_STYLES.includes(String(value) as NumberStyle)
    ? (String(value) as NumberStyle)
    : undefined;

const readStartNumber = (value: unknown) =>
  Number.isInteger(value) && (value as number) >= 0
    ? (value as number)
    : undefined;

// comparing settings by what they mean

/**
 * sameSize compares paper by name, and custom sizes by their dimensions. To
 * compare what paper is printed on, compare the paper of their layouts.
 */
export const sameSize = (a: PaperSize, b: PaperSize) =>
  typeof a === "string" || typeof b === "string"
    ? a === b
    : sameLength(a.width, b.width) && sameLength(a.height, b.height);

export const sameMargins = (a: Margins, b: Margins) =>
  SIDES.every((side) => sameLength(a[side], b[side]));

const sameLevels = (a: number[], b: number[]) =>
  a.length === b.length && a.every((level, index) => level === b[index]);

const sameSlots = (a: Slots, b: Slots) =>
  SLOTS.every((slot) => a[slot] === b[slot]);

const sameBands = (a: Bands | null, b: Bands | null) =>
  a === null || b === null
    ? a === b
    : sameSlots(a.header, b.header) && sameSlots(a.footer, b.footer);

const sameFirstPage = (a: FirstPage, b: FirstPage) =>
  typeof a === "string" || typeof b === "string" ? a === b : sameBands(a, b);

const same = <T>(a: T, b: T) => a === b;

// writing the settings into the frontmatter or blank.json

const writeSize = (size: PaperSize, unit: Unit) =>
  typeof size === "string"
    ? size
    : `${formatLength(size.width, paperUnit(unit))} x ${formatLength(size.height, paperUnit(unit))}`;

const writeMargins = (margins: Margins, unit: Unit) =>
  SIDES.every((side) => sameLength(margins[side], margins.top))
    ? formatLength(margins.top, unit)
    : Object.fromEntries(
        SIDES.map((side) => [side, formatLength(margins[side], unit)]),
      );

// only the slots with text, on one line, like { left: "{title}" }
const writeSlots = (slots: Slots) =>
  Object.fromEntries(
    SLOTS.filter((slot) => slots[slot]).map((slot) => [slot, slots[slot]]),
  );

// only the bands with text
const writeBands = (bands: Bands) =>
  Object.fromEntries(
    (["header", "footer"] as const)
      .filter((band) => SLOTS.some((slot) => bands[band][slot]))
      .map((band) => [band, writeSlots(bands[band])]),
  );

// per setting: its key in the frontmatter, how it is read, whether two
// values mean the same, and how a value is written
const KEYS = {
  size: { name: "size", read: readSize, same: sameSize, write: writeSize },
  orientation: {
    name: "orientation",
    read: (value: unknown) =>
      ORIENTATIONS.includes(value as Orientation)
        ? (value as Orientation)
        : undefined,
    same,
    write: (orientation: Orientation) => orientation,
  },
  margins: {
    name: "margins",
    read: readMargins,
    same: sameMargins,
    write: writeMargins,
  },
  newPageBefore: {
    name: "new-page-before",
    flow: true,
    read: readLevels,
    same: sameLevels,
    // a single level as a number, the way people write it
    write: (levels: number[]) => (levels.length === 1 ? levels[0] : levels),
  },
  header: {
    name: "header",
    flow: true,
    read: readSlots,
    same: sameSlots,
    write: writeSlots,
  },
  footer: {
    name: "footer",
    flow: true,
    read: readSlots,
    same: sameSlots,
    write: writeSlots,
  },
  firstPage: {
    name: "first-page",
    flow: "inner",
    read: readFirstPage,
    same: sameFirstPage,
    write: (firstPage: FirstPage) =>
      typeof firstPage === "string" ? firstPage : writeBands(firstPage),
  },
  evenPages: {
    name: "even-pages",
    flow: "inner",
    read: readEvenPages,
    same: sameBands,
    // none of their own as "same", which says so over a user's default
    // that has them
    write: (bands: Bands | null) =>
      bands === null ? "same" : writeBands(bands),
  },
  numberStyle: {
    name: "number-style",
    read: readNumberStyle,
    same,
    write: (style: NumberStyle) => (style === "1" ? 1 : style),
  },
  startNumber: {
    name: "start-number",
    read: readStartNumber,
    same,
    write: (number: number) => number,
  },
} as const;

export type PageKey = keyof PageSettings;
export const PAGE_KEYS = Object.keys(KEYS) as PageKey[];

// the settings of the header and footer, which the strips edit
export const BAND_KEYS = [
  "header",
  "footer",
  "firstPage",
  "evenPages",
  "numberStyle",
  "startNumber",
] as const satisfies PageKey[];
export type BandSettings = Pick<PageSettings, (typeof BAND_KEYS)[number]>;

/**
 * bandSettings returns the settings of the header and footer
 */
export const bandSettings = (settings: PageSettings): BandSettings =>
  Object.fromEntries(
    BAND_KEYS.map((key) => [key, settings[key]]),
  ) as unknown as BandSettings;

// KEYS[key] for a key that TypeScript can't narrow in a loop
const handler = <K extends PageKey>(key: K) =>
  KEYS[key] as unknown as {
    name: string;
    // written on one line, like [1, 2] or { left: "{title}" }, or with
    // each of its values on one line, like the bands of the first page
    flow?: boolean | "inner";
    read: (
      value: unknown,
      base: PageSettings[K],
    ) => PageSettings[K] | undefined;
    same: (a: PageSettings[K], b: PageSettings[K]) => boolean;
    write: (value: PageSettings[K], unit: Unit) => unknown;
  };

/**
 * keyName returns the key of a setting in the frontmatter, e.g.
 * "new-page-before" for newPageBefore
 */
export const keyName = (key: PageKey) => handler(key).name;

/**
 * sameSetting checks whether two values of a setting mean the same
 */
export const sameSetting = <K extends PageKey>(
  key: K,
  a: PageSettings[K],
  b: PageSettings[K],
) => handler(key).same(a, b);

/**
 * readPageSettings reads page settings over `base`: the keys it can't use are
 * left as in `base` and reported in `problems`, unknown keys are skipped
 * @param raw the `page` object
 * @param base the settings it overrides
 * @param problems collects the keys it can't use
 * @param prefix where `raw` is, for the problems
 */
export const readPageSettings = (
  raw: unknown,
  base: PageSettings,
  problems: string[] = [],
  prefix = "page",
): PageSettings => {
  if (raw === undefined || raw === null) return base;
  if (!isObject(raw)) {
    problems.push(prefix);
    return base;
  }
  const settings: Record<string, unknown> = { ...base };
  for (const key of PAGE_KEYS) {
    const { name, read } = handler(key);
    if (raw[name] === undefined) continue;
    const value = read(raw[name], base[key]);
    if (value === undefined) problems.push(`${prefix}.${name}`);
    else settings[key] = value;
  }
  return settings as unknown as PageSettings;
};

/**
 * pageSettingsJSON returns page settings the way blank.json holds them, with
 * lengths in `unit`: only what differs from Blank's defaults
 */
export const pageSettingsJSON = (settings: PageSettings, unit: Unit) =>
  Object.fromEntries(
    PAGE_KEYS.filter(
      (key) => !handler(key).same(settings[key], DEFAULT_PAGE[key]),
    ).map((key) => [
      handler(key).name,
      handler(key).write(settings[key], unit),
    ]),
  );

// a change that removes a key of the page setup, so the user's default
// applies; apart from null, which is a value of some settings, e.g. even
// pages without their own header and footer
export const REMOVE = Symbol("remove");

export type PageChanges = {
  [K in PageKey]?: PageSettings[K] | typeof REMOVE;
};

// a value as YAML, on one line or with its values on one line each
const yamlValue = (
  document: Document,
  value: unknown,
  flow: boolean | "inner" | undefined,
): unknown => {
  if (flow === true) return document.createNode(value, { flow: true });
  if (flow !== "inner" || typeof value !== "object" || value === null) {
    return value;
  }
  const node: unknown = document.createNode(value);
  if (!isMap(node)) return node;
  for (const item of node.items) {
    if (isMap(item.value)) item.value.flow = true;
  }
  // an empty map, e.g. no header and footer on even pages, as {}
  if (node.items.length === 0) node.flow = true;
  return node;
};

/**
 * writePageSettings changes the `page` key of a YAML document. A key whose
 * value already means the change is left as it was written, e.g. "25mm"
 * for 2.5 cm, and an empty `page` is removed.
 * @param document the frontmatter, changed in place
 * @param changes the settings to set, or REMOVE to remove
 * @param unit the unit to write new lengths in
 * @returns whether the document changed
 */
export const writePageSettings = (
  document: Document,
  changes: PageChanges,
  unit: Unit,
): boolean => {
  const page = document.get("page");
  if (page !== undefined && !isMap(page)) return false;
  const written = readPageSettings(page?.toJSON(), DEFAULT_PAGE);
  let changed = false;

  for (const key of PAGE_KEYS) {
    const change = changes[key];
    const path = ["page", handler(key).name];
    const present = document.hasIn(path);
    if (change === undefined) continue;
    if (change === REMOVE) {
      if (present) document.deleteIn(path);
      changed ||= present;
    } else if (!present || !handler(key).same(written[key], change)) {
      const { flow, write } = handler(key);
      document.setIn(path, yamlValue(document, write(change, unit), flow));
      changed = true;
    }
  }

  const after = document.get("page");
  if (isMap(after) && after.items.length === 0) {
    document.delete("page");
    changed = true;
  }
  return changed;
};
