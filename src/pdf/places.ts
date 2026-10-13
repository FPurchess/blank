import {
  type FoundPlace,
  mergeNear,
  overlap,
  type PlaceKind,
} from "../signing/labels";
import type { PdfField, PdfRect as Rect } from "./ipc";

// The places of a PDF tab: where the user signs, dates or fills it in. They
// are its form's fields that can take a value, and the places found by their
// labels (src/signing/labels.ts), which a field at the same spot wins over;
// in reading order, for Tab and "Next".

export type FieldPlaceKind =
  "text" | "checkbox" | "radio" | "combo" | "list" | "signature";

interface PlaceBase {
  // stays the same while the PDF does: what filled and dismissed places are
  // remembered by
  id: string;
  // from 0
  page: number;
  rect: Rect;
  // what it is called for people
  label: string;
}

// a field of the form
export interface FieldPlace extends PlaceBase {
  source: "field";
  kind: FieldPlaceKind;
  field: PdfField;
  // an earlier signature locked it (FieldMDP): it shows, but can't change
  locked?: true;
}

// a place found by its label
export interface LabelPlace extends PlaceBase {
  source: "found";
  kind: PlaceKind;
  // the size of its label's letters, in points
  size?: number;
}

export type Place = FieldPlace | LabelPlace;

// how far apart, in points, places count as on one line
const BAND = 4;
// how much a found place may share with a field and still count
const SHARED = 0.3;

// the prefix of the id of a place that is a field of the form
const FIELD = "field:";

/**
 * fieldPlaceId returns the id of the place of the field `name` (its full
 * name)
 */
export const fieldPlaceId = (name: string) => `${FIELD}${name}`;

/**
 * fieldOfPlace returns the full name of the field the place `id` is, or
 * null for a found place
 */
export const fieldOfPlace = (id: string | undefined) =>
  id?.startsWith(FIELD) ? id.slice(FIELD.length) : null;

/**
 * isFillable tells whether `field` is one a user fills in or signs: not a
 * push button, a read-only field or a signature field that holds a
 * signature, and it shows on a page
 */
const isFillable = (field: PdfField) =>
  field.kind !== "button" &&
  !field.flags.readOnly &&
  !(field.kind === "signature" && field.signed) &&
  field.widgets.length > 0;

/**
 * fieldLabel returns what a field is called: its `/TU`, else the last part of
 * its full name in words, e.g. "Signature" for "form.signature_1"
 */
export const fieldLabel = (field: PdfField) => {
  const told = field.label?.trim();
  if (told) return told;
  const last = field.name.split(".").pop() ?? "";
  const words = last
    .replace(/\[\d+\]/gu, "")
    .replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2")
    .replace(/[_\-\s]+/gu, " ")
    .replace(/(?:\s*\d+)+$/u, "")
    .trim()
    .toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : field.name;
};

const union = (rects: Rect[]): Rect => {
  const left = Math.min(...rects.map((rect) => rect[0]));
  const top = Math.min(...rects.map((rect) => rect[1]));
  const right = Math.max(...rects.map((rect) => rect[0] + rect[2]));
  const bottom = Math.max(...rects.map((rect) => rect[1] + rect[3]));
  return [left, top, right - left, bottom - top];
};

const iou = (a: Rect, b: Rect) => {
  const shared = overlap(a, b);
  return shared / (a[2] * a[3] + b[2] * b[3] - shared || 1);
};

/**
 * foundId returns the id of a found place, from where it is
 */
const foundId = (place: FoundPlace) =>
  `found:${place.page}:${Math.round(place.rect[0])}:${Math.round(place.rect[1])}`;

/**
 * readingOrder sorts places by page, then by line, then from left to right:
 * places whose bottoms (where text and lines stand) are within BAND points
 * of the first of a line are on that line
 */
export const readingOrder = <T extends { page: number; rect: Rect }>(
  places: readonly T[],
): T[] => {
  const bottom = (place: T) => place.rect[1] + place.rect[3];
  const sorted = [...places].sort(
    (a, b) => a.page - b.page || bottom(a) - bottom(b),
  );
  const lines: T[][] = [];
  for (const place of sorted) {
    const line = lines[lines.length - 1];
    if (
      line &&
      line[0].page === place.page &&
      bottom(place) - bottom(line[0]) <= BAND
    )
      line.push(place);
    else lines.push([place]);
  }
  return lines.flatMap((line) => line.sort((a, b) => a.rect[0] - b.rect[0]));
};

/**
 * placesOf returns the places of a PDF in reading order: the fields of
 * `fields` that can be filled in (see isFillable; those an earlier signature
 * locked, `locked`, marked so), and the places of `found` that
 * no field covers (more than SHARED of both, as intersection over union) and
 * that the user didn't dismiss; found places within 4 pt of each other are
 * one
 */
