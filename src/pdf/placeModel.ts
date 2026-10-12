import type { Fill, PdfField, PdfRect as Rect } from "./ipc";
import { fillOf, type Place, type PlaceFill } from "./places";
import type { Stamp } from "./stampModel";

// What the places of a PDF tab (src/pdf/places.ts) are on its pages: which
// of them are filled, what a field holds, where a stamp that fills a place
// goes, and what they're called for people. Pure; PdfView.vue shows them,
// placeActions.ts and fills.ts fill them in.

export const PLACE_DISMISSED = "Place dismissed";
export const MISSING_GLYPHS =
  "This field's font can't show some of these characters";
export const NOT_TAKEN = "This field doesn't take this value";

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

// how to fill in a place, by what filling it does
const HOW: Record<PlaceFill["action"], string> = {
  stamp: "Press Enter to fill it in.",
  text: "Type to fill it in.",
  toggle: "Press Space to check it.",
  choose: "Press Space to choose.",
};

/**
 * nextMessage says where Next went and how to fill it in, e.g.
 * "Signature on page 3. Press Enter to fill it in."
 */
export const nextMessage = (place: Place) =>
  `${placeName(place)} on page ${place.page + 1}. ${HOW[fillOf(place).action]}`;

// the least height of a signature or initials standing on a found line, in
// points, so it isn't as small as the line's label: a line's place is about
// as tall as its label's letters
export const MARK_ON_LINE = { signature: 36, initials: 24 } as const;
// the smallest letters a date or place is written on a line with, in points
export const LEAST_LETTERS = 9;

/**
 * fitMark returns where a signature or initials `size` points large goes in
 * the place `target`: as large as fits with its shape kept, centred across,
 * and standing on the line of a found place (`onLine`), at least `least`
 * points tall there while it fits the line's width (rising above the
 * place), or centred in a field
 */
export const fitMark = (
  size: readonly [number, number],
  target: Rect,
  onLine: boolean,
  least = 0,
): Rect => {
  const [w, h] = size;
  const [x, y, tw, th] = target;
  const room = onLine ? Math.max(th, least) : th;
  const scale = w > 0 && h > 0 ? Math.min(tw / w, room / h) : 1;
  const width = w * scale;
  const height = h * scale;
  return [
    x + (tw - width) / 2,
    onLine ? y + th - height : y + (th - height) / 2,
    width,
    height,
  ];
};

/**
 * staysOn tells whether a stamp at `rect` still fills the place at `target`
 * (both on one page): its middle is within it, or, for a stamp taller than
 * it that stands on its line, within the room it rises to above it
 */
export const staysOn = (rect: Rect, target: Rect) => {
  const x = rect[0] + rect[2] / 2;
  const y = rect[1] + rect[3] / 2;
  const top = Math.min(target[1], target[1] + target[3] - rect[3]);
  return (
    x >= target[0] &&
    x <= target[0] + target[2] &&
    y >= top &&
    y <= target[1] + target[3]
  );
};

// the room left of a date or place written on a line, in points
const INSET = 2;

/**
 * lettersOn returns the size of the letters a date or place is written
 * with on the found place `place`: its label's, at least LEAST_LETTERS;
 * undefined for a place that doesn't say (the stamp's own size)
 */
export const lettersOn = (place: Place) =>
  place.source === "found" && place.size
    ? Math.max(LEAST_LETTERS, place.size)
    : undefined;

/**
 * fitLines returns where a date or place `size` points large goes on the
 * found place `target`: at its left, standing on its line (rising above
 * the place if its letters are taller), made smaller with its shape kept
 * when it's wider than the line
 */
export const fitLines = (
  size: readonly [number, number],
  target: Rect,
): Rect => {
  const [w, h] = size;
  const [x, y, tw, th] = target;
  const scale = w > 0 && h > 0 ? Math.min(1, (tw - INSET) / w) : 1;
  return [x + INSET, y + th - h * scale, w * scale, h * scale];
};

/**
 * choiceText returns what a combo or list box shows: the option it holds,
 * or "Choose…" for none
 */
export const choiceText = (value: string | boolean) =>
  typeof value === "string" && value.trim() ? value : "Choose…";
