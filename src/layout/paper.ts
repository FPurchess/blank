import type { Unit } from "./units";

// The paper sizes Blank knows, portrait, in points.

export const PAPER = {
  a3: { label: "A3", width: 841.89, height: 1190.55 },
  a4: { label: "A4", width: 595.28, height: 841.89 },
  a5: { label: "A5", width: 419.53, height: 595.28 },
  b5: { label: "B5", width: 498.9, height: 708.66 },
  letter: { label: "Letter", width: 612, height: 792 },
  legal: { label: "Legal", width: 612, height: 1008 },
} as const;

export type PaperName = keyof typeof PAPER;

export const PAPER_NAMES = Object.keys(PAPER) as PaperName[];

export const isPaperName = (value: unknown): value is PaperName =>
  typeof value === "string" && Object.hasOwn(PAPER, value);

// the regions that use US Letter and inches, after CLDR's paperSize and
// measurementSystem data
const LETTER_REGIONS = new Set([
  "US",
  "CA",
  "MX",
  "PH",
  "CL",
  "CO",
  "CR",
  "GT",
  "NI",
  "PA",
  "PR",
  "SV",
  "VE",
  "BZ",
]);

/**
 * systemLocale returns the locale of the system, e.g. "de-DE". The webview
 * takes it from the system's settings (LANG on Linux); jsdom, which runs the
 * tests, always says "en-US". Scripts run by Bun ask Intl.
 */
export const systemLocale = () =>
  globalThis.navigator?.language ||
  Intl.DateTimeFormat().resolvedOptions().locale;

/**
 * regionOf returns the region of a locale, e.g. "US" for "en-US" or for "en",
 * whose most likely region it is
 */
export const regionOf = (locale: string): string | undefined => {
  try {
    return new Intl.Locale(locale).maximize().region;
  } catch {
    return undefined;
  }
};

const usesLetter = (locale: string) =>
  LETTER_REGIONS.has(regionOf(locale) ?? "");

/**
 * localePaper returns the paper people use in the region of `locale`
 */
export const localePaper = (locale = systemLocale()): PaperName =>
  usesLetter(locale) ? "letter" : "a4";

/**
 * localeUnit returns the unit people measure pages in, in the region of
 * `locale`
 */
export const localeUnit = (locale = systemLocale()): Unit =>
  usesLetter(locale) ? "in" : "cm";

// Word measures in twentieths of a point, and apps round sizes differently
const TOLERANCE = 1;

/**
 * matchPaper finds the paper of a page size, in either orientation
 * @param width the width in points
 * @param height the height in points
 * @returns its name, or undefined if it is none Blank knows
 */
export const matchPaper = (
  width: number,
  height: number,
): PaperName | undefined => {
  const [short, long] = width < height ? [width, height] : [height, width];
  return PAPER_NAMES.find(
    (name) =>
      Math.abs(PAPER[name].width - short) < TOLERANCE &&
      Math.abs(PAPER[name].height - long) < TOLERANCE,
  );
};
