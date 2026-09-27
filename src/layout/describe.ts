import { PAPER } from "./paper";
import type { Layout } from "./resolve";
import { NEW_PAGE_BEFORE, type PaperSize } from "./settings";
import { paperUnit, toUnit, type Unit } from "./units";

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
