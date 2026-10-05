import { afterEach, describe, expect, it, vi } from "vitest";

import { CommandIdentifier, config } from "../config";
import { createState, createTestView, doc, keyEvent, p } from "../test/editor";
import {
  ariaShortcut,
  canonicalBinding,
  commandBinding,
  commandKey,
  commandShortcut,
  formatShortcut,
  liveKeys,
  sameBinding,
} from "./keyBindings";

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

  it("shows none for a command without a key", () => {
    expect(
      commandShortcut(CommandIdentifier.BLOCKTYPE_CODE_BLOCK),
    ).toBeUndefined();
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

describe("commandBinding", () => {
  it("returns a command's key as the keymap reads it", () => {
    expect(commandBinding(CommandIdentifier.INSERT_TABLE)).toBe("Mod-t");
  });
});

describe("canonicalBinding", () => {
  it.each([
    ["Mod-Shift-z", false, "Ctrl-Shift-z"],
    ["Shift-Mod-Z", false, "Ctrl-Shift-z"],
    ["Mod-Shift-z", true, "Meta-Shift-z"],
    ["Command-Option-p", true, "Alt-Meta-p"],
    ["Ctrl-Alt-Delete", false, "Alt-Ctrl-Delete"],
    ["Mod-,", false, "Ctrl-,"],
    ["Mod--", false, "Ctrl--"],
    ["F6", false, "F6"],
  ])("writes %s on macOS %s as %s", (binding, mac, canonical) => {
    expect(canonicalBinding(binding, mac)).toBe(canonical);
  });

  it.each([[""], ["Hyper-x"]])("has none for %j", (binding) => {
    expect(canonicalBinding(binding, false)).toBeUndefined();
  });
});

describe("sameBinding", () => {
  it("finds the same key however it's written", () => {
    expect(sameBinding("Mod-Shift-z", "shift-ctrl-Z", false)).toBe(true);
    expect(sameBinding("Mod-Tab", "Ctrl-Tab", false)).toBe(true);
  });

  it("tells Cmd from Ctrl on macOS", () => {
    expect(sameBinding("Mod-Tab", "Ctrl-Tab", true)).toBe(false);
    expect(sameBinding("Mod-Tab", "Meta-Tab", true)).toBe(true);
  });

  it("never matches no key", () => {
    expect(sameBinding("", "", false)).toBe(false);
  });
});

describe("liveKeys", () => {
  const defaults = config.value;
  afterEach(() => {
    config.value = defaults;
  });
  const view = () => createTestView(createState(doc(p("text"))));

  it("builds the keys again only when the keymap changed", () => {
    const run = vi.fn(() => true);
    const build = vi.fn(() => ({
      [config.value.keymap[CommandIdentifier.FILE_SAVE]]: run,
    }));
    const keys = liveKeys(build);

    expect(keys(view(), keyEvent("Mod-s"))).toBe(true);
    expect(keys(view(), keyEvent("Mod-s"))).toBe(true);
    // a change of something else keeps the keymap
    config.value = { ...config.value, editor: { indentSize: 2 } };
    expect(keys(view(), keyEvent("Mod-s"))).toBe(true);
    expect(build).toHaveBeenCalledOnce();

    config.value = {
      ...config.value,
      keymap: { ...config.value.keymap, [CommandIdentifier.FILE_SAVE]: "F9" },
    };
    expect(keys(view(), keyEvent("Mod-s"))).toBe(false);
    expect(keys(view(), keyEvent("F9"))).toBe(true);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it("runs a command on its key, or nothing without one", () => {
    const run = vi.fn(() => true);
    const keys = commandKey(CommandIdentifier.INSERT_TABLE, run);

    expect(keys(view(), keyEvent("Mod-t"))).toBe(true);
    config.value = {
      ...config.value,
      keymap: { ...config.value.keymap, [CommandIdentifier.INSERT_TABLE]: "" },
    };
    expect(keys(view(), keyEvent("Mod-t"))).toBe(false);
    expect(run).toHaveBeenCalledOnce();
  });
});
