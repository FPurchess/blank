import { PAPER } from "./paper";
import type { Layout } from "./resolve";
import {
  DEFAULT_PAGE,
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

/**
 * describePaper names the paper of a layout, e.g. "A4", "Letter landscape" or
 * "170 × 240 mm"
 */
export const describePaper = (layout: Layout, unit: Unit = "cm") => {
  const { name, width, height } = layout.paper;
  const paper = paperName(name === "custom" ? { width, height } : name, unit);
  return layout.orientation === "landscape" ? `${paper} landscape` : paper;
};

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
  const summary = parts.filter(Boolean).join(" · ");
  return summary || null;
};

// what the problems of resolveLayout mean to the user
const PROBLEMS: Record<string, string> = {
  frontmatter: "the properties at the top of the file can't be read",
  page: "its page setup can't be read",
  "page.size": "its paper size is unknown",
  "page.orientation": "its orientation is neither portrait nor landscape",
  "page.margins": "its margins can't be used",
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
