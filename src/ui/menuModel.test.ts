import { describe, expect, it } from "vitest";

import type { MenuItem } from "../state";
import {
  enabledAt,
  firstEnabled,
  hasChecks,
  indexAfterUpdate,
  isEntry,
  lastEnabled,
  menuKey,
  roleOf,
  step,
  typeahead,
} from "./menuModel";

const items: MenuItem[] = [
  { id: "loading", label: "Loading…", disabled: true },
  { id: "add", label: "Add" },
  "separator",
  { id: "all", label: "Change All" },
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

  it("keys the requests of one menu alike, and another menu apart", () => {
    const close = () => {};
    const other = () => {};

    expect(menuKey(close)).toBe(menuKey(close));
    expect(menuKey(other)).not.toBe(menuKey(close));
  });

  describe("indexAfterUpdate", () => {
    const next = [...items].reverse();

    it("keeps the item the user moved to, found by its id", () => {
      expect(
        indexAfterUpdate(items, 3, true, { items: next, keyboard: false }),
      ).toBe(1);
    });

    it("focuses the first item until the user moves", () => {
      expect(
        indexAfterUpdate(items, 3, false, { items: next, keyboard: false }),
      ).toBe(0);
      expect(
        indexAfterUpdate(items, -1, false, { items: next, keyboard: true }),
      ).toBe(0);
    });

    it("focuses nothing in a menu opened with the mouse that had no focus", () => {
      expect(
        indexAfterUpdate(items, -1, true, { items: next, keyboard: false }),
      ).toBe(-1);
    });

    it("falls back to the first item when the moved-to one is gone", () => {
      const without: MenuItem[] = [{ id: "other", label: "Other" }];

      expect(
        indexAfterUpdate(items, 1, true, { items: without, keyboard: false }),
      ).toBe(0);
      expect(
        indexAfterUpdate(items, 1, true, { items: [], keyboard: true }),
      ).toBe(-1);
    });

    it("focuses nothing when the moved-to item is disabled now, as before", () => {
      const disabled: MenuItem[] = [
        { id: "add", label: "Add", disabled: true },
        { id: "other", label: "Other" },
      ];

      expect(
        indexAfterUpdate(items, 1, true, { items: disabled, keyboard: false }),
      ).toBe(-1);
    });
  });
});
