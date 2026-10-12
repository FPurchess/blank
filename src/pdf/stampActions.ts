import { nextTick } from "vue";

import { openSignatureDialog, todayText } from "../editor/commands/signing";
import { logWarning } from "../log";
import { loadMarks } from "../signing/marks";
import {
  activeTabId,
  announce,
  pdfDeskLayout,
  pdfPageInView,
  pdfViewport,
  placeDialog,
  placingStamp,
  savedMarks,
  selectedStamp,
  shownPdf,
  signingPlace,
} from "../state";
import { PDF_VIEW_ID } from "./placeholder";
import { placeElementId, staysOn } from "./placeModel";
import { shownPlaces } from "./placesRead";
import { changeStamps, stampsOf } from "./stampBooks";
import { naturalSize } from "./stampEngine";
import { STAMPS_NEED_LAYOUT } from "./stamps";
import {
  defaultSpot,
  markSize,
  type Shown,
  type Stamp,
  STAMP_NAMES,
  type StampKind,
  stampSpec,
  spotAt,
  toggleRepeat,
  withoutStamp,
  withStamp,
} from "./stampModel";

// What the signing tools and the keys do with the stamps of the PDF shown:
// make a stamp of a kind (the user's signature first, if they have none),
// place it at its default spot or where the page was clicked, select it,
// remove it, and say so. The shown tab's stamps go through stampBooks.ts.

export const PLACING_CANCELED = "Placing canceled";

/**
 * placedMessage says that `stamp` was placed, and how to move it
 */
export const placedMessage = (stamp: Stamp) =>
  `${STAMP_NAMES[stamp.kind]} placed on page ${stamp.page + 1}, use the arrow keys to move it`;

/**
 * removedMessage says that `stamp` was removed
 */
export const removedMessage = (stamp: Stamp) =>
  `${STAMP_NAMES[stamp.kind]} removed`;

/**
 * lineOf returns the line a date or place stamp shows: today's date as the
 * settings write it, in the language, or where the user signs
 */
const lineOf = (kind: "date" | "place") =>
  kind === "date" ? todayText() : signingPlace.value.trim();

/**
 * askPlace asks where the user signs, and remembers it (`signingPlace`);
 * `refocus` gives the focus back once the question closes
 * @returns the place, or null when the user cancelled
 */
export const askPlace = (refocus: () => void) =>
  new Promise<string | null>((resolve) => {
    placeDialog.value = {
      place: signingPlace.value,
      submit: (place) => {
        signingPlace.value = place;
        refocus();
        resolve(place);
      },
      cancel: () => {
        refocus();
        resolve(null);
      },
    };
  });

/**
 * knownPlace returns where the user signs, asking first when Blank doesn't
 * know it yet
 * @returns the place, or null when the user cancelled
 */
export const knownPlace = async (refocus: () => void) =>
  signingPlace.value.trim() || (await askPlace(refocus));

/**
 * newStamp makes a stamp of `kind`, not yet placed: its look and its
 * natural size; null for a signature or initials the user has none of yet
 * @param line what a date or place stamp shows, if not the date or place
 * @throws when the layout can't size its lines
 */
export const newStamp = async (
  kind: StampKind,
  line?: string,
): Promise<Omit<Stamp, "page" | "rect"> | null> => {
  const id = crypto.randomUUID();
  if (kind === "signature" || kind === "initials") {
    await loadMarks();
    const mark = savedMarks.value?.[kind];
    if (!mark) return null;
    return {
      id,
      kind,
      spec: stampSpec(kind),
      natural: markSize(kind, mark.width, mark.height),
    };
  }
  const spec = stampSpec(kind, line ?? lineOf(kind));
  const { width, height } = await naturalSize(spec);
  return { id, kind, spec, natural: [width, height] };
};

/**
 * shownPart returns the part of the page `page` of the PDF shown that shows
 * in the view, in points from its top
 */
const shownPart = (page: number): Shown => {
  const layout = pdfDeskLayout.value;
  const frame = layout?.frames[page];
  const viewport = pdfViewport.value;
  const height = shownPdf.value?.opened?.pages[page]?.height ?? 0;
  if (!layout || !frame || !viewport) return { top: 0, height };
  const top = Math.max(0, (viewport.scrollTop - frame.top) / layout.scale);
  const bottom = Math.min(
    height,
    (viewport.scrollTop + viewport.height - frame.top) / layout.scale,
  );
  return bottom > top ? { top, height: bottom - top } : { top: 0, height };
};

/**
 * focusStamp gives the stamp `id` the focus once it shows, so the arrows
 * move it, and scrolls it into view: at a zoom wider than the view, its spot
 * may be beside what shows
 */
export const focusStamp = async (id: string) => {
  await nextTick();
  const element = document.getElementById(`stamp-${id}`);
  if (!element) return;
  element.focus({ preventScroll: true });
  element.scrollIntoView?.({ block: "nearest", inline: "nearest" });
};

// where a stamp goes: its default spot on the page in view, or centred on a
// point of a page (display points)
export type Where = { page: number; x: number; y: number } | null;

