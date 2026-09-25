import { beforeEach, describe, expect, it, vi } from "vitest";
import { exists, readTextFile } from "@tauri-apps/plugin-fs";

import {
  bootConfig,
  CommandIdentifier,
  config,
  configInitialized,
  getKeyBinding,
} from "./config";
import { mockTauriPath } from "./test/tauri";

describe("config", () => {
  beforeEach(() => {
    configInitialized.value = false;
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
    expect(configInitialized.value).toBe(true);
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
    expect(configInitialized.value).toBe(true);
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
      expect(configInitialized.value).toBe(true);
    },
  );
});
