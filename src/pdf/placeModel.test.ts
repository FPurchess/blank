import { describe, expect, it } from "vitest";

import type { PdfField, PdfRect as Rect } from "./ipc";
import {
  choiceText,
  fieldValue,
  filledOf,
  fitLines,
  fitMark,
  LEAST_LETTERS,
  lettersOn,
  MARK_ON_LINE,
  isFilled,
  nextMessage,
  placeElementId,
  placeLabel,
  placeName,
  staysOn,
} from "./placeModel";
import { type LabelPlace, nextButton, placesOf } from "./places";
import { type Stamp, stampSpec } from "./stampModel";

const field = (
  name: string,
  rect: Rect,
  more: Partial<PdfField> = {},
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
  widgets: [{ page: 0, rect, onValue: null }],
  ...more,
});

const places = placesOf({
  fields: [
    field("name", [100, 100, 200, 20], { label: "Your name" }),
    field("agree", [100, 150, 15, 15], { kind: "checkbox", value: "Off" }),
    field("signature_1", [100, 200, 200, 50], { kind: "signature" }),
    field("witness", [350, 200, 200, 50], {
      kind: "signature",
      label: "Witness",
    }),
  ],
  found: [
    {
      page: 1,
      kind: "signature",
      rect: [100, 300, 200, 36],
      label: "Signature · Tenant",
      size: 10,
    },
    {
      page: 1,
      kind: "placeAndDate",
      rect: [100, 400, 80, 15],
      label: "Ort, Datum",
      size: 10,
    },
  ],
});
const byId = (id: string) => places.find((place) => place.id === id)!;

const stamp = (place: string): Stamp => ({
  id: "s",
  kind: "signature",
  page: 0,
  rect: [0, 0, 10, 10],
  natural: [10, 10],
  place,
  spec: stampSpec("signature"),
});

describe("the places of a PDF on its pages", () => {
  it("are named for people, with their page", () => {
    expect(places.map(placeLabel)).toEqual([
      "Your name, page 1",
      "Agree, page 1",
      "Signature, page 1",
      "Signature · Witness, page 1",
      "Signature · Tenant, page 2",
      "Place and date, page 2",
    ]);
    expect(placeName(byId("field:name"))).toBe("Your name");
    expect(placeElementId("found:1:100:300")).toBe(
      "place-found%3A1%3A100%3A300",
    );
  });

  it("are filled by a stamp on them or a value in the field", () => {
    const name = byId("field:name");
    const agree = byId("field:agree");
    const signature = byId("field:signature_1");
    expect(isFilled(name, [], [])).toBe(false);
    expect(isFilled(name, [], [{ field: "name", value: " " }])).toBe(false);
    expect(isFilled(name, [], [{ field: "name", value: "Ada" }])).toBe(true);
    expect(isFilled(agree, [], [])).toBe(false);
    expect(isFilled(agree, [], [{ field: "agree", value: true }])).toBe(true);
    expect(isFilled(signature, [], [])).toBe(false);
    expect(isFilled(signature, [stamp(signature.id)], [])).toBe(true);
    expect([...filledOf(places, [stamp("found:1:100:300")], [])]).toEqual([
      "found:1:100:300",
    ]);
  });

  it("hold what the PDF says until they're filled in", () => {
    const agree = field("agree", [0, 0, 1, 1], {
      kind: "checkbox",
      value: "Yes",
    });
    expect(fieldValue(agree, [])).toBe(true);
    expect(fieldValue({ ...agree, value: "Off" }, [])).toBe(false);
    const name = field("name", [0, 0, 1, 1], { value: "Ada" });
    expect(fieldValue(name, [{ field: "name", value: "Ben" }])).toBe("Ben");
    expect(choiceText("")).toBe("Choose…");
    expect(choiceText("Red")).toBe("Red");
  });

  it("say where Next goes and how to fill it", () => {
    const next = nextButton(places, new Set(["field:name"]));
    expect(next.text).toBe("Next · 1 of 5");
    expect(next.place?.id).toBe("field:agree");
    expect(nextMessage(byId("field:signature_1"))).toBe(
      "Signature on page 1. Press Enter to fill it in.",
    );
    expect(nextMessage(byId("field:name"))).toBe(
      "Your name on page 1. Type to fill it in.",
    );
    expect(
      nextButton(places, new Set(places.map((place) => place.id))),
    ).toMatchObject({ text: "All places filled", disabled: true });
  });

  it("fit a signature into its place, its shape kept", () => {
    // a found line: standing on it
    expect(fitMark([180, 60], [100, 300, 200, 36], true)).toEqual([
      146, 300, 108, 36,
    ]);
    // a field: in its middle
    expect(fitMark([180, 60], [100, 200, 200, 50], false)).toEqual([
      125, 200, 150, 50,
    ]);
    // a date on a line, smaller only when it's wider than the line
    expect(fitLines([60, 14], [100, 400, 80, 20])).toEqual([102, 406, 60, 14]);
    const [, , w, h] = fitLines([156, 14], [100, 400, 80, 20]);
    expect(w).toBeCloseTo(78);
    expect(h).toBeCloseTo(7);
    // taller than the line's place, it rises above it
    expect(fitLines([60, 20], [100, 400, 80, 12])).toEqual([102, 392, 60, 20]);
  });

  it("stand a signature on a found line at least 36 pt tall, while it fits the line", () => {
    // a line's place as tall as its label: the signature rises above it
    expect(
      fitMark([180, 60], [100, 300, 300, 16], true, MARK_ON_LINE.signature),
    ).toEqual([196, 280, 108, 36]);
    // a short line: as wide as it
    expect(
      fitMark([180, 60], [100, 300, 90, 16], true, MARK_ON_LINE.signature),
    ).toEqual([100, 286, 90, 30]);
    // it still fills its place, moved a little
    expect(staysOn([197, 281, 108, 36], [100, 300, 300, 16])).toBe(true);
    expect(staysOn([197, 200, 108, 36], [100, 300, 300, 16])).toBe(false);
  });

  it("write a date or place in the letters of the line's label, at least 9 pt", () => {
    const place = (size?: number): LabelPlace => ({
      id: "found:0:100:300",
      source: "found",
      kind: "date",
      page: 0,
      rect: [100, 300, 200, 16],
      label: "Date",
      size,
    });
    expect(lettersOn(place(12))).toBe(12);
    expect(lettersOn(place(6))).toBe(LEAST_LETTERS);
    expect(lettersOn(place())).toBeUndefined();
  });
});
