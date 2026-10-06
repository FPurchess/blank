import { PAPER } from "./paper";
import type { Layout } from "./resolve";
import { keyName, PAGE_KEYS, type PageKey, type PaperSize } from "./settings";
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
 * "170 × 240 mm", everywhere the paper is named: the bottom bar, the page
 * setup's picture and the export's notification
 */
export const describePaper = (layout: Layout, unit: Unit = "cm") => {
  const paper = layoutPaper(layout, unit);
  return layout.orientation === "landscape" ? `${paper} landscape` : paper;
};

// what a setting that can't be used means to the user
const SETTING_PROBLEMS: Record<PageKey, string> = {
  size: "its paper size is unknown",
  orientation: "its orientation is neither portrait nor landscape",
  margins: "its margins can't be used",
  newPageBefore: "the headings to start new pages are unknown",
  header: "its header can't be read",
  footer: "its footer can't be read",
  firstPage: "its first page's header and footer can't be read",
  evenPages: "the header and footer of its even pages can't be read",
  numberStyle: "its page numbers are neither 1, i nor I",
  startNumber: "its first page number isn't a number",
};

/**
 * unreadable says that the frontmatter can't be read, so `what` (e.g. "the
 * page setup", "the footer") can't be written into it
 */
export const unreadable = (what: string) =>
  `The properties at the top of the file can't be read, so ${what} can't be written into them.`;

// what the problems of resolveLayout mean to the user, by the key of the
// frontmatter they are about
const PROBLEMS: Record<string, string> = {
  frontmatter: "the properties at the top of the file can't be read",
  page: "its page setup can't be read",
  ...Object.fromEntries(
    PAGE_KEYS.map((key) => [`page.${keyName(key)}`, SETTING_PROBLEMS[key]]),
  ),
};

// what the room problems of resolveLayout mean, which keep the setting
const ROOM: Record<string, string> = {
  "page.header-room": "The top margin is small for the header",
  "page.footer-room": "The bottom margin is small for the footer",
};

/**
 * layoutWarnings explains the problems of resolveLayout, e.g. for the
 * notification after an export
 */
export const layoutWarnings = (problems: string[]) => {
  const replaced = problems.filter((problem) => !ROOM[problem]);
  return [
    ...(replaced.length
      ? [
          `Blank used the default page setup where ${replaced
            .map((problem) => PROBLEMS[problem] ?? problem)
            .join(", ")}`,
        ]
      : []),
    ...problems
      .filter((problem) => ROOM[problem])
      .map((problem) => ROOM[problem]),
  ];
};
