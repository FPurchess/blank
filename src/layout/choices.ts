import { paperName } from "./describe";
import { localePaper, matchPaper, PAPER_NAMES, type PaperName } from "./paper";
import {
  differences,
  type Layout,
  layoutOf,
  leavesRoom,
  paperLeavesRoom,
} from "./resolve";
import {
  allMargins,
  type BandSettings,
  bandSettings,
  type Margins,
  type Orientation,
  type PageChanges,
  type PageSettings,
  portrait,
  sameMargins,
  SIDES,
} from "./settings";
import { paperUnit, parseLength, toUnit, type Unit } from "./units";

// What the page setup dialog offers: a few named choices per row, with the
// exact values behind "Custom…".

export const MARGIN_PRESETS = {
  narrow: parseLength("1.27cm") as number,
  normal: parseLength("2.5cm") as number,
  wide: parseLength("3.5cm") as number,
};
export type MarginPreset = keyof typeof MARGIN_PRESETS;

export interface PageChoices {
  // "auto" is the paper of the user's region
  paper: "auto" | PaperName | "custom";
  // the custom size as typed, in the paper's unit (paperUnit) unless it says
  // otherwise, and as it is turned: wider than high for landscape
  width: string;
  height: string;
  orientation: Orientation;
  margins: MarginPreset | "custom";
  // the custom margins as typed
  sides: Record<keyof Margins, string>;
  // the levels of the headings that start a new page
  newPageBefore: number[];
  // what the header and footer strips set, which the dialog keeps as it is
  bands: BandSettings;
}

// the fields of a custom size
export type CustomSize = Pick<PageChoices, "width" | "height">;

export interface Option<T> {
  value: T;
  label: string;
  // what the option shows when its label is too long for it, e.g. "H1"; the
  // label then names it for screen readers and its tooltip
  short?: string;
}

/**
 * paperOptions lists the paper to choose from: the paper of the region
 * first, the others, and a custom size
 */
export const paperOptions = (
  locale: string,
): Option<PageChoices["paper"]>[] => {
  const own = localePaper(locale);
  return [
    { value: "auto", label: `${paperName(own, "cm")} (your region)` },
    ...PAPER_NAMES.filter((name) => name !== own).map((name) => ({
      value: name,
      label: paperName(name, "cm"),
    })),
    { value: "custom", label: "Custom…" },
  ];
};

export const ORIENTATION_OPTIONS: Option<Orientation>[] = [
  { value: "portrait", label: "Portrait" },
  { value: "landscape", label: "Landscape" },
];

export const MARGIN_OPTIONS: Option<PageChoices["margins"]>[] = [
  { value: "narrow", label: "Narrow" },
  { value: "normal", label: "Normal" },
  { value: "wide", label: "Wide" },
  { value: "custom", label: "Custom…" },
];

// the headings that can start a new page
export const HEADING_OPTIONS: Option<number>[] = [1, 2, 3, 4, 5, 6].map(
  (level) => ({ value: level, label: `Heading ${level}`, short: `H${level}` }),
);

/**
 * choicesOf returns what the dialog shows for page settings
 * @param settings the settings of the document
 * @param locale the locale whose paper "auto" is
 * @param unit the unit to show lengths in
 */
export const choicesOf = (
  settings: PageSettings,
  locale: string,
  unit: Unit,
): PageChoices => {
  const { paper, margins } = layoutOf(settings, locale);
  const own = localePaper(locale);
  const name =
    typeof settings.size === "string"
      ? settings.size
      : matchPaper(paper.width, paper.height);
  const preset = (Object.keys(MARGIN_PRESETS) as MarginPreset[]).find((key) =>
    sameMargins(margins, allMargins(MARGIN_PRESETS[key])),
  );
  const show = (points: number) => String(toUnit(points, unit));
  return {
    paper: name === "auto" || name === own ? "auto" : (name ?? "custom"),
    ...sizeChoices(paper, settings.orientation, unit),
    orientation: settings.orientation,
    margins: preset ?? "custom",
    sides: Object.fromEntries(
      SIDES.map((side) => [side, show(margins[side])]),
    ) as PageChoices["sides"],
    newPageBefore: settings.newPageBefore,
    bands: bandSettings(settings),
  };
};

// a length as typed: "2.5", "2,5 cm" or "1in"; a bare number is in `unit`
const lengthOf = (typed: string, unit: Unit) =>
  parseLength(typed) ?? parseLength(`${typed}${unit}`);

