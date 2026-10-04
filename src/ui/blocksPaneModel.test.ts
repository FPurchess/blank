import { describe, expect, it } from "vitest";

import { checkDefinition, type Definition } from "../markdown";
import type { BlockChoice } from "../state";
import { RECIPE } from "../test/forms";
import { formWireframe, groupsOf, tileStep } from "./blocksPaneModel";

const choices: BlockChoice[] = [
  {
    id: "toc",
    group: "contents",
    label: "Table of contents",
    description: "The headings, with the pages they start on",
  },
  {
    id: "blank/recipe",
    group: "forms",
    label: "Recipe",
    description: "A dish with its ingredients",
  },
  {
    id: "user/broken",
    group: "forms",
    label: "broken",
    description: "Can't be used: it needs fields",
    disabled: true,
  },
];

describe("groupsOf", () => {
  it("shows every block in its group, in the groups' order", () => {
    const groups = groupsOf([...choices].reverse(), "");
    expect(groups.map(({ label }) => label)).toEqual(["Contents", "Forms"]);
    expect(groups[1].choices.map(({ id }) => id)).toEqual([
      "user/broken",
      "blank/recipe",
    ]);
  });

  it("finds blocks by their name or description, in any case", () => {
    expect(groupsOf(choices, "RECI")[0].choices[0].id).toBe("blank/recipe");
    expect(groupsOf(choices, " headings ")[0].group).toBe("contents");
    expect(groupsOf(choices, "nothing like it")).toEqual([]);
  });
});

describe("tileStep", () => {
  it("moves along the rows of two tiles", () => {
    expect(tileStep("ArrowRight", 0, [5])).toBe(1);
    expect(tileStep("ArrowRight", 4, [5])).toBe(4);
    expect(tileStep("ArrowLeft", 0, [5])).toBe(0);
    expect(tileStep("ArrowDown", 1, [5])).toBe(3);
    expect(tileStep("ArrowUp", 3, [5])).toBe(1);
    expect(tileStep("Home", 3, [5])).toBe(0);
    expect(tileStep("End", 0, [5])).toBe(4);
  });

  it("goes down to the last tile of a shorter last row, and stays there", () => {
    expect(tileStep("ArrowDown", 3, [5])).toBe(4);
    expect(tileStep("ArrowDown", 4, [5])).toBe(4);
  });

  it("goes on into the group below and above, in the same column", () => {
    // the table of contents alone, then three forms
    const sizes = [1, 3];
    expect(tileStep("ArrowDown", 0, sizes)).toBe(1);
    expect(tileStep("ArrowUp", 1, sizes)).toBe(0);
    // from the second column, into a group whose row has one
    expect(tileStep("ArrowUp", 2, sizes)).toBe(0);
    expect(tileStep("ArrowDown", 2, [3, 2])).toBe(3);
    expect(tileStep("ArrowDown", 1, [2, 2])).toBe(3);
    expect(tileStep("ArrowUp", 4, [3, 2])).toBe(2);
    expect(tileStep("ArrowUp", 3, [3, 2])).toBe(2);
  });

  it("goes up to the search from the first row of the first group", () => {
    expect(tileStep("ArrowUp", 1, [5])).toBeLessThan(0);
    expect(tileStep("ArrowUp", 0, [1, 3])).toBeLessThan(0);
  });

  it("leaves other keys alone", () => {
    expect(tileStep("a", 1, [5])).toBeNull();
  });
});

describe("formWireframe", () => {
  it("stacks the fields of a form without a layout", () => {
    const boxes = formWireframe(RECIPE);
    expect(boxes.map(({ kind }) => kind)).toEqual([
      "heading",
      "image",
      "table",
      "text",
    ]);
    for (let i = 1; i < boxes.length; i++)
      expect(boxes[i].y).toBeGreaterThan(boxes[i - 1].y);
  });

  it("sets a grid's cells side by side, and frames at their place", () => {
    const definition = checkDefinition({
      id: "user/letter",
      version: 1,
      name: "Letter",
      newPage: true,
      flowTop: "100mm",
      fields: [
        { name: "to", kind: "rich", label: "To" },
        { name: "photo", kind: "image", label: "Photo" },
        { name: "facts", kind: "rich", label: "Facts" },
      ],
      layout: [
        {
          frame: { x: "20mm", y: "45mm", width: "85mm", height: "45mm" },
          field: "to",
        },
        {
          grid: { columns: ["1fr", "1fr"] },
          cells: [[{ field: "photo" }], [{ field: "facts" }]],
        },
      ],
    }) as Definition;
    expect(typeof definition).toBe("object");
    const [frame, left, right] = formWireframe(definition);
    expect(frame.x).toBeCloseTo(20 / 210, 2);
    expect(frame.y).toBeCloseTo(45 / 297, 2);
    // the grid starts below the frames, where the flow does
    expect(left.y).toBeCloseTo(100 / 297, 2);
    expect(right.y).toBe(left.y);
    expect(right.x).toBeGreaterThan(left.x + left.width);
  });
});
