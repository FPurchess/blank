import { describe, expect, it } from "vitest";

import type { FoundPlace } from "../signing/labels";
import type { PdfField, PdfRect as Rect } from "./ipc";
import {
  dismissPlace,
  fieldLabel,
  fillOf,
  isOpen,
  nextButton,
  nextPlace,
  type Place,
  placesOf,
  prefillOf,
  readingOrder,
} from "./places";

const field = (
  name: string,
  rect: Rect,
  more: Partial<PdfField> = {},
  page = 0,
): PdfField => ({
  name,
  kind: "text",
  label: null,
  value: "",
  options: [],
  flags: {
    readOnly: false,
    required: false,
    multiline: false,
    comb: false,
    maxLen: null,
  },
  signed: false,
  widgets: [{ page, rect, onValue: null }],
  ...more,
});

const found = (kind: FoundPlace["kind"], rect: Rect, page = 0): FoundPlace => ({
  page,
  kind,
  rect,
  label: kind,
});

const ids = (places: Place[]) => places.map((place) => place.id);

describe("the places of a PDF", () => {
  it("takes the fields that can be filled or signed", () => {
    const locked = new Set(["locked"]);
    const fields = [
      field("name", [0, 0, 10, 10]),
      field("id", [0, 0, 10, 10], {
        flags: { ...field("", [0, 0, 0, 0]).flags, readOnly: true },
      }),
      field("locked", [0, 0, 10, 10]),
      field("send", [0, 0, 10, 10], { kind: "button" }),
      field("signed", [0, 0, 10, 10], { kind: "signature", signed: true }),
      field("signature", [0, 0, 10, 10], { kind: "signature" }),
      field("hidden", [0, 0, 10, 10], { widgets: [] }),
    ];
    const places = placesOf({ fields, found: [], locked });
    expect(ids(places).sort()).toEqual([
      "field:locked",
      "field:name",
      "field:signature",
    ]);
    // a field an earlier signer locked shows, but isn't one to fill in
    const lockedOne = places.find((place) => place.id === "field:locked")!;
    expect(lockedOne).toMatchObject({ source: "field", locked: true });
    expect(isOpen(lockedOne, new Set())).toBe(false);
    expect(nextPlace(places, new Set(["field:name"]))?.id).toBe(
      "field:signature",
    );
  });

  it("calls a field by its /TU, else by its name in words", () => {
    expect(
      fieldLabel(field("name", [0, 0, 1, 1], { label: "Your name" })),
    ).toBe("Your name");
    expect(fieldLabel(field("form.signature_1", [0, 0, 1, 1]))).toBe(
      "Signature",
    );
    expect(fieldLabel(field("page1.firstName[0]", [0, 0, 1, 1]))).toBe(
      "First name",
    );
    expect(fieldLabel(field("Text-12", [0, 0, 1, 1]))).toBe("Text");
    expect(fieldLabel(field("7", [0, 0, 1, 1]))).toBe("7");
  });

  it("orders places by page, line and from left to right", () => {
    const places = placesOf({
      fields: [
        field("b", [300, 100, 100, 20]),
        field("c", [100, 200, 100, 20]),
        field("d", [50, 50, 100, 20], {}, 1),
        // three points lower and further left: on the line of b
        field("a", [100, 103, 50, 20]),
      ],
      found: [],
    });
    expect(ids(places)).toEqual(["field:a", "field:b", "field:c", "field:d"]);
  });

  it("keeps the order of things on a line by their bottoms", () => {
    // a tall signature place and a short date place standing on one line
    const order = readingOrder([
      { page: 0, rect: [300, 482, 100, 18] as Rect, id: "date" },
      { page: 0, rect: [72, 464, 200, 36] as Rect, id: "signature" },
    ]);
    expect(order.map((each) => each.id)).toEqual(["signature", "date"]);
  });

  it("puts a radio group at its buttons on the first page it shows on", () => {
    const radio = field("pay", [100, 100, 10, 10], {
      kind: "radio",
      widgets: [
        { page: 0, rect: [100, 100, 10, 10], onValue: "card" },
        { page: 0, rect: [200, 100, 10, 10], onValue: "cash" },
        { page: 1, rect: [0, 0, 10, 10], onValue: "later" },
      ],
    });
    expect(placesOf({ fields: [radio], found: [] })[0]).toMatchObject({
      page: 0,
      rect: [100, 100, 110, 10],
      kind: "radio",
    });
  });

  it("lets a field win over a found place at its spot", () => {
    const places = placesOf({
      // form.pdf's signature field and the place found over its rule
      fields: [field("signature", [100, 292, 200, 50], { kind: "signature" })],
      found: [
        found("signature", [100, 315.75, 200, 36]),
        found("date", [350, 330, 100, 18]),
      ],
    });
    expect(places.map(({ source, kind }) => ({ source, kind }))).toEqual([
      { source: "field", kind: "signature" },
      { source: "found", kind: "date" },
    ]);
  });

  it("keeps a found place a field barely touches, or one on another page", () => {
    const places = placesOf({
      fields: [field("note", [100, 100, 200, 20])],
      found: [
        found("date", [100, 115, 200, 18]),
        found("date", [100, 100, 200, 20], 1),
      ],
    });
    expect(places).toHaveLength(3);
  });

  it("lets a signed signature's widget hide the place found under it", () => {
    const places = placesOf({
      fields: [
        field("signed", [100, 300, 200, 50], {
          kind: "signature",
          signed: true,
        }),
      ],
      found: [found("signature", [100, 310, 200, 36])],
    });
    expect(places).toEqual([]);
  });

  it("makes found places within 4 pt one", () => {
    const places = placesOf({
      fields: [],
      found: [
        found("date", [100, 100, 100, 18]),
        found("date", [103, 98, 98, 21]),
        found("date", [100, 130, 100, 18]),
      ],
    });
    expect(ids(places)).toEqual(["found:0:100:100", "found:0:100:130"]);
  });

  it("dismisses found places, never fields, and undoes with the old set", () => {
    const fields = [field("name", [0, 0, 10, 10])];
    const places = placesOf({
      fields,
      found: [found("date", [0, 50, 50, 18])],
    });
    const none = new Set<string>();
    const dismissed = dismissPlace(none, places[1]);
    expect(dismissPlace(dismissed, places[0])).toBe(dismissed);
    expect(
      ids(
        placesOf({
          fields,
          found: [found("date", [0, 50, 50, 18])],
          dismissed,
        }),
      ),
    ).toEqual(["field:name"]);
    expect(none.size).toBe(0);
    expect(
      placesOf({
        fields,
        found: [found("date", [0, 50, 50, 18])],
        dismissed: none,
      }),
    ).toHaveLength(2);
  });
});

