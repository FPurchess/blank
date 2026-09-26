import { beforeEach, describe, expect, it, vi } from "vitest";
import { exists, readTextFile } from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";

import {
  bootConfig,
  CommandIdentifier,
  config,
  getKeyBinding,
  isRecord,
} from "./config";
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
    ["can't be read", () => Promise.reject(new Error("io"))],
    ["is invalid JSON", () => Promise.resolve("{ nope")],
  ])(
    "falls back to defaults when the config file %s",
    async (_, readResult) => {
      vi.mocked(exists).mockResolvedValue(true);
      vi.mocked(readTextFile).mockImplementation(readResult);
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      await bootConfig();

      expect(consoleError).toHaveBeenCalledWith(
        "failed to read config file",
        expect.any(Error),
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

  it("binds language.choose to Mod-Alt-l by default", async () => {
    vi.mocked(exists).mockResolvedValue(false);

    await bootConfig();

    expect(getKeyBinding(CommandIdentifier.LANGUAGE_CHOOSE)).toBe("Mod-Alt-l");
  });
});
