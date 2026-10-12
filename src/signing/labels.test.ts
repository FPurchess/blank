import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { PageText, Rect } from "../pdf/fields";
import { findLabels, type PlaceKind } from "./labels";

// The fixtures are pages as the helper reads them, each with the places it
// has: hand-made forms and traps, and src-tauri/pdf/fixtures/form.pdf.
interface Fixture {
  about: string;
  text: PageText;
  expected: { kind: PlaceKind; rect: Rect }[];
}

const folder = join(__dirname, "__fixtures__", "labels");
const fixtures = readdirSync(folder)
  .filter((name) => name.endsWith(".json"))
  .map((name) => ({
    name,
    ...(JSON.parse(readFileSync(join(folder, name), "utf8")) as Fixture),
  }));

const iou = (a: Rect, b: Rect) => {
  const width = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
  const height = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  const shared = Math.max(0, width) * Math.max(0, height);
  return shared / (a[2] * a[3] + b[2] * b[3] - shared);
};

// a found place is right when it asks for what an expected one does, about
// where it is
const matches = (
  found: { kind: PlaceKind; rect: Rect },
  expected: { kind: PlaceKind; rect: Rect },
) => found.kind === expected.kind && iou(found.rect, expected.rect) >= 0.5;

describe("found places", () => {
  it("finds the places of the fixtures, with few wrong ones", () => {
    let right = 0;
    let foundCount = 0;
    let expectedCount = 0;
    const rows: string[] = [];
    for (const fixture of fixtures) {
      const found = findLabels(fixture.text, 0);
      const hits = found.filter((place) =>
        fixture.expected.some((expected) => matches(place, expected)),
      ).length;
      const caught = fixture.expected.filter((expected) =>
        found.some((place) => matches(place, expected)),
      ).length;
      right += caught;
      foundCount += found.length;
      expectedCount += fixture.expected.length;
      rows.push(
        `${fixture.name}: ${hits}/${found.length} found right, ${caught}/${fixture.expected.length} expected found`,
      );
    }
    const precision = foundCount ? right / foundCount : 1;
    const recall = expectedCount ? right / expectedCount : 1;
    console.log(
      `${rows.join("\n")}\nprecision ${precision.toFixed(3)}, recall ${recall.toFixed(3)}`,
    );
    expect(precision).toBeGreaterThanOrEqual(0.9);
    expect(recall).toBeGreaterThanOrEqual(0.8);
  });

  it("finds form.pdf's signature over its rule and its place and date", () => {
    const fixture = fixtures.find((each) => each.name === "form-pdf.json")!;
    const found = findLabels(fixture.text, 2);
    expect(
      found.map(({ kind, label, page }) => ({ kind, label, page })),
    ).toEqual([
      { kind: "placeAndDate", label: "Ort, Datum", page: 2 },
      { kind: "signature", label: "Unterschrift", page: 2 },
    ]);
    expect(found[1].rect).toEqual([100, 315.75, 200, 36]);
  });

  it("finds nothing in running text or a table", () => {
    for (const name of ["en-prose-traps.json", "en-table-trap.json"]) {
      const fixture = fixtures.find((each) => each.name === name)!;
      expect(findLabels(fixture.text, 0)).toEqual([]);
    }
  });

  it("names a signature by the role its caption gives", () => {
    const labels = (name: string) =>
      findLabels(fixtures.find((each) => each.name === name)!.text, 0).map(
        (place) => place.label,
      );
    expect(labels("de-roles.json")).toEqual([
      "Signature · Arbeitgeber",
      "Signature · Arbeitnehmer",
      "Signature · Mieter",
      "Signature · Vermieter/in",
      "Signature · Mieter/in",
      "Signature · Erziehungsberechtigte(r)",
      "Signature · Auftraggeber, Auftragnehmer",
    ]);
    expect(labels("en-roles.json")).toEqual([
      "Signature · Landlord",
      "Signature of Tenant",
      "Signature · Tenant",
    ]);
  });

  it("takes no label, name or article for a role", () => {
    const caption = (words: string) => {
      const text: PageText = { words: [], rules: [[72, 100, 200, 0.5]] };
      let x = 72;
      for (const word of words.split(" ")) {
        text.words.push({ text: word, rect: [x, 104, word.length * 5, 9] });
        x += word.length * 5 + 3;
      }
      return findLabels(text, 0).map(({ kind, label }) => ({ kind, label }));
    };
    expect(caption("Datum Unterschrift")).toEqual([]);
    expect(caption("Name Unterschrift")).toEqual([]);
    expect(caption("Your signature")).toEqual([]);
    expect(caption("Unterschrift Kunde")).toEqual([
      { kind: "signature", label: "Signature · Kunde" },
    ]);
    expect(caption("unterschrift kunde")).toEqual([]);
  });

  it("gives an unpaired label nothing", () => {
    const text: PageText = {
      words: [{ text: "Signature:", rect: [72, 100, 50, 9.25] }],
      rules: [],
    };
    expect(findLabels(text, 0)).toEqual([]);
  });

  it("finds a place once when underscores lie on a drawn rule", () => {
    const text: PageText = {
      words: [
        { text: "Date:", rect: [72, 100, 25, 9.25] },
        { text: "__________", rect: [100, 100, 55.6, 9.25] },
      ],
      rules: [[100, 108.5, 56, 0.5]],
    };
    expect(findLabels(text, 0)).toHaveLength(1);
  });

  it("leaves a line alone that a short rule or another word takes", () => {
    const text: PageText = {
      words: [
        { text: "Date:", rect: [72, 100, 25, 9.25] },
        { text: "today", rect: [100, 100, 25, 9.25] },
        { text: "__________", rect: [130, 100, 55.6, 9.25] },
      ],
      rules: [[300, 100, 30, 0.5]],
    };
    expect(findLabels(text, 0)).toEqual([]);
  });
});
