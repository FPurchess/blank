import { computed } from "vue";

import { logWarning } from "../log";
import { findLabels, type FoundPlace } from "../signing/labels";
import {
  activeTabId,
  lastPlace,
  pdfPlaces,
  shownPdf,
  shownPdfRules,
  stampBooks,
  type TabPlaces,
} from "../state";
import { failureOf, type OpenedPdf, pageText, pdfFields } from "./ipc";
import { filledOf, nextOf } from "./placeModel";
import { placesOf } from "./places";
import { dismissedOf, fillsOf, stampsOf } from "./stampBooks";

// The places of the PDF tabs: their forms' fields, read once a PDF shows,
// and the places found by their labels, page by page in the background
// (`pdfPlaces`); and those of the PDF shown in reading order, which are
// filled, and where Next goes.

// the readings under way, by tab, so a tab is read once per PDF it opened
const reading = new Map<string, OpenedPdf>();

/**
 * readPlaces reads the fields of the PDF `opened` in the tab `tab`, then
 * the words and lines of its pages one after another for the places found
 * by their labels, publishing what it has after each page. It stops once
 * the tab closes or opens another PDF. Words and values are never logged.
 */
export const readPlaces = async (tab: string, opened: OpenedPdf) => {
  const known = pdfPlaces.value.get(tab);
  if (reading.get(tab) === opened || known?.sha256 === opened.sha256) return;
  reading.set(tab, opened);
  const current = () => reading.get(tab) === opened;
  const publish = (places: TabPlaces) => {
    if (!current()) return;
    pdfPlaces.value = new Map(pdfPlaces.value).set(tab, places);
  };
  let fields: TabPlaces["fields"] = [];
  try {
    fields = await pdfFields(tab);
  } catch (error) {
    if (!current()) return;
    logWarning("can't read a PDF's fields", failureOf(error));
  }
  const found: FoundPlace[] = [];
  publish({ sha256: opened.sha256, fields, found: [] });
  for (let page = 0; page < opened.pages.length && current(); page++) {
    try {
      found.push(...findLabels(await pageText(tab, page), page));
    } catch (error) {
      const failure = failureOf(error);
      if (failure === "closed" || !current()) break;
      logWarning("can't read a PDF page's text", failure);
      continue;
    }
    publish({ sha256: opened.sha256, fields, found: [...found] });
  }
  if (current()) reading.delete(tab);
};

/**
 * forgetPlaces drops what was read of the tabs that aren't in `open` any
 * more
 */
export const forgetPlaces = (open: ReadonlySet<string>) => {
  for (const tab of reading.keys()) if (!open.has(tab)) reading.delete(tab);
  const kept = [...pdfPlaces.value].filter(([tab]) => open.has(tab));
  if (kept.length !== pdfPlaces.value.size) pdfPlaces.value = new Map(kept);
};

/**
 * resetPlaces forgets every tab's places, for the tests
 */
export const resetPlaces = () => {
  reading.clear();
  pdfPlaces.value = new Map();
  lastPlace.value = null;
};

// the places of the PDF shown, in reading order: its fields that can be
// filled (not those an earlier signature locked) and the places found that
// the user didn't dismiss, on the pages it has
export const shownPlaces = computed(() => {
  void stampBooks.value;
  const tab = activeTabId.value;
  const opened = shownPdf.value?.opened;
  const read = tab ? pdfPlaces.value.get(tab) : undefined;
  if (!tab || !opened || read?.sha256 !== opened.sha256) return [];
  const rules = shownPdfRules.value;
  const locked =
    rules?.sha256 === opened.sha256 ? rules.rules.locked : ([] as string[]);
  return placesOf({
    fields: read.fields,
    found: read.found,
    locked: new Set(locked),
    dismissed: new Set(dismissedOf(tab)),
  }).filter((place) => place.page < opened.pages.length);
});

// the ids of the places of the PDF shown that are filled
export const shownFilled = computed(() => {
  void stampBooks.value;
  const tab = activeTabId.value;
  return tab
    ? filledOf(shownPlaces.value, stampsOf(tab), fillsOf(tab))
    : new Set<string>();
});

// where Next goes in the PDF shown, and what it says
export const shownNext = computed(() =>
  nextOf(shownPlaces.value, shownFilled.value, lastPlace.value),
);
