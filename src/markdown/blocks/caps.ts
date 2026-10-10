import type { NodeType } from "prosemirror-model";

import { parseLength, POINTS_PER_PIXEL } from "../../layout/units";

// What a kind of block can do besides holding its content, which its node
// spec says: be aligned with the toolbar's align buttons (`<div align>` in
// the file, see ../alignment.ts), or take a share of the text's width (a
// diagram, an image). The commands, the settings and the exports ask the
// spec rather than naming the kinds, so a new kind only says what it can.

declare module "prosemirror-model" {
  interface NodeSpec {
    blockCaps?: BlockCaps;
    // a block that holds its source and shows what it makes of it, see
    // ./sourceBlock.ts
    sourceBlock?: boolean;
  }
}

export interface BlockCaps {
  align?: boolean;
  width?: boolean;
}

/**
 * capsOf returns what a kind of block can do
 */
export const capsOf = (type: NodeType): BlockCaps => type.spec.blockCaps ?? {};

// the widths offered: Fit (its own size, at most the text's width) and
// shares of the text's width
export const WIDTHS = ["fit", "50%", "75%", "100%"] as const;
export type WidthChoice = (typeof WIDTHS)[number];

export const WIDTH_LABELS: Record<WidthChoice, string> = {
  fit: "Fit",
  "50%": "50%",
  "75%": "75%",
  "100%": "100%",
};

// a width as the layout takes it: a share of the room, or a length
export type Width = { share: number } | { points: number };

const PERCENT = /^\s*(\d+(?:\.\d+)?)\s*%\s*$/;
const PIXELS = /^\s*(\d+(?:\.\d+)?)\s*(?:px)?\s*$/i;

/**
 * parseWidth reads a width as files write it: a share ("50%"), pixels as
 * HTML writes them ("300", "300px"), or a length ("120mm"); null for none
 * or one it can't read
 */
export const parseWidth = (value: unknown): Width | null => {
  if (typeof value !== "string" || !value.trim()) return null;
  const percent = PERCENT.exec(value);
  if (percent) {
    const share = Number(percent[1]) / 100;
    return share > 0 ? { share: Math.min(share, 1) } : null;
  }
  const pixels = PIXELS.exec(value);
  if (pixels) {
    const points = Number(pixels[1]) * POINTS_PER_PIXEL;
    return points > 0 ? { points } : null;
  }
  const points = parseLength(value);
  return points && points > 0 ? { points } : null;
};

/**
 * widthChoice returns the choice a width is among those offered: Fit for
 * none, null for one of another file (e.g. "300"), which none shows
 */
export const widthChoice = (value: unknown): WidthChoice | null => {
  if (value === null || value === undefined || value === "") return "fit";
  return (WIDTHS as readonly unknown[]).includes(value)
    ? (value as WidthChoice)
    : null;
};

/**
 * widthOf returns what a choice writes into the file: nothing for Fit
 */
export const widthOf = (choice: WidthChoice): string | null =>
  choice === "fit" ? null : choice;
