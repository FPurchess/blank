import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  exists,
  mkdir,
  readTextFile,
  rename,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";

import {
  bootConfig,
  CommandIdentifier,
  config,
  getKeyBinding,
  isRecord,
  saveDefaultPage,
  saveSettings,
} from "./config";
import { allMargins, DEFAULT_PAGE } from "./layout/settings";
import { mockTauriPath } from "./test/tauri";

describe("config", () => {
  beforeEach(() => {
    mockTauriPath({ appConfigDir: "/config" });
  });

  it("reads blank.json from the app config dir", async () => {
    vi.mocked(exists).mockResolvedValue(false);

    await bootConfig();

    expect(exists).toHaveBeenCalledWith("/config/blank.json");
  });

  it("uses the default bindings without a config file", async () => {
    vi.mocked(exists).mockResolvedValue(false);

    await bootConfig();

    expect(readTextFile).not.toHaveBeenCalled();
    expect(getKeyBinding(CommandIdentifier.FORMAT_BOLD)).toBe("Mod-b");
    expect(getKeyBinding(CommandIdentifier.FILE_SAVE)).toBe("Mod-s");
  });

  it("keeps default bindings missing from a partial user keymap", async () => {
    vi.mocked(exists).mockResolvedValue(true);
    vi.mocked(readTextFile).mockResolvedValue(
      JSON.stringify({ keymap: { [CommandIdentifier.FORMAT_BOLD]: "Mod-d" } }),
    );

    await bootConfig();

    expect(readTextFile).toHaveBeenCalledWith("/config/blank.json");
    expect(getKeyBinding(CommandIdentifier.FORMAT_BOLD)).toBe("Mod-d");
    expect(getKeyBinding(CommandIdentifier.FILE_SAVE)).toBe("Mod-s");
  });

  it("keeps all defaults for a config file without keymap", async () => {
    vi.mocked(exists).mockResolvedValue(true);
    vi.mocked(readTextFile).mockResolvedValue("{}");

    await bootConfig();

    expect(getKeyBinding(CommandIdentifier.FORMAT_BOLD)).toBe("Mod-b");
  });

  it("falls back to defaults when the config file can't be checked", async () => {
    const error = new Error("forbidden");
    vi.mocked(exists).mockRejectedValue(error);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await bootConfig();

    expect(warn).toHaveBeenCalledWith("failed to check for config file", error);
    expect(readTextFile).not.toHaveBeenCalled();
    expect(getKeyBinding(CommandIdentifier.FORMAT_BOLD)).toBe("Mod-b");
  });

  it.each([
    ["can't be read", () => Promise.reject(new Error("io")), expect.any(Error)],
    ["is invalid JSON", () => Promise.resolve("{ nope"), "it isn't valid JSON"],
  ])(
    "falls back to defaults when the config file %s",
    async (_, readResult, reason) => {
      vi.mocked(exists).mockResolvedValue(true);
      vi.mocked(readTextFile).mockImplementation(readResult);
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      await bootConfig();

      // the reason, never what the file says, which JSON's message quotes
      expect(consoleError).toHaveBeenCalledWith(
        "failed to read blank.json",
        reason,
      );
      expect(config.value.keymap[CommandIdentifier.FORMAT_BOLD]).toBe("Mod-b");
    },
  );

  describe("autocorrect", () => {
    it("turns everything on by default", async () => {
      vi.mocked(exists).mockResolvedValue(false);

      await bootConfig();

      expect(config.value.autocorrect).toEqual({
        arrows: true,
        dashes: true,
        symbols: true,
        formatting: true,
        links: true,
        quotes: true,
        capitalize: true,
        blocks: true,
        replace: { "*": {} },
      });
    });

    it("keeps defaults missing from a partial user config", async () => {
      vi.mocked(exists).mockResolvedValue(true);
      vi.mocked(readTextFile).mockResolvedValue(
        JSON.stringify({ autocorrect: { quotes: false } }),
      );

      await bootConfig();

      expect(config.value.autocorrect.quotes).toBe(false);
      expect(config.value.autocorrect.arrows).toBe(true);
      expect(config.value.autocorrect.replace).toEqual({ "*": {} });
    });

    it("merges the user's replacements per language", async () => {
      vi.mocked(exists).mockResolvedValue(true);
      vi.mocked(readTextFile).mockResolvedValue(
        JSON.stringify({
          autocorrect: {
            replace: { de: { mfg: "Mit freundlichen Grüßen" } },
          },
        }),
      );

      await bootConfig();

      expect(config.value.autocorrect.replace).toEqual({
        "*": {},
        de: { mfg: "Mit freundlichen Grüßen" },
      });
    });
  });

  describe("invalid settings", () => {
    /**
     * bootWith boots the config with `content` as blank.json
     */
    const bootWith = async (content: string) => {
      vi.mocked(exists).mockResolvedValue(true);
      vi.mocked(readTextFile).mockResolvedValue(content);
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(console, "error").mockImplementation(() => {});
      await bootConfig();
    };

    it.each(["null", "[]", '"text"', "42"])(
      "uses the defaults for a config file of %s",
      async (content) => {
        await bootWith(content);

        expect(getKeyBinding(CommandIdentifier.FORMAT_BOLD)).toBe("Mod-b");
        expect(config.value.autocorrect.replace).toEqual({ "*": {} });
      },
    );

    it("ignores a keymap and autocorrect that aren't objects", async () => {
      await bootWith(JSON.stringify({ keymap: "Mod-b", autocorrect: [true] }));

      expect(getKeyBinding(CommandIdentifier.FORMAT_BOLD)).toBe("Mod-b");
      expect(config.value.autocorrect.arrows).toBe(true);
      expect(sendNotification).toHaveBeenCalledOnce();
      expect(sendNotification).toHaveBeenCalledWith(
        "Ignored invalid settings in blank.json: keymap, autocorrect",
      );
    });

    it("only takes key bindings that are strings", async () => {
      await bootWith(
        JSON.stringify({
          keymap: {
            [CommandIdentifier.FORMAT_BOLD]: 42,
            [CommandIdentifier.FORMAT_ITALIC]: "Mod-j",
          },
        }),
      );

      expect(getKeyBinding(CommandIdentifier.FORMAT_BOLD)).toBe("Mod-b");
      expect(getKeyBinding(CommandIdentifier.FORMAT_ITALIC)).toBe("Mod-j");
      expect(sendNotification).toHaveBeenCalledWith(
        "Ignored invalid settings in blank.json: keymap.format.bold",
      );
    });

    it("reports bindings of commands it doesn't know, in the file's order", async () => {
      await bootWith(
        '{"keymap": {"format.bolt": "Mod-b", "format.bold": 42, ' +
          '"__proto__": "Mod-p", "toString": "Mod-t", "format.italic": "Mod-j"}}',
      );

      expect(getKeyBinding(CommandIdentifier.FORMAT_ITALIC)).toBe("Mod-j");
      expect(Object.keys(config.value.keymap)).not.toContain("format.bolt");
      expect(Object.hasOwn(config.value.keymap, "toString")).toBe(false);
      expect(Object.getPrototypeOf(config.value.keymap)).toBe(Object.prototype);
      expect(sendNotification).toHaveBeenCalledWith(
        "Ignored invalid settings in blank.json: keymap.format.bolt, " +
          "keymap.format.bold, keymap.__proto__, keymap.toString",
      );
    });

    it("keeps the default for autocorrect settings of the wrong type", async () => {
      await bootWith(
        JSON.stringify({
          autocorrect: { quotes: "false", arrows: false, unknown: 1 },
        }),
      );

      expect(config.value.autocorrect.quotes).toBe(true);
      expect(config.value.autocorrect.arrows).toBe(false);
      expect(config.value.autocorrect).not.toHaveProperty("unknown");
      expect(sendNotification).toHaveBeenCalledWith(
        "Ignored invalid settings in blank.json: autocorrect.quotes",
      );
    });

    it("ignores replacements that aren't an object", async () => {
      await bootWith(JSON.stringify({ autocorrect: { replace: null } }));

      expect(config.value.autocorrect.replace).toEqual({ "*": {} });
      expect(sendNotification).toHaveBeenCalledWith(
        "Ignored invalid settings in blank.json: autocorrect.replace",
      );
    });

    it("ignores languages whose replacements aren't all strings", async () => {
      await bootWith(
        JSON.stringify({
          autocorrect: {
            replace: {
              de: { mfg: "Mit freundlichen Grüßen" },
              fr: "nope",
              it: { ok: "ok", bad: 1 },
            },
          },
        }),
      );

      expect(config.value.autocorrect.replace).toEqual({
        "*": {},
        de: { mfg: "Mit freundlichen Grüßen" },
      });
      expect(sendNotification).toHaveBeenCalledOnce();
      expect(sendNotification).toHaveBeenCalledWith(
        "Ignored invalid settings in blank.json: autocorrect.replace.fr, autocorrect.replace.it",
      );
    });

    it("can't replace the prototype of the replacements", async () => {
      await bootWith(
        '{"autocorrect":{"replace":{"__proto__":{"polluted":"yes"}}}}',
      );

      const replace = config.value.autocorrect.replace;
      expect(Object.getPrototypeOf(replace)).toBe(Object.prototype);
      expect(replace).toEqual({ "*": {} });
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it("doesn't notify for a valid config", async () => {
      await bootWith(
        JSON.stringify({
          keymap: { [CommandIdentifier.FORMAT_BOLD]: "Mod-d" },
          autocorrect: { quotes: false, replace: { "*": { a: "b" } } },
        }),
      );

      expect(sendNotification).not.toHaveBeenCalled();
    });
  });

  it.each([
    [{}, true],
    [{ a: 1 }, true],
    [null, false],
    [[], false],
    ["text", false],
    [1, false],
    [undefined, false],
  ])("isRecord(%j) is %s", (value, expected) => {
    expect(isRecord(value)).toBe(expected);
  });

  it("binds insert.image to Mod-Alt-i by default", async () => {
    vi.mocked(exists).mockResolvedValue(false);

    await bootConfig();

    expect(getKeyBinding(CommandIdentifier.INSERT_IMAGE)).toBe("Mod-Alt-i");
  });

  it("binds export.docx to Mod-Alt-w by default", async () => {
    vi.mocked(exists).mockResolvedValue(false);

    await bootConfig();

    expect(getKeyBinding(CommandIdentifier.EXPORT_DOCX)).toBe("Mod-Alt-w");
  });

  describe("editor", () => {
    it("indents code blocks by 4 spaces by default", async () => {
      vi.mocked(exists).mockResolvedValue(false);
      await bootConfig();
      expect(config.value.editor).toEqual({ indentSize: 4 });
    });

    it("takes the user's indent size", async () => {
      vi.mocked(exists).mockResolvedValue(true);
      vi.mocked(readTextFile).mockResolvedValue(
        JSON.stringify({ editor: { indentSize: 2 } }),
      );
      await bootConfig();
      expect(config.value.editor.indentSize).toBe(2);
    });

    it.each([0, 17, 2.5, "2", null])(
      "keeps the default for the indent size %j",
      async (size) => {
        vi.mocked(exists).mockResolvedValue(true);
        vi.mocked(readTextFile).mockResolvedValue(
          JSON.stringify({ editor: { indentSize: size } }),
        );
        vi.spyOn(console, "warn").mockImplementation(() => {});
        await bootConfig();
        expect(config.value.editor.indentSize).toBe(4);
        expect(sendNotification).toHaveBeenCalledWith(
          "Ignored invalid settings in blank.json: editor.indentSize",
        );
      },
    );

    it("ignores editor settings that aren't an object", async () => {
      vi.mocked(exists).mockResolvedValue(true);
      vi.mocked(readTextFile).mockResolvedValue(JSON.stringify({ editor: 4 }));
      vi.spyOn(console, "warn").mockImplementation(() => {});
      await bootConfig();
      expect(config.value.editor.indentSize).toBe(4);
      expect(sendNotification).toHaveBeenCalledWith(
        "Ignored invalid settings in blank.json: editor",
      );
    });
  });

  describe("spellcheck", () => {
    it("leaves words in capitals and with digits alone by default", async () => {
      vi.mocked(exists).mockResolvedValue(false);

      await bootConfig();

      expect(config.value.spellcheck).toEqual({
        ignoreUppercase: true,
        ignoreWordsWithNumbers: true,
      });
    });

    it("keeps defaults missing from a partial user config", async () => {
      vi.mocked(exists).mockResolvedValue(true);
      vi.mocked(readTextFile).mockResolvedValue(
        JSON.stringify({ spellcheck: { ignoreUppercase: false } }),
      );

      await bootConfig();

      expect(config.value.spellcheck).toEqual({
        ignoreUppercase: false,
        ignoreWordsWithNumbers: true,
      });
    });

    it("keeps the defaults for settings of the wrong type", async () => {
      vi.mocked(exists).mockResolvedValue(true);
      vi.mocked(readTextFile).mockResolvedValue(
        JSON.stringify({
          spellcheck: { ignoreUppercase: "no", ignoreWordsWithNumbers: false },
        }),
      );
      vi.spyOn(console, "warn").mockImplementation(() => {});

      await bootConfig();

      expect(config.value.spellcheck).toEqual({
        ignoreUppercase: true,
        ignoreWordsWithNumbers: false,
      });
      expect(sendNotification).toHaveBeenCalledWith(
        "Ignored invalid settings in blank.json: spellcheck.ignoreUppercase",
      );
    });

    it("ignores spell check settings that aren't an object", async () => {
      vi.mocked(exists).mockResolvedValue(true);
      vi.mocked(readTextFile).mockResolvedValue(
        JSON.stringify({ spellcheck: true, unknown: 1 }),
      );
      vi.spyOn(console, "warn").mockImplementation(() => {});

      await bootConfig();

      expect(config.value.spellcheck.ignoreUppercase).toBe(true);
      expect(sendNotification).toHaveBeenCalledWith(
        "Ignored invalid settings in blank.json: spellcheck",
      );
    });
  });

  describe("layout", () => {
    it("lays out on the paper of the region with 2.5 cm margins", async () => {
      vi.mocked(exists).mockResolvedValue(false);

      await bootConfig();

      expect(config.value.layout.page).toEqual(DEFAULT_PAGE);
    });

    it("reads the user's page setup over Blank's", async () => {
      vi.mocked(exists).mockResolvedValue(true);
      vi.mocked(readTextFile).mockResolvedValue(
        JSON.stringify({
          layout: { page: { size: "letter", margins: "1in" } },
        }),
      );

      await bootConfig();

      expect(config.value.layout.page).toEqual({
        ...DEFAULT_PAGE,
        size: "letter",
        margins: allMargins(72),
      });
    });

    it.each([
      [{ layout: { page: { size: "a2" } } }, "layout.page.size"],
      [{ layout: { page: "a4" } }, "layout.page"],
      [{ layout: [] }, "layout"],
    ])("ignores %j", async (user, problem) => {
      vi.mocked(exists).mockResolvedValue(true);
      vi.mocked(readTextFile).mockResolvedValue(JSON.stringify(user));
      vi.spyOn(console, "warn").mockImplementation(() => {});

      await bootConfig();

      expect(config.value.layout.page).toEqual(DEFAULT_PAGE);
      expect(sendNotification).toHaveBeenCalledWith(
        `Ignored invalid settings in blank.json: ${problem}`,
      );
    });
  });

  describe("saveDefaultPage", () => {
    const page = {
      ...DEFAULT_PAGE,
      size: "a5" as const,
      margins: allMargins(72),
    };

    it("writes the page setup and keeps the other settings", async () => {
      vi.mocked(exists).mockResolvedValue(true);
      vi.mocked(readTextFile).mockResolvedValue(
        JSON.stringify({ keymap: { undo: "Mod-u" }, layout: { other: 1 } }),
      );

      await saveDefaultPage(page, "in");

      expect(mkdir).toHaveBeenCalledWith("/config", { recursive: true });
      const [file, written] = vi.mocked(writeTextFile).mock.calls[0];
      expect(file).toBe("/config/blank.json.tmp");
      expect(rename).toHaveBeenCalledWith(
        "/config/blank.json.tmp",
        "/config/blank.json",
      );
      expect(JSON.parse(written as string)).toEqual({
        keymap: { undo: "Mod-u" },
        layout: {
          other: 1,
          // only what differs from Blank's defaults
          page: { size: "a5", margins: "1in" },
        },
      });
      expect(config.value.layout.page).toEqual(page);
    });

    it("creates blank.json", async () => {
      vi.mocked(exists).mockResolvedValue(false);

      await saveDefaultPage(page, "cm");

      const [, written] = vi.mocked(writeTextFile).mock.calls[0];
      expect(JSON.parse(written as string)).toEqual({
        layout: {
          page: { size: "a5", margins: "2.54cm" },
        },
      });
    });

    it.each([["not json"], ["[1]"]])(
      "doesn't overwrite a blank.json it can't read: %s",
      async (content) => {
        vi.mocked(exists).mockResolvedValue(true);
        vi.mocked(readTextFile).mockResolvedValue(content);

        await expect(saveDefaultPage(page, "cm")).rejects.toThrow();
        expect(writeTextFile).not.toHaveBeenCalled();
        // the page setup reports it itself
        expect(sendNotification).not.toHaveBeenCalled();
      },
    );

    it("leaves out a default page", async () => {
      vi.mocked(exists).mockResolvedValue(true);
      vi.mocked(readTextFile).mockResolvedValue(
        JSON.stringify({ layout: { page: { size: "a5" } } }),
      );

      await saveDefaultPage(DEFAULT_PAGE, "cm");

      const [, written] = vi.mocked(writeTextFile).mock.calls[0];
      expect(JSON.parse(written as string)).toEqual({});
      expect(config.value.layout.page).toEqual(DEFAULT_PAGE);
    });
  });

  describe("saveSettings", () => {
    // what blank.json holds, as the mocked file system reads and writes it
    let file: string | null;
    const written = () => JSON.parse(file!);

    beforeEach(async () => {
      file = null;
      vi.mocked(exists).mockImplementation(async () => file !== null);
      vi.mocked(readTextFile).mockImplementation(async () => file!);
      let pending = "";
      vi.mocked(writeTextFile).mockImplementation(async (_path, content) => {
        pending = content as string;
      });
      vi.mocked(rename).mockImplementation(async () => {
        file = pending;
      });
      await bootConfig();
    });

    it("sets a setting and applies it at once", async () => {
      expect(
        await saveSettings([{ path: ["autocorrect", "dashes"], value: false }]),
      ).toBe(true);

      expect(written()).toEqual({ autocorrect: { dashes: false } });
      expect(config.value.autocorrect.dashes).toBe(false);
    });

    it("keeps the other settings, also those it doesn't know", async () => {
      file = JSON.stringify({ editor: { indentSize: 2 }, mine: [1] });

      await saveSettings([
        { path: ["spellcheck", "ignoreUppercase"], value: false },
      ]);

      expect(written()).toEqual({
        editor: { indentSize: 2 },
        mine: [1],
        spellcheck: { ignoreUppercase: false },
      });
    });

    it("leaves out a default and the sections left empty", async () => {
      file = JSON.stringify({ autocorrect: { dashes: false }, editor: {} });

      await saveSettings([{ path: ["autocorrect", "dashes"], value: true }]);

      expect(written()).toEqual({ editor: {} });
      expect(config.value.autocorrect.dashes).toBe(true);
    });

    it("removes a setting without a value", async () => {
      file = JSON.stringify({ keymap: { "file.save": "Mod-b", undo: "F2" } });

      await saveSettings([{ path: ["keymap", "file.save"] }]);

      expect(written()).toEqual({ keymap: { undo: "F2" } });
      expect(getKeyBinding(CommandIdentifier.FILE_SAVE)).toBe("Mod-s");
    });

    it("leaves out a default key however it's written", async () => {
      vi.spyOn(navigator, "platform", "get").mockReturnValue("Linux x86_64");

      await saveSettings([
        { path: ["keymap", "tab.next"], value: "Mod-Tab" },
        { path: ["keymap", "file.save"], value: "Shift-Mod-S" },
      ]);

      // Ctrl-Tab is Mod-Tab on Linux, but Shift-Mod-S isn't Mod-s
      expect(written()).toEqual({ keymap: { "file.save": "Shift-Mod-S" } });
    });

    it("keeps a removed shortcut, which isn't the default", async () => {
      await saveSettings([{ path: ["keymap", "file.save"], value: "" }]);

      expect(written()).toEqual({ keymap: { "file.save": "" } });
      expect(getKeyBinding(CommandIdentifier.FILE_SAVE)).toBe("");
    });

    it("builds changes on what the file holds", async () => {
      file = JSON.stringify({ autocorrect: { replace: { de: { a: "b" } } } });

      await saveSettings((settings) => [
        {
          path: ["autocorrect", "replace", "de"],
          value: {
            // @ts-expect-error -- the test knows the file
            ...settings.autocorrect.replace.de,
            c: "d",
          },
        },
      ]);

      expect(written().autocorrect.replace.de).toEqual({ a: "b", c: "d" });
    });

    it("removes a scope of replacements left empty", async () => {
      file = JSON.stringify({ autocorrect: { replace: { de: { a: "b" } } } });

      await saveSettings([
        { path: ["autocorrect", "replace", "de"], value: {} },
      ]);

      expect(written()).toEqual({});
    });

    it.each([["not json"], ["[1]"], ["3"]])(
      "leaves a file alone that holds no settings: %s",
      async (content) => {
        file = content;

        expect(
          await saveSettings([{ path: ["editor", "indentSize"], value: 2 }]),
        ).toBe(false);

        expect(writeTextFile).not.toHaveBeenCalled();
        expect(sendNotification).toHaveBeenCalledOnce();
        expect(config.value.editor.indentSize).toBe(4);
      },
    );

    it("reports a failed write", async () => {
      vi.mocked(rename).mockRejectedValue(new Error("disk full"));

      expect(
        await saveSettings([{ path: ["editor", "indentSize"], value: 2 }]),
      ).toBe(false);
      expect(sendNotification).toHaveBeenCalledWith(
        expect.stringContaining("disk full"),
      );
      expect(config.value.editor.indentSize).toBe(4);
    });

    it("reports a change that fails, and goes on with the next", async () => {
      expect(
        await saveSettings(() => {
          throw new Error("broken");
        }),
      ).toBe(false);
      expect(sendNotification).toHaveBeenCalledWith(
        "Blank couldn't save blank.json: broken",
      );

      expect(
        await saveSettings([{ path: ["editor", "indentSize"], value: 2 }]),
      ).toBe(true);
    });

    it("applies what was written by hand, and tells what it can't use", async () => {
      file = JSON.stringify({
        editor: { indentSize: 99 },
        keymap: { undo: "F2" },
      });

      await saveSettings([{ path: ["autocorrect", "dashes"], value: false }]);

      expect(getKeyBinding(CommandIdentifier.UNDO)).toBe("F2");
      expect(sendNotification).toHaveBeenCalledWith(
        "Ignored invalid settings in blank.json: editor.indentSize",
      );
    });

    it("tells the page setup what went wrong", async () => {
      vi.mocked(rename).mockRejectedValue(new Error("disk full"));

      await expect(saveDefaultPage(DEFAULT_PAGE, "cm")).rejects.toThrow(
        "Blank couldn't save blank.json: disk full",
      );
    });

    it("writes one change after the other", async () => {
      const first = saveSettings([
        { path: ["autocorrect", "dashes"], value: false },
      ]);
      const second = saveSettings([
        { path: ["autocorrect", "arrows"], value: false },
      ]);

      await Promise.all([first, second]);

      expect(written()).toEqual({
        autocorrect: { dashes: false, arrows: false },
      });
    });

    it("keeps the sections that didn't change", async () => {
      const { keymap, layout, editor } = config.value;

      await saveSettings([{ path: ["autocorrect", "dashes"], value: false }]);

      expect(config.value.keymap).toBe(keymap);
      expect(config.value.layout).toBe(layout);
      expect(config.value.editor).toBe(editor);
    });

    it("ignores a path through __proto__", async () => {
      await saveSettings([{ path: ["__proto__", "polluted"], value: true }]);

      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });
  });

  describe("focusMode.hideAfter", () => {
    it.each([0, 10, 60])("reads %s seconds", async (seconds) => {
      vi.mocked(exists).mockResolvedValue(true);
      vi.mocked(readTextFile).mockResolvedValue(
        JSON.stringify({ focusMode: { hideAfter: seconds } }),
      );

      await bootConfig();

      expect(config.value.focusMode.hideAfter).toBe(seconds);
      expect(sendNotification).not.toHaveBeenCalled();
    });

    it.each([[61], [2.5], ["3"], [-1]])(
      "ignores %s with a notification",
      async (seconds) => {
        vi.mocked(exists).mockResolvedValue(true);
        vi.mocked(readTextFile).mockResolvedValue(
          JSON.stringify({ focusMode: { hideAfter: seconds } }),
        );

        await bootConfig();

        expect(config.value.focusMode.hideAfter).toBe(3);
        expect(sendNotification).toHaveBeenCalledWith(
          expect.stringContaining("focusMode.hideAfter"),
        );
      },
    );

    it("ignores a section that isn't one", async () => {
      vi.mocked(exists).mockResolvedValue(true);
      vi.mocked(readTextFile).mockResolvedValue(
        JSON.stringify({ focusMode: 3 }),
      );

      await bootConfig();

      expect(config.value.focusMode.hideAfter).toBe(3);
      expect(sendNotification).toHaveBeenCalledWith(
        expect.stringContaining("focusMode"),
      );
    });
  });

  it("binds language.choose to Mod-Alt-l by default", async () => {
    vi.mocked(exists).mockResolvedValue(false);

    await bootConfig();

    expect(getKeyBinding(CommandIdentifier.LANGUAGE_CHOOSE)).toBe("Mod-Alt-l");
  });
});
