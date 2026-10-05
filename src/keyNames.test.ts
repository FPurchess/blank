import { describe, expect, it } from "vitest";

import { canonicalBinding, normalizeBinding, sameBinding } from "./keyNames";

describe("normalizeBinding", () => {
  it.each([
    ["Mod-b", "Mod-b"],
    ["Mod-Shift-z", "Mod-Shift-z"],
    ["Tab", "Tab"],
    ["Shift-Tab", "Shift-Tab"],
    ["Mod--", "Mod--"],
    ["Mod-Space", "Mod-Space"],
    ["Ctrl-Alt-s", "Ctrl-Alt-s"],
    ["Control-Meta-s", "Control-Meta-s"],
    ["c-a-s-m-x", "c-a-s-m-x"],
    ["Cmd-p", "Meta-p"],
    ["Option-p", "Alt-p"],
    ["option-p", "Alt-p"],
    ["Command-Shift-s", "Meta-Shift-s"],
    ["COMMAND-s", "Meta-s"],
    ["Super-e", "Meta-e"],
  ])("normalizes %j to %j", (binding, expected) => {
    expect(normalizeBinding(binding)).toBe(expected);
  });

  it.each(["", "Hyper-b", "Win-b", "Command--p", "Fn-F1"])(
    "rejects %j",
    (binding) => {
      expect(normalizeBinding(binding)).toBeUndefined();
    },
  );

  it("rejects a binding that isn't a string", () => {
    expect(normalizeBinding(42 as unknown as string)).toBeUndefined();
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
