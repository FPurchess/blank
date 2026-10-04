import { describe, expect, it, vi } from "vitest";

import { CommandIdentifier } from "../config";
import { ariaShortcut, commandShortcut, formatShortcut } from "./keyBindings";

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

describe("commandShortcut", () => {
  it("shows the key bound to a command", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("Linux x86_64");

    expect(commandShortcut(CommandIdentifier.PAGE_SETUP)).toBe("Ctrl+Alt+U");
  });
});

describe("ariaShortcut", () => {
  const setPlatform = (platform: string) =>
    vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);

  it.each([
    ["Mod-Shift-z", "Control+Shift+Z"],
    ["Mod-Alt-u", "Control+Alt+U"],
    ["Shift-F10", "Shift+F10"],
    ["Ctrl-a", "Control+A"],
    ["Option-Command-k", "Alt+Meta+K"],
    ["Mod--", "Control+-"],
  ])("writes %j as %j elsewhere", (binding, expected) => {
    setPlatform("Linux x86_64");

    expect(ariaShortcut(binding)).toBe(expected);
  });

  it("writes Mod as Meta on macOS", () => {
    setPlatform("MacIntel");

    expect(ariaShortcut("Mod-Shift-z")).toBe("Meta+Shift+Z");
  });

  it("leaves out a binding that can't be used", () => {
    expect(ariaShortcut("")).toBeUndefined();
    expect(ariaShortcut("Hyper-k")).toBeUndefined();
  });
});
