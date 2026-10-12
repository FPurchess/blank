import type { Command } from "prosemirror-state";
import { nextTick } from "vue";

import { config } from "../config";
import { openSignatureDialog, todayText } from "../editor/commands/signing";
import { logWarning } from "../log";
import {
  activeTab,
  activeTabId,
  announce,
  isPdfTab,
  lastPlace,
  selectedStamp,
  shownPdf,
  signingCertificate,
  signingPlace,
} from "../state";
import { PDF_VIEW_ID } from "./placeholder";
import {
  fitLines,
  fitMark,
  nextMessage,
  PLACE_DISMISSED,
  placeElementId,
} from "./placeModel";
import {
  ALL_FILLED,
  dismissPlace,
  fillOf,
  type Place,
  type Prefill,
} from "./places";
import { shownContext, shownNext, shownPlaces } from "./placesRead";
import {
  focusStamp,
  knownPlace,
  newStamp,
  placedMessage,
} from "./stampActions";
import { changeSheet, changeStamps, dismissedOf, stampsOf } from "./stampBooks";
import { STAMPS_NEED_LAYOUT } from "./stamps";
import { type Stamp, type StampKind, withStamp } from "./stampModel";
import { placeRefusal } from "./toolRules";

// What the places of the PDF shown do when the user fills them: a stamp
// sized into a signature place or a found line, a text field prefilled,
// dismissing a found place, and Next.

/**
 * prefillText returns what a text field asking for `prefill` starts with:
 * the user's name, today's date, where they sign, or both
 */
export const prefillText = (prefill: Prefill | undefined) => {
  switch (prefill) {
    case "name":
      return config.value.signing.name || signingCertificate.value?.name || "";
    case "date":
      return todayText();
    case "place":
      return signingPlace.value.trim();
    case "placeAndDate":
      return [signingPlace.value.trim(), todayText()]
        .filter(Boolean)
        .join(", ");
    default:
      return "";
  }
};

/**
 * focusPlace gives the place `id` the focus once it shows, scrolled into
 * the middle of the view
 * @returns whether it shows
 */
export const focusPlace = async (id: string) => {
  await nextTick();
  const element = document.getElementById(placeElementId(id));
  if (!element) return false;
  element.focus({ preventScroll: true });
  element.scrollIntoView?.({ block: "center", inline: "nearest" });
  return true;
};

const focusPages = () => document.getElementById(PDF_VIEW_ID)?.focus();

/**
 * stampFor makes the stamp that fills `place` with `kind`, sized into it;
 * null when the user has no signature or initials yet, or cancelled the
 * question where they sign
 */
const stampFor = async (
  place: Place,
  stamp: "signature" | "initials" | "date" | "place" | "placeAndDate",
  refocus: () => void,
): Promise<Stamp | null> => {
  const kind: StampKind = stamp === "placeAndDate" ? "place" : stamp;
  if (kind === "place" && !(await knownPlace(refocus))) return null;
  const line =
    stamp === "placeAndDate"
      ? `${signingPlace.value.trim()}, ${todayText()}`
      : undefined;
  const made = await newStamp(kind, line);
  if (!made) return null;
  const mark = kind === "signature" || kind === "initials";
  const rect = mark
    ? fitMark(made.natural, place.rect, place.source === "found")
    : fitLines(made.natural, place.rect);
  return {
    ...made,
    // a signature or initials fitted in is its own size; a date or place
    // keeps the size of its letters, so it shrinks only so far
    natural: mark ? [rect[2], rect[3]] : made.natural,
    page: place.page,
    rect,
    place: place.id,
  };
};

/**
 * fillPlace fills the place `place` of the PDF shown with its stamp:
 * the signature (made first if there's none yet) or initials, sized into
 * it, or the date, the place or both on its line; the stamp is selected and
 * takes the focus. `refocus` gives the focus back after a dialog.
 * @returns the stamp placed, or null
 */
export const fillPlace = async (
  place: Place,
  refocus: () => void,
): Promise<Stamp | null> => {
  const fill = fillOf(place);
  if (fill.action !== "stamp") {
    await focusPlace(place.id);
    return null;
  }
  const tab = activeTabId.value;
  const opened = shownPdf.value?.opened;
  if (!tab || !opened) return null;
  const kind = fill.stamp === "placeAndDate" ? "place" : fill.stamp;
  const refusal = placeRefusal(place, shownContext());
  if (refusal) {
    announce(refusal);
    return null;
  }
  let stamp;
  try {
    stamp = await stampFor(place, fill.stamp, refocus);
  } catch (error) {
    logWarning("failed to make a stamp", error);
    announce(STAMPS_NEED_LAYOUT);
    return null;
  }
  if (!stamp) {
    if (kind === "signature" || kind === "initials")
      // made first, then filled in
      void openSignatureDialog(kind, refocus, () => {
        if (activeTabId.value === tab) void fillPlace(place, refocus);
      });
    return null;
  }
  // the tab changed while it was made, or the place was filled meanwhile
  if (
    activeTabId.value !== tab ||
    shownPdf.value?.opened !== opened ||
    stampsOf(tab).some((one) => one.place === place.id)
  )
    return null;
  changeStamps(tab, withStamp(stampsOf(tab), stamp), {
    sha256: opened.sha256,
  });
  selectedStamp.value = stamp.id;
  announce(placedMessage(stamp));
  await focusStamp(stamp.id);
  return stamp;
};

/**
 * dismissShownPlace dismisses the found place `place` of the PDF shown, as
 * one step of its history: it no longer shows, nor counts in Next. Fields
 * can't be dismissed.
 * @returns whether it was dismissed
 */
export const dismissShownPlace = (place: Place) => {
  const tab = activeTabId.value;
  if (!tab || place.source !== "found") return false;
  const before = dismissedOf(tab);
  const dismissed = dismissPlace(new Set(before), place);
  changeSheet(
    tab,
    { dismissed: [...dismissed] },
    { sha256: shownPdf.value?.opened?.sha256 },
  );
  // Blank signs the PDF meanwhile
  if (dismissedOf(tab) === before) return false;
  if (lastPlace.value === place.id) lastPlace.value = null;
  announce(PLACE_DISMISSED);
  void nextTick(focusPages);
  return true;
};

/**
 * goNext focuses the next place of the PDF shown that isn't filled, in
 * reading order from the one focused last, and says what it is
 * @returns whether there was one
 */
export const goNext = async () => {
  const place = shownNext.value.place;
  if (!place) {
    announce(
      shownPlaces.value.length
        ? ALL_FILLED
        : "This PDF has no places to fill in",
    );
    return false;
  }
  lastPlace.value = place.id;
  await focusPlace(place.id);
  announce(nextMessage(place));
  return true;
};

export const NEXT_IN_PDF =
  "Next goes to the places to fill in of a PDF you received. Open one first.";

/**
 * nextShownPlace is `pdf.next`: it goes to the next place of the PDF shown
 * that isn't filled; asked whether it can, it can while there is one
 */
export const nextShownPlace = (): Command => (_state, dispatch) => {
  const inPdf = isPdfTab(activeTab.value);
  if (!dispatch) return inPdf && !shownNext.value.disabled;
  if (!inPdf) announce(NEXT_IN_PDF);
  else void goNext();
  return true;
};
