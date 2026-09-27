import { describe, expect, it, vi } from "vitest";

import type { TableToolbarItem } from "../state";
import { itemLabel, tableModeHint, toolbarEntries } from "./tableToolbarModel";

const item = (id: string, group: string): TableToolbarItem => ({
  id,
  label: `Label ${id}`,
  icon: "sort",
  key: id.toUpperCase(),
  group,
  enabled: true,
  run: vi.fn(),
});

describe("toolbarEntries", () => {
  it("separates the groups, and keys every entry once", () => {
    const items = [item("a", "one"), item("b", "one"), item("c", "two")];
    const entries = toolbarEntries([...items, item("d", "three")]);

    expect(entries.map((entry) => entry.item?.id ?? null)).toEqual([
      "a",
      "b",
      null,
      "c",
      null,
      "d",
    ]);
    const keys = entries.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
    // a button is keyed by its item, so it stays the same element
    expect(entries[0]).toMatchObject({ key: "a", item: items[0] });
  });

  it("has nothing for no items", () => {
    expect(toolbarEntries([])).toEqual([]);
  });
});

describe("itemLabel", () => {
  it("adds the key in table mode", () => {
    expect(itemLabel(item("x", "a"), false)).toBe("Label x");
    expect(itemLabel(item("x", "a"), true)).toBe("Label x (X)");
  });
});

describe("tableModeHint", () => {
  it("names the key that ends table mode", () => {
    // jsdom isn't a Mac
    expect(tableModeHint()).toBe(
      "Shift+arrows move rows and columns · Esc or Ctrl+T: done",
    );
  });
});
