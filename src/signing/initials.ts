import { LINE_SIZE, type StampSpec } from "../pdf/stamps";
import type { PdfRect } from "../pdf/ipc";

// The user's initials on every page of what they sign: one stamp, drawn at
// the same place on each page (`repeat`), in a bottom corner.

// which bottom corner the initials go in
export type InitialsSide = "right" | "left";

// what the Sign dialog remembers of the initials: whether they go on every
// page, and where
export interface InitialsChoice {
  on: boolean;
  side: InitialsSide;
}

export const INITIALS_DEFAULT: InitialsChoice = { on: false, side: "right" };

// the stamp's box, in points, and how far it is from the page's edges: also
// where initials placed on a PDF tab from the keyboard go
export const INITIALS_BOX = { width: 56, height: 28 };
export const INITIALS_MARGIN = 36;

// the stamp: the initials alone, contained in the box, as a PDF tab's
// initials stamp shows them
export const INITIALS_STAMP: StampSpec = {
  image: "initials",
  lines: [],
  size: LINE_SIZE,
  align: "center",
};

/**
 * initialsRect returns where initials `size` points large (the stamp's box
 * unless given) go on a page of `page`'s size, in points from its top left:
 * `INITIALS_MARGIN` from the bottom and from the side chosen
 */
export const initialsRect = (
  page: { width: number; height: number },
  side: InitialsSide,
  [width, height]: readonly [number, number] = [
    INITIALS_BOX.width,
    INITIALS_BOX.height,
  ],
): PdfRect => [
  side === "right" ? page.width - INITIALS_MARGIN - width : INITIALS_MARGIN,
  page.height - INITIALS_MARGIN - height,
  width,
  height,
];

/**
 * isInitialsChoice tells whether a stored value is what the dialog
 * remembers
 */
export const isInitialsChoice = (value: unknown): value is InitialsChoice =>
  !!value &&
  typeof value === "object" &&
  typeof (value as InitialsChoice).on === "boolean" &&
  ["right", "left"].includes((value as InitialsChoice).side);
