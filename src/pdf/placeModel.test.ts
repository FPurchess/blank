import { describe, expect, it } from "vitest";

import type { PdfField, Rect } from "./fields";
import {
  choiceText,
  fieldValue,
  filledOf,
  fitLines,
  fitMark,
  isFilled,
  nextMessage,
  nextOf,
  placeElementId,
  placeLabel,
  placeName,
} from "./placeModel";
import { placesOf } from "./places";
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
    },
    {
      page: 1,
      kind: "placeAndDate",
      rect: [100, 400, 80, 15],
      label: "Ort, Datum",
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
    const next = nextOf(places, new Set(["field:name"]), null);
    expect(next.text).toBe("Next · 1 of 5");
    expect(next.place?.id).toBe("field:agree");
    expect(nextMessage(byId("field:signature_1"))).toBe(
      "Signature on page 1. Press Enter to fill it in.",
    );
    expect(nextMessage(byId("field:name"))).toBe(
      "Your name on page 1. Type to fill it in.",
    );
    expect(
      nextOf(places, new Set(places.map((place) => place.id)), null),
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
    // a date on a line, smaller only when it doesn't fit
    expect(fitLines([60, 14], [100, 400, 80, 20])).toEqual([102, 406, 60, 14]);
    const [, , w, h] = fitLines([156, 14], [100, 400, 80, 20]);
    expect(w).toBeCloseTo(78);
    expect(h).toBeCloseTo(7);
  });
});
