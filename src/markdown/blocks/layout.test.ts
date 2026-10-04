import { describe, expect, it } from "vitest";

import { checkLayout, placesOf, trackOf } from "./layout";

const FIELDS = ["title", "photo", "ingredients", "steps"];

const recipe = (
  cells: unknown = [[{ field: "photo" }], [{ field: "ingredients" }]],
) => [
  { field: "title" },
  { grid: { columns: ["1fr", "40mm"], gap: "4mm" }, cells },
  { field: "steps" },
];

const FRAME = { x: "20mm", y: "45mm", width: "85mm", height: "27mm" };

describe("trackOf", () => {
  it.each([
    ["1fr", { pt: 0, fr: 1 }],
    ["2.5 fr", { pt: 0, fr: 2.5 }],
    ["1in", { pt: 72, fr: 0 }],
    ["12pt", { pt: 12, fr: 0 }],
  ])("reads %s", (value, track) => {
    expect(trackOf(value)).toEqual(track);
  });

  it.each(["0fr", "fr", "-1mm", "0mm", "auto", 40])(
    "doesn't read %s",
    (value) => {
      expect(trackOf(value)).toBeUndefined();
    },
  );
});

describe("checkLayout", () => {
  it("takes fields and grids that have each field once, in order", () => {
    expect(checkLayout(recipe(), FIELDS)).toEqual(recipe());
  });

  it.each([
    ["no list", {}],
    ["a field it doesn't know", [{ field: "notes" }, ...recipe()]],
    ["a field twice", [...recipe(), { field: "title" }]],
    ["a field left out", recipe().slice(0, 2)],
    [
      "the fields in another order",
      recipe([[{ field: "ingredients" }], [{ field: "photo" }]]),
    ],
    ["an empty cell", recipe([[], [{ field: "photo" }]])],
    ["a cell of names", recipe([["photo"], ["ingredients"]])],
    [
      "a column that isn't a width",
      [{ grid: { columns: ["auto"] }, cells: [[{ field: "title" }]] }],
    ],
    [
      "a gap of a share",
      [
        {
          grid: { columns: ["1fr"], gap: "1fr" },
          cells: [[{ field: "title" }]],
        },
      ],
    ],
    [
      "five columns",
      [
        {
          grid: { columns: Array(5).fill("1fr") },
          cells: [[{ field: "title" }]],
        },
      ],
    ],
    [
      "a grid in a grid",
      [
        {
          grid: { columns: ["1fr"] },
          cells: [[{ grid: { columns: ["1fr"] } }]],
        },
      ],
    ],
    ["a key it doesn't know", [{ field: "title", width: "1fr" }]],
    [
      "a frame after a field",
      [
        { field: "title" },
        { frame: FRAME, field: "photo" },
        ...recipe().slice(1),
      ],
    ],
    [
      "a frame without a width",
      [{ frame: { x: "20mm", y: "40mm" }, field: "title" }],
    ],
    [
      "a frame of a share",
      [{ frame: { ...FRAME, width: "1fr" }, field: "title" }],
    ],
  ])("says what is wrong with %s", (_, layout) => {
    const fields = FIELDS.slice(0, (layout as unknown[]).length === 1 ? 1 : 4);
    expect(typeof checkLayout(layout, fields)).toBe("string");
  });
});

describe("frames", () => {
  it("come first, each holding a field", () => {
    const layout = [
      { frame: FRAME, field: "title" },
      { field: "photo" },
      { field: "ingredients" },
      { field: "steps" },
    ];
    expect(checkLayout(layout, FIELDS)).toEqual(layout);
    const place = placesOf(layout).get("title");
    expect(place).toMatchObject({ kind: "frame", width: (85 * 72) / 25.4 });
    expect(placesOf(layout).has("photo")).toBe(false);
  });
});

describe("placesOf", () => {
  it("puts the cells of a row side by side, and starts a new row after the columns", () => {
    const places = placesOf([
      {
        grid: { columns: ["1fr", "1fr"] },
        cells: [
          [{ field: "a" }, { field: "b" }],
          [{ field: "c" }],
          [{ field: "d" }],
        ],
      },
      { field: "e" },
    ]);
    expect(places.get("a")).toMatchObject({ band: "0:0", column: 0 });
    expect(places.get("b")).toMatchObject({ band: "0:0", column: 0 });
    expect(places.get("c")).toMatchObject({ band: "0:0", column: 1 });
    expect(places.get("d")).toMatchObject({ band: "0:1", column: 0 });
    expect(places.has("e")).toBe(false);
    // the gap it doesn't say: 6mm
    expect(places.get("a")).toMatchObject({ gap: (6 * 72) / 25.4 });
  });
});
