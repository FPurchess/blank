import { assert, describe, it, vi } from "vitest";
import { exists, readTextFile } from "@tauri-apps/plugin-fs";

import { bootConfig, CommandIdentifier, getKeyBinding } from "./config";

vi.mock("@tauri-apps/api", () => ({
  path: {
    appConfigDir: vi.fn(async () => "/config"),
    join: vi.fn(async (...parts: string[]) => parts.join("/")),
  },
}));

describe("config", () => {
  it("keeps default bindings missing from a partial user keymap", async () => {
    vi.mocked(exists).mockResolvedValue(true);
    vi.mocked(readTextFile).mockResolvedValue(
      JSON.stringify({ keymap: { [CommandIdentifier.FORMAT_BOLD]: "Mod-d" } }),
    );

    await bootConfig();

    assert.equal(getKeyBinding(CommandIdentifier.FORMAT_BOLD), "Mod-d");
    assert.equal(getKeyBinding(CommandIdentifier.FILE_SAVE), "Mod-s");
  });
});