/**
 * placeStamp places a new stamp of `kind` on the PDF shown, at `where`,
 * selects it, gives it the focus and says so. The user's signature or initials are made first
 * if there are none yet (`refocus` gives the focus back once the dialog
 * closes).
 * @returns the stamp placed, or null
 */
export const placeStamp = async (
  kind: StampKind,
  where: Where,
  refocus: () => void,
): Promise<Stamp | null> => {
  const tab = activeTabId.value;
  const opened = shownPdf.value?.opened;
  if (!tab || !opened) return null;
  // where the user signs, asked for the first time
  if (kind === "place" && !(await knownPlace(refocus))) return null;
  let made;
  try {
    made = await newStamp(kind);
  } catch (error) {
    logWarning("failed to make a stamp", error);
    announce(STAMPS_NEED_LAYOUT);
    return null;
  }
  if (!made) {
    const mark = kind as "signature" | "initials";
    // made first, then placed
    void openSignatureDialog(mark, refocus, () => {
      if (activeTabId.value === tab) void placeStamp(kind, where, refocus);
    });
    return null;
  }
  // the tab changed while it was made
  if (activeTabId.value !== tab || shownPdf.value?.opened !== opened)
    return null;
  const sizes = opened.pages;
  const at = where
    ? {
        page: where.page,
        rect: spotAt(made.natural, where.x, where.y, sizes[where.page]),
      }
    : defaultSpot(
        kind,
        made.natural,
        Math.min(pdfPageInView.value ?? 0, sizes.length - 1),
        sizes,
        shownPart(pdfPageInView.value ?? 0),
        stampsOf(tab),
      );
  const stamp: Stamp = { ...made, ...at };
  changeStamps(tab, withStamp(stampsOf(tab), stamp), {
    sha256: opened.sha256,
  });
  selectedStamp.value = stamp.id;
  announce(placedMessage(stamp));
  // also after a dialog that made the signature first, whose `refocus`
  // gave the focus back to the tool
  void focusStamp(stamp.id);
  return stamp;
};

/**
 * focusFreed gives the focus, once the DOM shows a stamp gone, to the place
 * `place` it filled, which shows again, else to the pages
 */
export const focusFreed = (place: string | undefined) =>
  void nextTick(() =>
    (
      (place && document.getElementById(placeElementId(place))) ||
      document.getElementById(PDF_VIEW_ID)
    )?.focus(),
  );

/**
 * removeStamp removes the stamp `id` of the PDF shown and says so; the
 * place it filled, if it filled one, shows again
 * @returns the stamp removed, or null when there was none to remove
 */
export const removeStamp = (id: string): Stamp | null => {
  const tab = activeTabId.value;
  if (!tab) return null;
  const stamps = stampsOf(tab);
  const stamp = stamps.find((one) => one.id === id);
  if (!stamp) return null;
  changeStamps(tab, withoutStamp(stamps, id));
  // Blank signs the PDF meanwhile
  if (stampsOf(tab) === stamps) return null;
  if (selectedStamp.value === id) selectedStamp.value = null;
  announce(removedMessage(stamp));
  return stamp;
};

/**
 * repeatStamp puts the initials `id` of the PDF shown on every page, or
 * back on their own page only, and says so
 */
export const repeatStamp = (id: string) => {
  const tab = activeTabId.value;
  if (!tab) return;
  const stamps = toggleRepeat(stampsOf(tab), id);
  const stamp = stamps.find((one) => one.id === id);
  if (stamp?.kind !== "initials") return;
  changeStamps(tab, stamps);
  announce(
    stamp.repeat
      ? "Initials on every page"
      : `Initials only on page ${stamp.page + 1}`,
  );
};

/**
 * offItsPlace returns `stamp` without the place it filled once it was moved
 * or resized off it, so that place shows again; else as it is
 */
const offItsPlace = (stamp: Stamp): Stamp => {
  if (!stamp.place) return stamp;
  const place = shownPlaces.value.find((one) => one.id === stamp.place);
  if (!place || (place.page === stamp.page && staysOn(stamp.rect, place.rect)))
    return stamp;
  const { id, kind, page, rect, natural, repeat, spec } = stamp;
  return { id, kind, page, rect, natural, spec, ...(repeat ? { repeat } : {}) };
};

/**
 * updateStamp puts `stamp` in place of the one of its id on the PDF shown;
 * one moved off the place it filled leaves it
 * @param nudge when a nudge moved it, which joins the nudges of the last
 *   moment in one step
 */
export const updateStamp = (stamp: Stamp, nudge?: number) => {
  const tab = activeTabId.value;
  if (!tab) return;
  changeStamps(
    tab,
    withStamp(stampsOf(tab), offItsPlace(stamp)),
    nudge === undefined ? {} : { nudge: { id: stamp.id, at: nudge } },
  );
};

/**
 * cancelPlacing stops placing a stamp with the mouse, and says so
 */
export const cancelPlacing = () => {
  if (placingStamp.value === null) return false;
  placingStamp.value = null;
  announce(PLACING_CANCELED);
  return true;
};
