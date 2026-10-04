import { describe, expect, it, vi } from "vitest";

import type { MenuItem, Tab } from "../state";
import {
  compactBlocks,
  dragBy,
  middleCloses,
  scrollLeftFor,
  tabKey,
  tabMenu,
} from "./tabRowModel";

const tab = (path: string | null): Tab => ({
  id: "a",
  path,
  importedFrom: null,
  untitledNumber: path ? null : 1,
  unsaved: false,
  viewAnchor: null,
});

describe("tabKey", () => {
  it("moves the focus with the arrows, Home and End, wrapping around", () => {
    expect(tabKey("ArrowRight", false, 2, 3)).toEqual({ move: 0 });
    expect(tabKey("ArrowLeft", false, 0, 3)).toEqual({ move: 2 });
    expect(tabKey("End", false, 0, 3)).toEqual({ move: 2 });
  });

  it.each([
    ["Enter", false, "activate"],
    [" ", false, "activate"],
    ["Delete", false, "close"],
    ["F10", true, "menu"],
    ["ContextMenu", false, "menu"],
    ["Escape", false, "leave"],
    ["F10", false, null],
    ["a", false, null],
  ] as const)("%s (Shift %s) does %s", (key, shift, action) => {
    expect(tabKey(key, shift, 0, 3)).toBe(action);
  });
});

describe("middleCloses", () => {
  it("closes only the tab it was pressed and let go on", () => {
    expect(middleCloses("a", "a")).toBe(true);
    expect(middleCloses("a", "b")).toBe(false);
    expect(middleCloses(null, null)).toBe(false);
  });
});

describe("compactBlocks", () => {
  it("drops the name once the tabs overflow, and keeps it off near the limit", () => {
    expect(compactBlocks(false, true, 0)).toBe(true);
    expect(compactBlocks(false, false, 10)).toBe(false);
    expect(compactBlocks(true, false, 40)).toBe(true);
    expect(compactBlocks(true, false, 200)).toBe(false);
  });
});

describe("scrollLeftFor", () => {
  it("brings a tab outside the list into it", () => {
    expect(scrollLeftFor(500, 100, 0, 300)).toBe(308);
    expect(scrollLeftFor(50, 100, 200, 300)).toBe(42);
    expect(scrollLeftFor(50, 100, 0, 300)).toBeNull();
  });
});

describe("dragBy", () => {
  // three tabs 100 px wide
  const edges = [0, 100, 200, 300];

  it("moves a tab to the nearest line between the others", () => {
    expect(dragBy(edges, 0, 40)).toBe(0);
    expect(dragBy(edges, 0, 190)).toBe(1);
    expect(dragBy(edges, 0, 290)).toBe(2);
    expect(dragBy(edges, 2, 10)).toBe(-2);
  });
});

describe("tabMenu", () => {
  const actions = () => ({
    close: vi.fn(),
    closeOthers: vi.fn(),
    closeRight: vi.fn(),
    save: vi.fn(),
    copyPath: vi.fn(),
  });
  const ids = (items: MenuItem[]) =>
    items.map((item) => (item === "separator" ? "-" : item.id));
  const item = (items: MenuItem[], id: string) =>
    items.find(
      (candidate) => candidate !== "separator" && candidate.id === id,
    ) as Exclude<MenuItem, "separator">;

  it("closes, saves and copies the path of a file's tab", () => {
    const run = actions();
    const items = tabMenu(tab("/docs/notes.md"), 0, 2, run);

    expect(ids(items)).toEqual([
      "close",
      "close-others",
      "close-right",
      "-",
      "save",
      "save-as",
      "-",
      "copy-path",
    ]);
    item(items, "close").run!();
    item(items, "save-as").run!();
    item(items, "copy-path").run!();
    expect(run.close).toHaveBeenCalledWith("a");
    expect(run.save).toHaveBeenCalledWith("a", true);
    expect(run.copyPath).toHaveBeenCalledWith("/docs/notes.md");
    expect(item(items, "close").shortcut).toBe("Mod-w");
  });

  it("has no path to copy for an untitled tab, nor tabs to close beyond it", () => {
    const items = tabMenu(tab(null), 0, 1, actions());

    expect(ids(items)).not.toContain("copy-path");
    expect(item(items, "close-others").disabled).toBe(true);
    expect(item(items, "close-right").disabled).toBe(true);
  });
});