export const placesOf = ({
  fields,
  found,
  locked = new Set(),
  dismissed = new Set(),
}: {
  fields: readonly PdfField[];
  found: readonly FoundPlace[];
  locked?: ReadonlySet<string>;
  dismissed?: ReadonlySet<string>;
}): Place[] => {
  const fieldPlaces = fields.filter(isFillable).map((field): FieldPlace => {
    const page = field.widgets[0].page;
    return {
      ...(locked.has(field.name) ? { locked: true as const } : {}),
      id: fieldPlaceId(field.name),
      source: "field",
      page,
      rect: union(
        field.widgets
          .filter((widget) => widget.page === page)
          .map((widget) => widget.rect),
      ),
      label: fieldLabel(field),
      kind: field.kind as FieldPlaceKind,
      field,
    };
  });
  // every widget counts against found places, also those of fields that
  // can't be filled: a signed signature isn't a line to sign on
  const widgets = fields.flatMap((field) => field.widgets);
  const labelPlaces = mergeNear([...found])
    .filter(
      (place) =>
        !widgets.some(
          (widget) =>
            widget.page === place.page && iou(widget.rect, place.rect) > SHARED,
        ),
    )
    .map((place): LabelPlace => ({
      ...place,
      id: foundId(place),
      source: "found",
    }))
    .filter((place) => !dismissed.has(place.id));
  return readingOrder<Place>([...fieldPlaces, ...labelPlaces]);
};

/**
 * dismissPlace returns the dismissed places with `place` among them, if it is
 * a found place; fields can't be dismissed. The caller keeps the set it had
 * to undo it.
 */
export const dismissPlace = (
  dismissed: ReadonlySet<string>,
  place: Place,
): ReadonlySet<string> =>
  place.source === "found" ? new Set([...dismissed, place.id]) : dismissed;

/**
 * isOpen tells whether `place` is still to be filled in: not filled, and
 * not a field an earlier signature locked
 */
export const isOpen = (place: Place, filled: ReadonlySet<string>) =>
  !filled.has(place.id) && !(place.source === "field" && place.locked);

/**
 * nextPlace returns the first place after the one of id `from` (else from
 * the start) that is open (see isOpen), coming round to the start; none
 * when every place is filled
 */
export const nextPlace = (
  places: readonly Place[],
  filled: ReadonlySet<string>,
  from?: string,
): Place | undefined => {
  const start = places.findIndex((place) => place.id === from) + 1;
  for (let step = 0; step < places.length; step++) {
    const place = places[(start + step) % places.length];
    if (isOpen(place, filled)) return place;
  }
  return undefined;
};

export const ALL_FILLED = "All places filled";

// what the Next button says and where it goes
export interface NextButton {
  text: string;
  place: Place | undefined;
  disabled: boolean;
}

/**
 * nextButton returns the Next button for `places`: "Next · i of n", where n
 * counts the places not filled yet and i is where among them the next one
 * is, or "All places filled", disabled
 */
export const nextButton = (
  places: readonly Place[],
  filled: ReadonlySet<string>,
  from?: string,
): NextButton => {
  const place = nextPlace(places, filled, from);
  if (!place) return { text: ALL_FILLED, place: undefined, disabled: true };
  const open = places.filter((each) => isOpen(each, filled));
  return {
    text: `Next · ${open.indexOf(place) + 1} of ${open.length}`,
    place,
    disabled: false,
  };
};

// what a text field asks for, which it starts with when it is filled
export type Prefill = "name" | "date" | "place" | "placeAndDate";

// what filling a place does:
// - stamp: puts that stamp on it (the signature or initials, or the lines of
//   the date, the place, or both);
// - text: focuses the field's input, with what `prefill` asks for in it,
//   selected;
// - toggle: a checkbox switches; choose: picks one of a radio's buttons or a
//   choice's options
export type PlaceFill =
  | {
      action: "stamp";
      stamp: "signature" | "initials" | "date" | "place" | "placeAndDate";
    }
  | { action: "text"; prefill?: Prefill }
  | { action: "toggle" }
  | { action: "choose" };

// the words that make a text field's label one Blank fills, in English and
// German; whole words only, so "Geburtsdatum" or "Wohnort" are none
const DATE_WORDS = new Set(["date", "datum"]);
const PLACE_WORDS = new Set(["place", "ort"]);
const NAME_WORDS = new Set(["name"]);
// words that make it another date, place or name than the signer's
const OTHER_WORDS = new Set([
  "birth",
  "expiry",
  "expiration",
  "due",
  "start",
  "end",
  "issue",
  "beginn",
  "ende",
  "geburt",
  "first",
  "last",
  "middle",
  "given",
  "family",
  "maiden",
  "company",
  "business",
  "organisation",
  "organization",
  "user",
  "file",
  "firma",
  "vorname",
  "nachname",
  "geburtsname",
]);

/**
 * prefillOf returns what a text field asks for, by the words of its `/TU`
 * and its name: the signer's name, the date, the place, or the place and
 * date; none for anything else or for a mix
 */
export const prefillOf = (field: PdfField): Prefill | undefined => {
  const words = [field.label ?? "", field.name.split(".").pop() ?? ""]
    .join(" ")
    .replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2")
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
  if (words.some((word) => OTHER_WORDS.has(word))) return undefined;
  const has = (set: Set<string>) => words.some((word) => set.has(word));
  const date = has(DATE_WORDS);
  const place = has(PLACE_WORDS);
  const name = has(NAME_WORDS);
  if (name) return date || place ? undefined : "name";
  if (date && place) return "placeAndDate";
  if (date) return "date";
  if (place) return "place";
  return undefined;
};

/**
 * fillOf returns what filling `place` does (see PlaceFill)
 */
export const fillOf = (place: Place): PlaceFill => {
  if (place.source === "found") return { action: "stamp", stamp: place.kind };
  switch (place.kind) {
    case "signature":
      return { action: "stamp", stamp: "signature" };
    case "checkbox":
      return { action: "toggle" };
    case "radio":
    case "combo":
    case "list":
      return { action: "choose" };
    case "text": {
      const prefill = prefillOf(place.field);
      return prefill ? { action: "text", prefill } : { action: "text" };
    }
  }
};
