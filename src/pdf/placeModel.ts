import type { Rect } from "./fields";
import type { Fill, PdfField } from "./ipc";
import { fillOf, nextButton, type NextButton, type Place } from "./places";
import type { Stamp } from "./stampModel";

// What the places of a PDF tab (src/pdf/places.ts) are on its pages: which
// of them are filled, what a field holds, where a stamp that fills a place
// goes, and what they're called for people. Pure; PdfView.vue shows them,
// placeActions.ts and fills.ts fill them in.

export const PLACE_DISMISSED = "Place dismissed";
export const MISSING_GLYPHS =
  "This field's font can't show some of these characters";
export const NOT_TAKEN = "This field doesn't take this value";
export const ALL_FILLED = "All places filled";

// what a place is called by its kind, where its label doesn't say it
const KIND_NAMES: Record<string, string> = {
  signature: "Signature",
  initials: "Initials",
  date: "Date",
  place: "Place",
  placeAndDate: "Place and date",
};

/**
 * isTargetPlace tells whether `place` shows as a target to fill with a
 * stamp (a found place or a signature field), rather than as a field of
 * the form one types into or ticks
 */
export const isTargetPlace = (place: Place) =>
  place.source === "found" || place.kind === "signature";

/**
 * placeName returns what `place` is called, e.g. "Signature · Tenant",
 * "Place and date" or a field's label ("Your name")
 */
export const placeName = (place: Place) => {
  const kind = KIND_NAMES[place.kind];
  if (place.source === "found")
    return place.label.startsWith(`${kind} · `) ? place.label : kind;
  if (place.kind !== "signature") return place.label;
  return place.label.toLowerCase() === "signature"
    ? kind
    : `${kind} · ${place.label}`;
};

/**
 * placeLabel names `place` for a screen reader, with its page, e.g.
 * "Signature · Tenant, page 2"
 */
export const placeLabel = (place: Place) =>
  `${placeName(place)}, page ${place.page + 1}`;

/**
 * placeElementId returns the id of the element that shows `place`
 */
export const placeElementId = (id: string) => `place-${encodeURIComponent(id)}`;

/**
 * fieldValue returns what `field` holds: its fill, else what the PDF says
 */
export const fieldValue = (
  field: PdfField,
  fills: readonly Fill[],
): string | boolean => {
  const fill = fills.find((one) => one.field === field.name);
  if (fill) return fill.value;
  if (field.kind === "checkbox") return field.value !== "Off" && !!field.value;
  return field.value;
};

/**
 * isFilled tells whether `place` is filled: a stamp fills it, or the field
 * holds a value (a checkbox ticked, a radio button chosen, some text)
 */
export const isFilled = (
  place: Place,
  stamps: readonly Stamp[],
  fills: readonly Fill[],
) => {
  if (stamps.some((stamp) => stamp.place === place.id)) return true;
  if (place.source === "found" || place.kind === "signature") return false;
  const value = fieldValue(place.field, fills);
  if (typeof value === "boolean") return value;
  return value.trim() !== "" && value !== "Off";
};

/**
 * filledOf returns the ids of the places of `places` that are filled
 */
export const filledOf = (
  places: readonly Place[],
  stamps: readonly Stamp[],
  fills: readonly Fill[],
): ReadonlySet<string> =>
  new Set(
    places
      .filter((place) => isFilled(place, stamps, fills))
      .map((place) => place.id),
  );

/**
 * nextOf returns the Next button of the places, going on from the place
 * `from` had the focus last
 */
export const nextOf = (
  places: readonly Place[],
  filled: ReadonlySet<string>,
  from: string | null,
): NextButton => nextButton(places, filled, from ?? undefined);

/**
 * nextMessage says where Next went and how to fill it in, e.g.
 * "Signature on page 3. Press Enter to fill it in."
 */
export const nextMessage = (place: Place) => {
  const how =
    fillOf(place).action === "text"
      ? "Type to fill it in."
      : "Press Enter to fill it in.";
  return `${placeName(place)} on page ${place.page + 1}. ${how}`;
};

/**
 * fitMark returns where a signature or initials `size` points large goes in
 * the place `target`: as large as fits with its shape kept, centred across,
 * and standing on the line of a found place (`bottom`) or centred in a
 * field
 */
export const fitMark = (
  size: readonly [number, number],
  target: Rect,
  bottom: boolean,
): Rect => {
  const [w, h] = size;
  const [x, y, tw, th] = target;
  const scale = w > 0 && h > 0 ? Math.min(tw / w, th / h) : 1;
  const width = w * scale;
  const height = h * scale;
  return [
    x + (tw - width) / 2,
    bottom ? y + th - height : y + (th - height) / 2,
    width,
    height,
  ];
};

// the room left of a date or place written on a line, in points
const INSET = 2;

/**
 * fitLines returns where a date or place `size` points large goes on the
 * found place `target`: at its left, standing on its line, made smaller
 * with its shape kept when it doesn't fit
 */
export const fitLines = (
  size: readonly [number, number],
  target: Rect,
): Rect => {
  const [w, h] = size;
  const [x, y, tw, th] = target;
  const scale = w > 0 && h > 0 ? Math.min(1, (tw - INSET) / w, th / h) : 1;
  return [x + INSET, y + th - h * scale, w * scale, h * scale];
};

/**
 * choiceText returns what a combo or list box shows: the option it holds,
 * or "Choose…" for none
 */
export const choiceText = (value: string | boolean) =>
  typeof value === "string" && value.trim() ? value : "Choose…";
