import { PAPER } from "./paper";
import type { Layout } from "./resolve";
import {
  DEFAULT_PAGE,
  NEW_PAGE_BEFORE,
  type PaperSize,
  readPageSettings,
  SIDES,
} from "./settings";
import { paperUnit, sameLength, toUnit, type Unit } from "./units";

// How the page setup is put in words for the user.

// a length with its unit, e.g. "2.5 cm"
const length = (points: number, unit: Unit) =>
  `${toUnit(points, unit)} ${unit}`;

/**
 * paperName names paper: "A4", or "170 × 240 mm" for a custom size, which is
 * measured in millimetres or inches
 */
export const paperName = (
  size: Exclude<PaperSize, "auto">,
  unit: Unit,
): string => {
  if (typeof size === "string") return PAPER[size].label;
  const sizeUnit = paperUnit(unit);
  return `${toUnit(size.width, sizeUnit)} × ${length(size.height, sizeUnit)}`;
};

// the name of the paper of a layout
const layoutPaper = ({ paper }: Layout, unit: Unit) =>
  paperName(
    paper.name === "custom"
      ? { width: paper.width, height: paper.height }
      : paper.name,
    unit,
  );

/**
 * describePaper names the paper of a layout, e.g. "A4", "Letter landscape" or
 * "170 × 240 mm"
 */
export const describePaper = (layout: Layout, unit: Unit = "cm") => {
  const paper = layoutPaper(layout, unit);
  return layout.orientation === "landscape" ? `${paper} landscape` : paper;
};

/**
 * describePageSize names the paper of a layout with its orientation, e.g.
 * "A4 (portrait)", for the button in the bottom bar
 */
export const describePageSize = (layout: Layout, unit: Unit) =>
  `${layoutPaper(layout, unit)} (${layout.orientation})`;

/**
 * describePage sums up the page settings a frontmatter holds, for the line
 * above the text: e.g. "A5 landscape · margins 2 cm"
 * @param raw the `page` key of the frontmatter
 * @returns the summary, or null if it holds nothing Blank uses
 */
export const describePage = (raw: unknown, unit: Unit): string | null => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const settings = readPageSettings(raw, DEFAULT_PAGE);
  const has = (key: string) => Object.hasOwn(raw, key);

  const paper =
    has("size") && settings.size !== "auto"
      ? paperName(settings.size, unit)
      : null;
  const orientation = has("orientation") ? settings.orientation : null;
  const parts = [[paper, orientation].filter(Boolean).join(" ")];
  if (has("margins")) {
    const { margins } = settings;
    parts.push(
      SIDES.every((side) => sameLength(margins[side], margins.top))
        ? `margins ${length(margins.top, unit)}`
        : "custom margins",
    );
  }
  if (has(NEW_PAGE_BEFORE))
    parts.push(describeNewPages(settings.newPageBefore) ?? "");
  const summary = parts.filter(Boolean).join(" · ");
  return summary || null;
};

/**
 * headingLevels names heading levels: "headings 1", "headings 1 and 2",
 * "headings 1, 2 and 3"
 */
const headingLevels = (levels: number[]) => {
  const last = levels[levels.length - 1];
  const list =
    levels.length > 1 ? `${levels.slice(0, -1).join(", ")} and ${last}` : last;
  return `headings ${list}`;
};

/**
 * describeNewPages says which headings start a new page, e.g. "chapters on
 * new pages" for the headings of level 1
 * @returns the description, or null for none
 */
export const describeNewPages = (levels: number[]): string | null => {
  if (levels.length === 0) return null;
  return `${levels.length === 1 && levels[0] === 1 ? "chapters" : headingLevels(levels)} on new pages`;
};

// what the problems of resolveLayout mean to the user
const PROBLEMS: Record<string, string> = {
  frontmatter: "the properties at the top of the file can't be read",
  page: "its page setup can't be read",
  "page.size": "its paper size is unknown",
  "page.orientation": "its orientation is neither portrait nor landscape",
  "page.margins": "its margins can't be used",
  [`page.${NEW_PAGE_BEFORE}`]: "the headings to start new pages are unknown",
};

/**
 * layoutWarnings explains the problems of resolveLayout, e.g. for the
 * notification after an export
 */
export const layoutWarnings = (problems: string[]) =>
  problems.length
    ? [
        `Blank used the default page setup where ${problems
          .map((problem) => PROBLEMS[problem] ?? problem)
          .join(", ")}`,
      ]
    : [];
