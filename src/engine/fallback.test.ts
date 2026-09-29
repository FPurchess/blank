import { invoke } from "@tauri-apps/api/core";
import { readFile } from "@tauri-apps/plugin-fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fallbackFonts,
  findFonts,
  forgetFallbacks,
  missingOf,
} from "./fallback";
import { EMOJI_FAMILY } from "./fonts";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("fallback fonts", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))),
    );
    vi.mocked(invoke).mockResolvedValue([
      { family: "Noto Sans CJK SC", path: "/fonts/cjk-regular.ttc" },
      { family: "Noto Sans CJK SC", path: "/fonts/cjk-bold.ttc" },
    ]);
    vi.mocked(readFile).mockResolvedValue(new Uint8Array([4, 5]));
  });

  afterEach(() => {
    forgetFallbacks();
    vi.unstubAllGlobals();
  });

  it("tells emoji apart from other characters", () => {
    expect(missingOf("😀中🎉")).toEqual({
      emoji: ["😀", "🎉"],
      other: ["中"],
    });
  });

  it("loads the emoji font and the system's fonts, once", async () => {
    const found = await findFonts("😀中", "zh");
    expect(found.map((font) => font.family)).toEqual([
      EMOJI_FAMILY,
      "Noto Sans CJK SC",
      "Noto Sans CJK SC",
    ]);
    expect(invoke).toHaveBeenCalledWith("fallback_fonts", {
      text: "中",
      language: "zh",
    });
    expect(readFile).toHaveBeenCalledWith("/fonts/cjk-bold.ttc");
    expect(fallbackFonts.value).toHaveLength(3);
    // asked before: nothing more to load
    expect(await findFonts("😀中", "zh")).toEqual([]);
    // another emoji uses the font loaded
    expect(await findFonts("👍", "zh")).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("goes on without what it can't find or read", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("no fonts"));
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await findFonts("😀中", "en")).toEqual([]);
    expect(fallbackFonts.value).toEqual([]);
  });
});
