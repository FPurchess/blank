import { marginsPresetOf, MARGIN_OPTIONS } from "../layout/choices";
import { describePaper } from "../layout/describe";
import type { Layout } from "../layout/resolve";
import type { Unit } from "../layout/units";
import type { PrintSheet } from "../engine/types";
import type { PerSheet, Scale } from "./sheets";

// What the print dialog chooses and says, without the DOM: the pages to
// print, the settings it remembers, and its words.

export type Destination = "printer" | "pdf";
export type PageChoice = "all" | "current" | "custom";

// what the dialog remembers between prints; copies and pages start over
export interface PrintSettings {
  destination: Destination;
  perSheet: PerSheet;
  scale: Scale;
  // whether "More settings" is open
  more: boolean;
}

export const PRINT_DEFAULTS: PrintSettings = {
  destination: "printer",
  perSheet: 1,
  scale: "actual",
  more: false,
};

/**
 * isPrintSettings tells whether a stored value is print settings
 */
export const isPrintSettings = (value: unknown): value is PrintSettings => {
  if (typeof value !== "object" || value === null) return false;
  const { destination, perSheet, scale, more } = value as PrintSettings;
  return (
    (destination === "printer" || destination === "pdf") &&
    [1, 2, 4].includes(perSheet) &&
    (scale === "actual" || scale === "fit") &&
    typeof more === "boolean"
  );
};

// what prints, as the dialog sends it on
export interface PrintPlan {
  // the pages, by their index
  pages: number[];
  perSheet: PerSheet;
  scale: Scale;
  copies: number;
  // whether each copy prints whole before the next
  collate: boolean;
}

// the most copies the dialog asks the system for
export const MAX_COPIES = 999;

const counted = (count: number, one: string) =>
  `${count} ${count === 1 ? one : `${one}s`}`;

const EXAMPLE = "like 1-3, 5";

/**
 * parsePages reads the pages to print as typed: numbers and ranges split by
 * commas or semicolons, e.g. "1-3, 5", "4-" (to the end) or "-2". It returns
 * the pages, counted from 1, in order and each once, or what is wrong.
 */
export const parsePages = (
  text: string,
  total: number,
): { pages: number[] } | { error: string } => {
  const empty = { error: `Type the pages to print, ${EXAMPLE}.` };
  const pages = new Set<number>();
  for (const raw of text.split(/[,;]/)) {
    // spaces around a part and its dash are fine, not between two numbers
    const part = raw.trim().replace(/\s*[-–—]\s*/g, "-");
    if (!part) continue;
    const match = /^(\d*)-(\d*)$|^(\d+)$/.exec(part);
    if (!match || part === "-")
      return {
        error: `“${raw.trim()}” isn't a page or a range. Use numbers, ${EXAMPLE}.`,
      };
    const from = Number(match[3] ?? (match[1] || 1));
    const to = Number(match[3] ?? (match[2] || total));
    if (from < 1 || to < 1) return { error: "Pages start at 1." };
    if (from > to)
      return {
        error: `${from}-${to} runs backwards. Write it as ${to}-${from}.`,
      };
    const over = Math.max(from, to);
    if (over > total)
      return {
        error: `There is no page ${over}. This document has ${counted(total, "page")}.`,
      };
    for (let page = from; page <= to; page++) pages.add(page);
  }
  if (!pages.size) return empty;
  return { pages: [...pages].sort((a, b) => a - b) };
};

/**
 * chosenPages returns the pages to print, by their index, or why they
 * can't be
 * @param current the page the cursor is on, by its index
 */
export const chosenPages = (
  choice: PageChoice,
  total: number,
  current: number,
  custom: string,
): { pages: number[] } | { error: string } => {
  if (choice === "all")
    return { pages: Array.from({ length: total }, (_, page) => page) };
  if (choice === "current") return { pages: [current] };
  const parsed = parsePages(custom, total);
  return "error" in parsed
    ? parsed
    : { pages: parsed.pages.map((page) => page - 1) };
};

/**
 * effectiveLayout returns how the pages fall on the sheets: a PDF file
 * holds the pages as they are, whatever the dialog remembers for printing
 */
export const effectiveLayout = (
  destination: Destination,
  perSheet: PerSheet,
  scale: Scale,
): { perSheet: PerSheet; scale: Scale } =>
  destination === "pdf"
    ? { perSheet: 1, scale: "actual" }
    : { perSheet, scale };

/**
 * summary sums up what prints, e.g. "3 pages on 2 sheets, 2 copies"
 */
export const summary = ({
  pages,
  sheets,
  perSheet,
  copies,
  destination,
}: {
  pages: number;
  sheets: number;
  perSheet: PerSheet;
  copies: number;
  destination: Destination;
}) => {
  let text = counted(pages, "page");
  if (destination === "pdf") return text;
  if (perSheet > 1) text += ` on ${counted(sheets, "sheet")}`;
  if (copies > 1) text += `, ${copies} copies`;
  return text;
};

/**
 * sheetLabel says which sheet the preview shows: "Page 3 of 5", "Page 3
 * (2 of 3)" when only some pages print, or "Sheet 1 of 2, pages 1, 2"
 * @param all whether every page prints
 */
export const sheetLabel = ({
  sheets,
  index,
  total,
  perSheet,
  all,
}: {
  sheets: readonly PrintSheet[];
  index: number;
  total: number;
  perSheet: PerSheet;
  all: boolean;
}) => {
  const sheet = sheets[index];
  if (!sheet) return "";
  const pages = sheet.placements.map((placement) => placement.page + 1);
  if (perSheet > 1)
    return `Sheet ${index + 1} of ${sheets.length}, ${pages.length === 1 ? "page" : "pages"} ${pages.join(", ")}`;
  return all
    ? `Page ${pages[0]} of ${total}`
    : `Page ${pages[0]} (${index + 1} of ${sheets.length})`;
};

/**
 * sentMessage says that the pages went to the printer, by its name if the
 * system said it
 */
export const sentMessage = (pages: number, printer?: string | null) =>
  `Sent ${counted(pages, "page")} to ${printer || "the printer"}`;

/**
 * printPaper names the paper the document prints on, e.g. "A4, normal
 * margins" or "Letter landscape"
 */
export const printPaper = (layout: Layout, unit: Unit) => {
  const paper = describePaper(layout, unit);
  const preset = marginsPresetOf(layout.margins);
  const label = MARGIN_OPTIONS.find((option) => option.value === preset)?.label;
  return label ? `${paper}, ${label.toLowerCase()} margins` : paper;
};

// what Print says without the layout engine: the preview and the print PDF
// are the engine's pages
export const PRINT_UNAVAILABLE = "Printing needs the page layout.";
export const NOTHING_TO_PRINT =
  "Your document is empty. There is nothing to print.";
// while the last print is still on its way to the system
export const STILL_PRINTING = "Blank is still sending your last print.";
// after an error with which the job may have printed all the same
export const MAY_NOT_HAVE_PRINTED =
  "Your document may not have printed. Check the printer's queue before you print again.";

// a reason, and what to do instead: the print dialog opens again with it,
// ready to save a PDF
const instead = (reason: string) =>
  `${reason} Save a PDF and print it from another app.`;

export const NO_PRINT_SERVICE = instead(
  "Printing needs your desktop's print service.",
);
export const NO_PRINT_DIALOG = instead(
  "Windows can't show its print dialog for Blank until Microsoft Edge WebView2 is updated.",
);

/**
 * failedNote says that printing failed, with `message` as its reason
 */
export const failedNote = (message: string) =>
  instead(`Printing didn't work: ${message.replace(/\.$/, "")}.`);
