import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  exists,
  readTextFile,
  remove,
  rename,
  writeTextFile,
} from "@tauri-apps/plugin-fs";

import { savedMarks } from "../state";
import { mockTauriPath } from "../test/tauri";
import { forgetMark, loadMarks, resetMarks, saveMark } from "./marks";
import { readMark, type SavedMark } from "./profile";

const FILE = "/config/signing/signature.json";
const SAVED: SavedMark = {
  source: { kind: "draw", strokes: [[[1, 2, 0.5]]] },
  png: "data:image/png;base64,AAAA",
  width: 40,
  height: 20,
};

describe("the user's signature and initials", () => {
  beforeEach(() => {
    mockTauriPath();
    resetMarks();
  });

  it("are read from their files", async () => {
    vi.mocked(exists).mockResolvedValue(true);
    vi.mocked(readTextFile).mockResolvedValue(JSON.stringify(SAVED));
    expect(await readMark("signature")).toEqual(SAVED);
    expect(readTextFile).toHaveBeenCalledWith(FILE);
  });

  it("are none without a file, or with one that isn't theirs", async () => {
    vi.mocked(exists).mockResolvedValue(false);
    expect(await readMark("initials")).toBeNull();
    vi.mocked(exists).mockResolvedValue(true);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const text of [
      "not json",
      JSON.stringify({ ...SAVED, png: "https://example.org/a.png" }),
      JSON.stringify({
        ...SAVED,
        source: { kind: "type", text: "Ada", font: "Comic Sans" },
      }),
      JSON.stringify({ ...SAVED, width: 0 }),
    ]) {
      vi.mocked(readTextFile).mockResolvedValue(text);
      expect(await readMark("signature")).toBeNull();
    }
  });

  it("are saved whole and published, and can be forgotten", async () => {
    vi.mocked(exists).mockResolvedValue(false);
    await loadMarks();
    expect(savedMarks.value).toEqual({ signature: null, initials: null });

    await saveMark("signature", SAVED);
    expect(writeTextFile).toHaveBeenCalledWith(
      `${FILE}.tmp`,
      JSON.stringify(SAVED),
    );
    expect(rename).toHaveBeenCalledWith(`${FILE}.tmp`, FILE);
    expect(savedMarks.value?.signature).toEqual(SAVED);

    vi.mocked(exists).mockResolvedValue(true);
    await forgetMark("signature");
    expect(remove).toHaveBeenCalledWith(FILE);
    expect(savedMarks.value?.signature).toBeNull();
  });

  it("are read once, however often they're asked for", async () => {
    vi.mocked(exists).mockResolvedValue(false);
    await Promise.all([loadMarks(), loadMarks()]);
    expect(exists).toHaveBeenCalledTimes(2);
  });
});
