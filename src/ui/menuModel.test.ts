import { describe, expect, it } from "vitest";

import type { MenuHead, MenuItem, MenuLine, MenuRow } from "../state";
import {
  activeItem,
  enabledAt,
  firstColumn,
  firstEnabled,
  foundText,
  groupsOf,
  hasChecks,
  indexAfterUpdate,
  isEntry,
  isHead,
  isRow,
  labelParts,
  lastEnabled,
  roleOf,
  rowStep,
  step,
  typeahead,
} from "./menuModel";

const items: MenuItem[] = [
  { id: "loading", label: "Loading…", disabled: true },
  { id: "add", label: "Add" },
  "separator",
  { id: "all", label: "Change all" },
  { id: "again", label: "Again" },
];

describe("menuModel", () => {
  it("tells items from separators, and which can be focused", () => {
    expect(isEntry("separator")).toBe(false);
    expect(isEntry(items[1])).toBe(true);
    expect([0, 1, 2, 3, 4, 5].map((i) => enabledAt(items, i))).toEqual([
      false,
      true,
      false,
      true,
      true,
      false,
    ]);
  });

  it("steps over disabled items and separators, wrapping around", () => {
    expect(step(items, 1, 1)).toBe(3);
    expect(step(items, 4, 1)).toBe(1);
    expect(step(items, 1, -1)).toBe(4);
    expect(firstEnabled(items)).toBe(1);
    expect(lastEnabled(items)).toBe(4);
  });

  it("finds no item where none can be focused", () => {
    const none: MenuItem[] = [
      "separator",
      { id: "x", label: "X", disabled: true },
    ];

    expect(firstEnabled(none)).toBe(-1);
    expect(lastEnabled(none)).toBe(-1);
    expect(firstEnabled([])).toBe(-1);
  });

  it("jumps to the next item starting with a letter, ignoring case", () => {
    expect(typeahead(items, 1, "a")).toBe(4);
    expect(typeahead(items, 4, "A")).toBe(1);
    expect(typeahead(items, -1, "c")).toBe(3);
    // disabled items aren't jumped to
    expect(typeahead(items, 1, "l")).toBeNull();
  });

  it("gives every row a check column when an item switches something", () => {
    expect(hasChecks(items)).toBe(false);
    expect(
      hasChecks([...items, { id: "on", label: "On", checked: false }]),
    ).toBe(true);
  });

  it("names the role of a row", () => {
    expect(roleOf({ id: "a", label: "A" })).toBe("menuitem");
    expect(roleOf({ id: "a", label: "A", checked: true })).toBe(
      "menuitemcheckbox",
    );
    expect(roleOf({ id: "a", label: "A", checked: false, radio: true })).toBe(
      "menuitemradio",
    );
    // radio only counts for items with a check
    expect(roleOf({ id: "a", label: "A", radio: true })).toBe("menuitem");
  });

  describe("rows, heads and sections", () => {
    const row: MenuRow = {
      kind: "row",
      id: "row",
      label: "View",
      items: [
        { id: "x", label: "X", disabled: true },
        { id: "y", label: "Y" },
        { id: "z", label: "Z" },
      ],
    };
    const head: MenuHead = { kind: "head", label: "Recent", shown: true };
    const lines: MenuLine[] = [head, { id: "a", label: "A" }, "separator", row];

    it("tells rows and heads from items", () => {
      expect([head, row, lines[1]].map(isRow)).toEqual([false, true, false]);
      expect([head, row, lines[1]].map(isHead)).toEqual([true, false, false]);
      expect([head, row, lines[1]].map(isEntry)).toEqual([false, false, true]);
    });

    it("steps over heads, and into a row with an enabled item", () => {
      expect(firstEnabled(lines)).toBe(1);
      expect(step(lines, 1, 1)).toBe(3);
      expect(typeahead(lines, 1, "v")).toBeNull();
    });

    it("moves through a row without wrapping, past disabled items", () => {
      expect(firstColumn(row)).toBe(1);
      expect(rowStep(row, 1, 1)).toBe(2);
      expect(rowStep(row, 2, 1)).toBe(2);
      expect(rowStep(row, 1, -1)).toBe(1);
      expect(activeItem(lines, 3, 2)).toBe(row.items[2]);
      expect(activeItem(lines, 1, 5)).toBe(lines[1]);
    });

    it("splits the lines into sections at the separators, with their heads", () => {
      expect(groupsOf(lines)).toEqual([
        { head, start: 0, end: 2 },
        { head: null, start: 3, end: 4 },
      ]);
    });

    it("keeps the item of a row the user moved to across an update", () => {
      const moved = indexAfterUpdate(
        lines,
        3,
        true,
        { items: lines, keyboard: false },
        2,
      );
      expect(moved).toEqual({ index: 3, column: 2 });
    });

    it("marks the part of a label a search matched", () => {
      expect(
        labelParts({ id: "p", label: "Export as PDF", match: [10, 13] }),
      ).toEqual([
        { text: "Export as ", marked: false },
        { text: "PDF", marked: true },
      ]);
      expect(foundText(1)).toBe("1 command");
      expect(foundText(5)).toBe("5 commands");
    });
  });

  describe("indexAfterUpdate", () => {
    const next = [...items].reverse();

    it("keeps the item the user moved to, found by its id", () => {
      expect(
        indexAfterUpdate(items, 3, true, { items: next, keyboard: false }),
      ).toMatchObject({ index: 1 });
    });

    it("focuses the first item until the user moves", () => {
      expect(
        indexAfterUpdate(items, 3, false, { items: next, keyboard: false }),
      ).toMatchObject({ index: 0 });
      expect(
        indexAfterUpdate(items, -1, false, { items: next, keyboard: true }),
      ).toMatchObject({ index: 0 });
    });

    it("focuses nothing in a menu opened with the mouse that had no focus", () => {
      expect(
        indexAfterUpdate(items, -1, true, { items: next, keyboard: false }),
      ).toMatchObject({ index: -1 });
    });

    it("falls back to the first item when the moved-to one is gone", () => {
      const without: MenuItem[] = [{ id: "other", label: "Other" }];

      expect(
        indexAfterUpdate(items, 1, true, { items: without, keyboard: false }),
      ).toMatchObject({ index: 0 });
      expect(
        indexAfterUpdate(items, 1, true, { items: [], keyboard: true }),
      ).toMatchObject({ index: -1 });
    });

    it("focuses nothing when the moved-to item is disabled now, as before", () => {
      const disabled: MenuItem[] = [
        { id: "add", label: "Add", disabled: true },
        { id: "other", label: "Other" },
      ];

      expect(
        indexAfterUpdate(items, 1, true, { items: disabled, keyboard: false }),
      ).toMatchObject({ index: -1 });
    });
  });
});
