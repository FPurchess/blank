import { describe, expect, it, vi } from "vitest";

import { CommandIdentifier as C, config, defaults } from "../../config";
import {
  assign,
  filterCommands,
  isChanged,
  recordedKey,
  refusal,
  remove,
  reset,
  shortcutText,
} from "./shortcutsModel";

// a keydown as the webview sends it, with the key code it has
const press = (
  key: string,
  modifiers: Partial<Record<"ctrl" | "alt" | "shift" | "meta", boolean>> = {},
  keyCode = 0,
) => {
  const event = new KeyboardEvent("keydown", {
    key,
    ctrlKey: modifiers.ctrl,
    altKey: modifiers.alt,
    shiftKey: modifiers.shift,
    metaKey: modifiers.meta,
  });
  Object.defineProperty(event, "keyCode", { value: keyCode });
  return event;
};

const keymap = (changes: Partial<Record<C, string>> = {}) => ({
  ...defaults.keymap,
  ...changes,
});

describe("recordedKey", () => {
  it("writes Ctrl as Mod off macOS", () => {
    expect(
      recordedKey(press("b", { ctrl: true, alt: true }, 66), false),
    ).toEqual({ binding: "Mod-Alt-b" });
  });

  it("writes Cmd as Mod and keeps Ctrl on macOS", () => {
    expect(recordedKey(press("b", { meta: true }, 66), true)).toEqual({
      binding: "Mod-b",
    });
    expect(recordedKey(press("b", { ctrl: true }, 66), true)).toEqual({
      binding: "Ctrl-b",
    });
  });

  it("keeps Meta off macOS", () => {
    expect(recordedKey(press("b", { meta: true }, 66), false)).toEqual({
      binding: "Meta-b",
    });
  });

  it("writes the key a layout gives, not where it is", () => {
    // Ctrl+Shift+Z on a German keyboard, where Z is where Y is in English
    expect(
      recordedKey(press("Z", { ctrl: true, shift: true }, 90), false),
    ).toEqual({ binding: "Mod-Shift-z" });
  });

  it("writes the key under a character Shift or Option types", () => {
    expect(
      recordedKey(press("@", { ctrl: true, shift: true }, 50), false),
    ).toEqual({ binding: "Mod-Shift-2" });
    expect(
      recordedKey(press("π", { meta: true, alt: true }, 80), true),
    ).toEqual({ binding: "Mod-Alt-p" });
  });

  it("takes an F key on its own", () => {
    expect(recordedKey(press("F7", {}, 118), false)).toEqual({ binding: "F7" });
    expect(recordedKey(press("F7", { shift: true }, 118), false)).toEqual({
      binding: "Shift-F7",
    });
  });

  it("asks for a modifier with any other key", () => {
    expect(recordedKey(press("b", {}, 66), false)).toEqual({
      error: "Use Ctrl or Alt with a key, or an F key.",
    });
    expect(recordedKey(press("B", { shift: true }, 66), true)).toEqual({
      error: "Use ⌘, ⌃ or ⌥ with a key, or an F key.",
    });
  });

  it("waits past a modifier on its own", () => {
    expect(
      recordedKey(press("Control", { ctrl: true }), false),
    ).toBeUndefined();
    expect(recordedKey(press("Shift", { shift: true }), false)).toBeUndefined();
  });

  it("cancels on Esc and removes on Backspace", () => {
    expect(recordedKey(press("Escape"), false)).toBe("cancel");
    expect(recordedKey(press("Backspace"), false)).toBe("remove");
    // with a modifier, they are keys like any other
    expect(recordedKey(press("Backspace", { alt: true }, 8), false)).toEqual({
      binding: "Alt-Backspace",
    });
  });
});

describe("refusal", () => {
  it.each([
    ["Mod-a", "selects all everywhere"],
    ["Mod-c", "copies everywhere"],
    ["Mod-v", "pastes everywhere"],
    ["Mod-x", "cuts everywhere"],
    ["Mod-Backspace", "deletes a word"],
    ["Mod-Delete", "deletes a word"],
    ["Ctrl-PageDown", "switches tabs"],
    ["Alt-F4", "closes the window"],
  ])("refuses %s, which %s", (binding, does) => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("Linux x86_64");
    expect(refusal(binding, C.FILE_SAVE, false)).toMatch(
      new RegExp(`${does}\\. Choose another\\.$`),
    );
  });

  it("names the key as the platform writes it", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("Linux x86_64");
    expect(refusal("Mod-c", C.FILE_SAVE, false)).toBe(
      "Ctrl+C copies everywhere. Choose another.",
    );
  });

  it("leaves the tabs their own fixed keys", () => {
    expect(refusal("Ctrl-PageDown", C.TAB_NEXT, false)).toBeUndefined();
    expect(refusal("Ctrl-PageUp", C.TAB_PREVIOUS, false)).toBeUndefined();
  });

  it("refuses the text keys of macOS there only", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    expect(refusal("Ctrl-e", C.FILE_SAVE, true)).toMatch(/moves or deletes/);
    expect(refusal("Ctrl-e", C.FILE_SAVE, false)).toBeUndefined();
    expect(refusal("Alt-F4", C.FILE_SAVE, true)).toBeUndefined();
  });

  it("refuses Option with a letter or digit on macOS", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    expect(refusal("Alt-e", C.FILE_SAVE, true)).toBe(
      "⌥E types a character. Add ⌘ or ⌃.",
    );
    expect(refusal("Alt-Shift-2", C.FILE_SAVE, true)).toMatch(/types a/);
    // with Cmd, or off macOS, where Alt types nothing
    expect(refusal("Mod-Alt-e", C.FILE_SAVE, true)).toBeUndefined();
    expect(refusal("Alt-e", C.FILE_SAVE, false)).toBeUndefined();
    expect(refusal("Alt-F2", C.FILE_SAVE, true)).toBeUndefined();
  });

  it("takes any other key", () => {
    expect(refusal("Mod-Alt-b", C.FILE_SAVE, false)).toBeUndefined();
    expect(refusal("Mod-Enter", C.FILE_SAVE, false)).toBeUndefined();
  });
});

