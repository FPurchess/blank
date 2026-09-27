import { describe, expect, it, vi } from "vitest";

import { formatShortcut } from "./keyBindings";

describe("formatShortcut", () => {
  const setPlatform = (platform: string) =>
    vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);

  it.each([
    ["Mod-z", "Ctrl+Z"],
    ["Mod-Shift-z", "Ctrl+Shift+Z"],
    ["Mod-Alt-s", "Ctrl+Alt+S"],
    ["Shift-F10", "Shift+F10"],
    ["Mod--", "Ctrl+-"],
  ])("shows %j as %j elsewhere", (binding, expected) => {
    setPlatform("Linux x86_64");

    expect(formatShortcut(binding)).toBe(expected);
  });

  it.each([
    ["Mod-z", "⌘Z"],
    ["Mod-Shift-z", "⇧⌘Z"],
    ["Mod-Alt-Shift-n", "⌥⇧⌘N"],
    ["Ctrl-a", "⌃A"],
  ])("shows %j as %j on macOS", (binding, expected) => {
    setPlatform("MacIntel");

    expect(formatShortcut(binding)).toBe(expected);
  });
});
