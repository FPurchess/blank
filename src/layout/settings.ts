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
}

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
};

/**
 * portrait returns a size with the shorter side as its width
 */
export const portrait = (width: number, height: number) => ({
  width: Math.min(width, height),
  height: Math.max(width, height),
});

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

const readMargins = (value: unknown, base: Margins): Margins | undefined => {
  const length = parseLength(value);
  if (length !== undefined) return allMargins(length);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
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
  if (typeof raw !== "object" || Array.isArray(raw)) {
    problems.push(prefix);
    return base;
  }
  const settings = { ...base };
  const { size, orientation, margins } = raw as Record<string, unknown>;
  if (size !== undefined) {
    const read = readSize(size);
    if (read === undefined) problems.push(`${prefix}.size`);
    else settings.size = read;
  }
  if (orientation !== undefined) {
    if (ORIENTATIONS.includes(orientation as Orientation)) {
      settings.orientation = orientation as Orientation;
    } else {
      problems.push(`${prefix}.orientation`);
    }
  }
  if (margins !== undefined) {
    const read = readMargins(margins, base.margins);
    if (read === undefined) problems.push(`${prefix}.margins`);
    else settings.margins = read;
  }
  return settings;
};

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

// how the settings are written into the frontmatter or blank.json
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

// per key: whether two values mean the same, and how a value is written
const KEYS = {
  size: { same: sameSize, write: writeSize },
  orientation: {
    same: (a: Orientation, b: Orientation) => a === b,
    write: (orientation: Orientation) => orientation,
  },
  margins: { same: sameMargins, write: writeMargins },
} as const;

type Key = keyof PageSettings;
const PAGE_KEYS = Object.keys(KEYS) as Key[];

// KEYS[key] for a key that TypeScript can't narrow in a loop
const handler = <K extends Key>(key: K) =>
  KEYS[key] as unknown as {
    same: (a: PageSettings[K], b: PageSettings[K]) => boolean;
    write: (value: PageSettings[K], unit: Unit) => unknown;
  };

/**
 * pageSettingsJSON returns page settings the way blank.json and the
 * frontmatter hold them, with lengths in `unit`
 */
export const pageSettingsJSON = (settings: PageSettings, unit: Unit) =>
  Object.fromEntries(
    PAGE_KEYS.map((key) => [key, handler(key).write(settings[key], unit)]),
  );

export type PageChanges = {
  // null removes the key, so the default applies
  [K in Key]?: PageSettings[K] | null;
};

/**
 * writePageSettings changes the `page` key of a YAML document. A key whose
 * value already means the change is left as it was written, e.g. "25mm"
 * for 2.5 cm, and an empty `page` is removed.
 * @param document the frontmatter, changed in place
 * @param changes the settings to set, or null to remove
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
    const present = document.hasIn(["page", key]);
    if (change === undefined) continue;
    if (change === null) {
      if (present) document.deleteIn(["page", key]);
      changed ||= present;
    } else if (!present || !handler(key).same(written[key], change)) {
      document.setIn(["page", key], handler(key).write(change, unit));
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