describe("assign", () => {
  it("sets a key no other command has", () => {
    expect(assign(C.FILE_SAVE, "F9", keymap())).toEqual({
      changes: [{ path: ["keymap", "file.save"], value: "F9" }],
      message: expect.stringMatching(/^Shortcut of Save set to F9$/),
    });
  });

  it("asks before it takes the key of another command, then moves it", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("Linux x86_64");
    const first = assign(C.FILE_SAVE, "Mod-Alt-b", keymap());

    expect(first).toEqual({
      pending: { id: C.FILE_SAVE, binding: "Mod-Alt-b", other: C.INSERT_BLOCK },
      message:
        "Ctrl+Alt+B is used by Insert a block. Press it again to move it here.",
    });

    const second = assign(
      C.FILE_SAVE,
      "Alt-Mod-b",
      keymap(),
      "pending" in first ? first.pending : undefined,
    );
    expect(second).toEqual({
      changes: [
        { path: ["keymap", "file.save"], value: "Alt-Mod-b" },
        { path: ["keymap", "insert.block"], value: "" },
      ],
      message: expect.any(String),
    });
  });

  it("asks again for another key", () => {
    const first = assign(C.FILE_SAVE, "Mod-Alt-b", keymap());
    const pending = "pending" in first ? first.pending : undefined;

    expect(assign(C.FILE_SAVE, "Mod-t", keymap(), pending)).toHaveProperty(
      "pending.other",
      C.INSERT_TABLE,
    );
  });

  it("keeps a key the command has already", () => {
    expect(assign(C.FILE_SAVE, "Mod-s", keymap())).toHaveProperty("changes");
  });
});

describe("reset", () => {
  it("removes a changed key from blank.json", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("Linux x86_64");
    expect(reset(C.FILE_SAVE, keymap({ [C.FILE_SAVE]: "F9" }))).toEqual({
      changes: [{ path: ["keymap", "file.save"], value: undefined }],
      message: "Save reset to Ctrl+S",
    });
  });

  it("asks first when another command has the default now", () => {
    const changed = keymap({ [C.FILE_SAVE]: "", [C.EXPORT_PDF]: "Mod-s" });
    const first = reset(C.FILE_SAVE, changed);

    expect(first).toHaveProperty("pending.other", C.EXPORT_PDF);
    expect(
      reset(
        C.FILE_SAVE,
        changed,
        "pending" in first ? first.pending : undefined,
      ),
    ).toHaveProperty("changes", [
      { path: ["keymap", "file.save"], value: undefined },
      { path: ["keymap", "export.pdf"], value: "" },
    ]);
  });
});

describe("the list", () => {
  it("removes a key", () => {
    expect(remove(C.FILE_SAVE)).toEqual({
      changes: [{ path: ["keymap", "file.save"], value: "" }],
      message: "Shortcut of Save removed",
    });
  });

  it("shows a command without a key as None", () => {
    expect(shortcutText("")).toBe("None");
  });

  it("tells a changed key from the default however it's written", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("Linux x86_64");
    expect(isChanged(C.FILE_SAVE, keymap())).toBe(false);
    expect(isChanged(C.FILE_SAVE, keymap({ [C.FILE_SAVE]: "Ctrl-s" }))).toBe(
      false,
    );
    expect(isChanged(C.FILE_SAVE, keymap({ [C.FILE_SAVE]: "" }))).toBe(true);
    expect(isChanged(C.BLOCKTYPE_CODE_BLOCK, keymap())).toBe(false);
  });

  it("lists every command, the unbound ones too", () => {
    const ids = filterCommands("").map((info) => info.id);
    expect(new Set(ids)).toEqual(new Set(Object.keys(config.value.keymap)));
  });

  it("finds commands by label, group and alias", () => {
    expect(filterCommands("save").map((info) => info.id)).toContain(
      C.FILE_SAVE,
    );
    expect(filterCommands("preferences").map((info) => info.id)).toEqual([
      C.APP_SETTINGS,
    ]);
    expect(
      filterCommands("tools spell").every((info) => info.group === "Tools"),
    ).toBe(true);
  });
});
