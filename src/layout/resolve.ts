import { readFrontmatter } from "../markdown";
import { localePaper, matchPaper, type PaperName, systemLocale } from "./paper";
import {
  type Margins,
  type Orientation,
  type PageSettings,
  readPageSettings,
  sameLevels,
  sameMargins,
  sameSize,
  sizeOf,
} from "./settings";
import { parseLength } from "./units";

// The page a document is laid out on: its frontmatter over the user's
// defaults in blank.json, over Blank's.

export interface Layout {
  paper: {
    // "custom" for a size that is none of PAPER
    name: PaperName | "custom";
    // the paper of the user's region, since the document doesn't pick one
    auto: boolean;
    // portrait, in points
    width: number;
    height: number;
  };
  orientation: Orientation;
  // in points
  margins: Margins;
  // the levels of the headings that start a new page
  newPageBefore: number[];
}

export interface ResolvedLayout {
  layout: Layout;
  // the settings the layout follows, with "auto" as the document has it
  settings: PageSettings;
  // the keys that couldn't be used, e.g. "page.size"
  problems: string[];
}

// the least room margins must leave for the text, both ways
const MIN_CONTENT = parseLength("2.5cm") as number;

/**
 * layoutOf turns page settings into the page they describe
 * @param settings the settings
 * @param locale the locale whose paper "auto" is
 */
export const layoutOf = (
  settings: PageSettings,
  locale = systemLocale(),
): Layout => {
  const { size } = settings;
  const own = localePaper(locale);
  const { width, height } = sizeOf(size, own);
  let name: Layout["paper"]["name"];
  if (size === "auto") name = own;
  else if (typeof size === "string") name = size;
  else name = matchPaper(width, height) ?? "custom";
  return {
    paper: { name, auto: size === "auto", width, height },
    orientation: settings.orientation,
    margins: settings.margins,
    newPageBefore: settings.newPageBefore,
  };
};

/**
 * pageGeometry returns the size of the page as it is printed, and of the
 * room it leaves for the text, in points
 */
export const pageGeometry = ({ paper, orientation, margins }: Layout) => {
  const landscape = orientation === "landscape";
  const width = landscape ? paper.height : paper.width;
  const height = landscape ? paper.width : paper.height;
  return {
    width,
    height,
    margins,
    contentWidth: width - margins.left - margins.right,
    contentHeight: height - margins.top - margins.bottom,
  };
};

/**
 * leavesRoom checks that the margins leave room for the text, which e.g.
 * 7 cm on each side of A5 doesn't
 */
export const leavesRoom = (layout: Layout) => {
  const { contentWidth, contentHeight } = pageGeometry(layout);
  return Math.min(contentWidth, contentHeight) >= MIN_CONTENT;
};

/**
 * differences returns the settings in which two page setups print
 * differently: paper by its size, since "auto" is A4 in Germany
 * @param locale the locale whose paper "auto" is
 */
export const differences = (
  a: PageSettings,
  b: PageSettings,
  locale = systemLocale(),
): (keyof PageSettings)[] => {
  const [paperA, paperB] = [
    layoutOf(a, locale).paper,
    layoutOf(b, locale).paper,
  ];
  return [
    ...(sameSize(paperA, paperB) ? [] : ["size" as const]),
    ...(a.orientation === b.orientation ? [] : ["orientation" as const]),
    ...(sameMargins(a.margins, b.margins) ? [] : ["margins" as const]),
    ...(sameLevels(a.newPageBefore, b.newPageBefore)
      ? []
      : ["newPageBefore" as const]),
  ];
};

/**
 * resolveLayout reads the page a document is laid out on
 * @param frontmatter the document's frontmatter
 * @param defaults the user's defaults, see config.ts
 * @param locale the locale whose paper "auto" is
 */
export const resolveLayout = (
  frontmatter: string | null,
  defaults: PageSettings,
  locale = systemLocale(),
): ResolvedLayout => {
  const problems: string[] = [];
  const data = readFrontmatter(frontmatter);
  if (data === undefined) problems.push("frontmatter");
  let settings = readPageSettings(data?.page, defaults, problems);
  if (!leavesRoom(layoutOf(settings, locale))) {
    problems.push("page.margins");
    settings = { ...settings, margins: defaults.margins };
  }
  return { layout: layoutOf(settings, locale), settings, problems };
};
