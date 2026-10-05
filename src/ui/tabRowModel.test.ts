import { describe, expect, it, vi } from "vitest";

import type { MenuItem, Tab } from "../state";
import {
  compactBlocks,
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

const key = (
  name: string,
  modifiers: Partial<
    Record<"shiftKey" | "ctrlKey" | "altKey" | "metaKey", boolean>
  > = {},
) => ({
  key: name,
  shiftKey: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  ...modifiers,
});

describe("tabKey", () => {
  it("moves the focus with the arrows, Home and End, wrapping around", () => {
    expect(tabKey(key("ArrowRight"), 2, 3)).toEqual({ move: 0 });
    expect(tabKey(key("ArrowLeft"), 0, 3)).toEqual({ move: 2 });
    expect(tabKey(key("End"), 0, 3)).toEqual({ move: 2 });
  });

  it("leaves keys with Ctrl, Alt or Meta to the window's commands", () => {
    expect(tabKey(key("ArrowRight", { ctrlKey: true }), 0, 3)).toBeNull();
    expect(tabKey(key("Home", { altKey: true }), 0, 3)).toBeNull();
    expect(tabKey(key("Enter", { metaKey: true }), 0, 3)).toBeNull();
    expect(tabKey(key("Delete", { shiftKey: true }), 0, 3)).toBeNull();
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
  ] as const)("%s (Shift %s) does %s", (name, shiftKey, action) => {
    expect(tabKey(key(name, { shiftKey }), 0, 3)).toBe(action);
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
    expect(compactBlocks(false, true, 0, 50)).toBe(true);
    expect(compactBlocks(false, false, 10, 50)).toBe(false);
    expect(compactBlocks(true, false, 60, 50)).toBe(true);
    expect(compactBlocks(true, false, 70, 50)).toBe(false);
  });
});

describe("scrollLeftFor", () => {
  it("brings a tab outside the list into it", () => {
    expect(scrollLeftFor(500, 100, 0, 300)).toBe(308);
    expect(scrollLeftFor(50, 100, 200, 300)).toBe(42);
    expect(scrollLeftFor(50, 100, 0, 300)).toBeNull();
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
    const items = tabMenu(tab("/docs/notes.md"), 0, 2, true, run);

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

  it("names the keys only on the shown tab's menu, where they act", () => {
    const items = tabMenu(tab("/notes.md"), 1, 2, false, actions());

    expect(item(items, "close").shortcut).toBeUndefined();
    expect(item(items, "save").shortcut).toBeUndefined();
  });

  it("has no path to copy for an untitled tab, nor tabs to close beyond it", () => {
    const items = tabMenu(tab(null), 0, 1, true, actions());

    expect(ids(items)).not.toContain("copy-path");
    expect(item(items, "close-others").disabled).toBe(true);
    expect(item(items, "close-right").disabled).toBe(true);
  });
});