/**
 * sizeChoices returns the fields of a custom size for `paper`, in the
 * paper's unit and turned as `orientation` turns it
 * @param unit the unit lengths are shown in, whose paperUnit the paper's is
 */
export const sizeChoices = (
  paper: Pick<Layout["paper"], "width" | "height">,
  orientation: Orientation,
  unit: Unit,
): CustomSize => {
  const show = (points: number) => String(toUnit(points, paperUnit(unit)));
  const [short, long] = [paper.width, paper.height].sort((a, b) => a - b);
  return orientation === "landscape"
    ? { width: show(long), height: show(short) }
    : { width: show(short), height: show(long) };
};

// the typed custom size in points, or undefined while it isn't one
const typedSize = (choices: CustomSize, unit: Unit) => {
  const width = lengthOf(choices.width, paperUnit(unit));
  const height = lengthOf(choices.height, paperUnit(unit));
  return width && height ? { width, height } : undefined;
};

/**
 * typedOrientation returns how the typed custom size is turned: landscape
 * when it is wider than high, or undefined when it is square or isn't a size
 */
export const typedOrientation = (
  choices: CustomSize,
  unit: Unit,
): Orientation | undefined => {
  const size = typedSize(choices, unit);
  if (!size || size.width === size.height) return undefined;
  return size.width > size.height ? "landscape" : "portrait";
};

/**
 * turned returns the fields of the custom size for `orientation`: swapped
 * when the typed size is turned the other way
 */
export const turned = (
  choices: CustomSize,
  orientation: Orientation,
  unit: Unit,
): CustomSize => {
  const typed = typedOrientation(choices, unit);
  return typed && typed !== orientation
    ? { width: choices.height, height: choices.width }
    : { width: choices.width, height: choices.height };
};

export type ChoiceErrors = Partial<Record<"paper" | "margins", string>>;

/**
 * settingsOf returns the page settings the choices mean
 * @returns the settings, or what is wrong with the typed values
 */
export const settingsOf = (
  choices: PageChoices,
  locale: string,
  unit: Unit,
): { settings: PageSettings } | { errors: ChoiceErrors } => {
  const errors: ChoiceErrors = {};
  let size: PageSettings["size"] = "auto";
  // a custom size wider than high is landscape, though kept as portrait
  let orientation = choices.orientation;
  if (choices.paper !== "custom") {
    size = choices.paper;
  } else {
    const typed = typedSize(choices, unit);
    if (typed) {
      size = portrait(typed.width, typed.height);
      orientation = typedOrientation(choices, unit) ?? orientation;
    } else {
      errors.paper = `Enter the width and height, e.g. ${unit === "in" ? "6 and 9" : "170 and 240"}.`;
    }
  }
  let margins: Margins;
  if (choices.margins === "custom") {
    const sides = SIDES.map((side) => lengthOf(choices.sides[side], unit));
    if (sides.every((side) => side !== undefined)) {
      const [top, right, bottom, left] = sides as number[];
      margins = { top, right, bottom, left };
    } else {
      errors.margins = `Enter each margin as a length, e.g. ${unit === "in" ? "1" : "2.5"}.`;
      margins = allMargins(MARGIN_PRESETS.normal);
    }
  } else {
    margins = allMargins(MARGIN_PRESETS[choices.margins]);
  }
  const settings: PageSettings = {
    size,
    orientation,
    margins,
    newPageBefore: [...choices.newPageBefore].sort((a, b) => a - b),
    ...choices.bands,
  };
  if (!errors.paper) {
    const layout = layoutOf(settings, locale);
    if (!paperLeavesRoom(layout)) {
      errors.paper = "The paper is too small for the text.";
    } else if (!leavesRoom(layout)) {
      errors.margins = "The margins leave no room for the text.";
    }
  }
  return Object.keys(errors).length ? { errors } : { settings };
};

/**
 * changesOf returns what to write into the frontmatter for the settings the
 * user chose: only the rows they changed, and nothing for a row that is back
 * to their default, which applies anyway
 * @param before the settings the dialog opened with
 * @param after the settings chosen
 * @param defaults the user's defaults
 * @param locale the locale whose paper "auto" is
 */
export const changesOf = (
  before: PageSettings,
  after: PageSettings,
  defaults: PageSettings,
  locale: string,
): PageChanges => {
  const fromDefaults = differences(after, defaults, locale);
  return Object.fromEntries(
    differences(before, after, locale).map((key) => [
      key,
      fromDefaults.includes(key) ? after[key] : null,
    ]),
  );
};
