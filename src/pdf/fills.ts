import { logWarning } from "../log";
import {
  activeTabId,
  announce,
  fieldProblem,
  pageRevisions,
  shownPdf,
} from "../state";
import { failureOf, type Fill, type OpenedPdf, setFills } from "./ipc";
import { fieldValue, MISSING_GLYPHS, NOT_TAKEN } from "./placeModel";
import type { PdfField } from "./ipc";
import { changeSheet, fillsOf } from "./stampBooks";
import { withFill } from "./stampModel";

// The fills of a PDF tab's form: MuPDF in the tab's helper writes them
// (`setFills`, always the whole set) and draws their pages again, which
// show anew through `pageRevisions`. A fill is one step of the tab's
// history, next to its stamps; undo, redo, a restore and a helper opened
// afresh (Open again) send the set the history holds (`syncFills`).

// the set each tab's helper holds, for the PDF it opened
const sent = new Map<string, { opened: OpenedPdf; fills: readonly Fill[] }>();

const same = (a: readonly Fill[], b: readonly Fill[]) =>
  a.length === b.length &&
  a.every(
    (fill, at) => fill.field === b[at].field && fill.value === b[at].value,
  );

/**
 * redraw has the pages `pages` (from 0) of the tab `tab` drawn again
 */
const redraw = (tab: string, pages: readonly number[]) => {
  if (!pages.length) return;
  const next = new Map(pageRevisions.value);
  for (const page of pages) {
    const key = `${tab}:${page}`;
    next.set(key, (next.get(key) ?? 0) + 1);
  }
  pageRevisions.value = next;
};

/**
 * pageRevision returns how often the page `page` of the tab `tab` was
 * filled in anew, part of its bitmaps' keys
 */
export const pageRevision = (tab: string, page: number) =>
  pageRevisions.value.get(`${tab}:${page}`) ?? 0;

/**
 * commitFill fills the field `field` of the PDF shown in with `value`, as
 * one step of its history, and draws the pages it changed again. A value
 * the field's font can't show, or one it doesn't take, is refused: the
 * field says so under it, and the last set stays.
 * @returns whether the field holds `value` now
 */
export const commitFill = async (
  field: PdfField,
  value: string | boolean,
): Promise<boolean> => {
  const tab = activeTabId.value;
  const opened = shownPdf.value?.opened;
  if (!tab || !opened) return false;
  const fills = fillsOf(tab);
  if (fieldValue(field, fills) === value) {
    clearProblem(tab, field.name);
    return true;
  }
  const next = withFill(fills, { field: field.name, value });
  let pages: number[];
  try {
    pages = await setFills(tab, [...next]);
  } catch (error) {
    const failure = failureOf(error);
    if (failure === "missingGlyphs" || failure === "badRequest") {
      fieldProblem.value = {
        tab,
        field: field.name,
        text: failure === "missingGlyphs" ? MISSING_GLYPHS : NOT_TAKEN,
      };
      announce(fieldProblem.value.text);
    } else if (failure !== "closed") {
      logWarning("can't fill in a PDF's field", failure);
      announce("Blank couldn't fill in this field");
    }
    return false;
  }
  sent.set(tab, { opened, fills: next });
  changeSheet(tab, { fills: next }, { sha256: opened.sha256 });
  clearProblem(tab, field.name);
  redraw(tab, pages);
  return true;
};

const clearProblem = (tab: string, field: string) => {
  const problem = fieldProblem.value;
  if (problem?.tab === tab && problem.field === field)
    fieldProblem.value = null;
};

/**
 * syncFills sends the fills the history of the tab shown holds to its
 * helper, when they aren't the ones it holds: after undo or redo, once they
 * were restored, or to a helper opened afresh; then the pages they changed
 * are drawn again
 */
export const syncFills = async () => {
  const tab = activeTabId.value;
  const opened = shownPdf.value?.opened;
  if (!tab || !opened) return;
  const fills = fillsOf(tab);
  const was = sent.get(tab);
  if (was?.opened === opened && same(was.fills, fills)) return;
  // a helper opened afresh holds none
  const before = was?.opened === opened ? was.fills : [];
  sent.set(tab, { opened, fills });
  if (same(before, fills)) return;
  try {
    redraw(tab, await setFills(tab, [...fills]));
  } catch (error) {
    const failure = failureOf(error);
    if (failure !== "closed") logWarning("can't fill in a PDF's form", failure);
  }
};

/**
 * forgetFills forgets what the helpers of the tabs not in `open` hold
 */
export const forgetFills = (open: ReadonlySet<string>) => {
  for (const tab of sent.keys()) if (!open.has(tab)) sent.delete(tab);
};

/**
 * resetFills forgets what every helper holds, for the tests
 */
export const resetFills = () => {
  sent.clear();
  pageRevisions.value = new Map();
  fieldProblem.value = null;
};