describe("Next", () => {
  const places = placesOf({
    fields: [
      field("a", [0, 0, 10, 10]),
      field("b", [0, 100, 10, 10]),
      field("c", [0, 200, 10, 10]),
    ],
    found: [],
  });

  it("goes to the next place that isn't filled, coming round", () => {
    const filled = new Set(["field:b"]);
    expect(nextPlace(places, filled)?.id).toBe("field:a");
    expect(nextPlace(places, filled, "field:a")?.id).toBe("field:c");
    expect(nextPlace(places, filled, "field:c")?.id).toBe("field:a");
    expect(nextPlace(places, filled, "gone")?.id).toBe("field:a");
    expect(nextPlace([], filled)).toBeUndefined();
  });

  it("counts the places left", () => {
    expect(nextButton(places, new Set())).toMatchObject({
      text: "Next · 1 of 3",
      disabled: false,
    });
    expect(nextButton(places, new Set(["field:a"]), "field:a")).toMatchObject({
      text: "Next · 1 of 2",
      place: places[1],
    });
    expect(nextButton(places, new Set(["field:a"]), "field:b").text).toBe(
      "Next · 2 of 2",
    );
  });

  it("says when every place is filled", () => {
    expect(nextButton(places, new Set(ids(places)))).toEqual({
      text: "All places filled",
      place: undefined,
      disabled: true,
    });
    expect(nextButton([], new Set()).disabled).toBe(true);
  });
});

describe("filling a place", () => {
  const placeOf = (each: PdfField) =>
    placesOf({ fields: [each], found: [] })[0];

  it("stamps a found place with what its label asks for", () => {
    for (const kind of [
      "signature",
      "initials",
      "date",
      "place",
      "placeAndDate",
    ] as const) {
      const [place] = placesOf({
        fields: [],
        found: [found(kind, [0, 0, 100, 18])],
      });
      expect(fillOf(place)).toEqual({ action: "stamp", stamp: kind });
    }
  });

  it("signs a signature field, toggles a checkbox, lets the user choose", () => {
    const rect: Rect = [0, 0, 10, 10];
    expect(fillOf(placeOf(field("s", rect, { kind: "signature" })))).toEqual({
      action: "stamp",
      stamp: "signature",
    });
    expect(fillOf(placeOf(field("c", rect, { kind: "checkbox" })))).toEqual({
      action: "toggle",
    });
    for (const kind of ["radio", "combo", "list"] as const)
      expect(fillOf(placeOf(field("x", rect, { kind })))).toEqual({
        action: "choose",
      });
    expect(fillOf(placeOf(field("street", rect)))).toEqual({ action: "text" });
    expect(fillOf(placeOf(field("f", rect, { label: "Datum" })))).toEqual({
      action: "text",
      prefill: "date",
    });
  });

  it("prefills text fields asking for the signer's name, the date or the place", () => {
    const prefill = (name: string, label: string | null = null) =>
      prefillOf(field(name, [0, 0, 1, 1], { label }));
    expect(prefill("name", "Your name")).toBe("name");
    expect(prefill("fullName")).toBe("name");
    expect(prefill("Text1", "Date")).toBe("date");
    expect(prefill("signing_date")).toBe("date");
    expect(prefill("ort")).toBe("place");
    expect(prefill("x", "Ort, Datum")).toBe("placeAndDate");
    expect(prefill("x", "Place and date")).toBe("placeAndDate");
    // other dates, places and names
    expect(prefill("x", "Date of birth")).toBeUndefined();
    expect(prefill("Geburtsdatum")).toBeUndefined();
    expect(prefill("Wohnort")).toBeUndefined();
    expect(prefill("firstName")).toBeUndefined();
    expect(prefill("x", "Name, Vorname")).toBeUndefined();
    expect(prefill("x", "Name and date")).toBeUndefined();
    expect(prefill("street")).toBeUndefined();
  });
});
