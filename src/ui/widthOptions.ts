import type { Option } from "../layout/choices";
import {
  WIDTH_LABELS,
  WIDTHS,
  widthChoice,
  widthOf,
  type WidthChoice,
} from "../markdown/blocks/caps";

// The widths a block or an image can be given (see
// src/markdown/blocks/caps.ts), as the settings of a diagram and the image
// dialog offer them.

export const WIDTH_OPTIONS: Option<string>[] = WIDTHS.map((value) => ({
  value,
  label: WIDTH_LABELS[value],
}));

// a width another app wrote, e.g. "300", which none of the options is:
// shown as none chosen, and kept until one is
const OTHER = "";

/**
 * widthChosen returns the option a width is, or OTHER
 */
export const widthChosen = (width: string | null): string =>
  widthChoice(width) ?? OTHER;

/**
 * widthWritten returns the width an option writes: the one it was if none
 * was chosen
 */
export const widthWritten = (chosen: string, was: string | null) =>
  chosen === OTHER ? was : widthOf(chosen as WidthChoice);
