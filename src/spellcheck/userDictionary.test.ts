import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  exists,
  mkdir,
  readTextFile,
  rename,
  writeTextFile,
} from "@tauri-apps/plugin-fs";

import { mockTauriPath } from "../test/tauri";
import { dictionaryKey, forms, readWords, writeWords } from "./userDictionary";

const FILE = "/config/dictionaries/de.txt";

describe("userDictionary", () => {
  beforeEach(() => {
    mockTauriPath();
  });

  it.each([
    ["de", "de"],
    ["de-CH", "de"],
    ["sr-Latn", "sr"],
    ["nb", "no"],
    ["no", "no"],
  ])("keeps the words of %j in %j", (tag, key) => {
    expect(dictionaryKey(tag)).toBe(key);
  });

  it("reads one word per line", async () => {
    vi.mocked(exists).mockResolvedValue(true);
    vi.mocked(readTextFile).mockResolvedValue("Blank\r\n\n  Kubernetes \n");

    expect(await readWords("de")).toEqual(["Blank", "Kubernetes"]);
    expect(readTextFile).toHaveBeenCalledWith(FILE);
  });

  it("starts empty without a file", async () => {
    vi.mocked(exists).mockResolvedValue(false);

    expect(await readWords("de")).toEqual([]);
    expect(readTextFile).not.toHaveBeenCalled();
  });

  it("reports a file that can't be read", async () => {
    vi.mocked(exists).mockResolvedValue(true);
    vi.mocked(readTextFile).mockRejectedValue(new Error("denied"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await readWords("de")).toBeUndefined();
  });

  it("writes the words sorted and once, replacing the file as a whole", async () => {
    await writeWords("de", ["tree", "Blank", "tree"]);

    expect(mkdir).toHaveBeenCalledWith("/config/dictionaries", {
      recursive: true,
    });
    expect(writeTextFile).toHaveBeenCalledWith(`${FILE}.tmp`, "Blank\ntree\n");
    expect(rename).toHaveBeenCalledWith(`${FILE}.tmp`, FILE);
    expect(vi.mocked(writeTextFile).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(rename).mock.invocationCallOrder[0],
    );
  });

  it("writes an empty file without words", async () => {
    await writeWords("de", []);

    expect(writeTextFile).toHaveBeenCalledWith(`${FILE}.tmp`, "");
  });

  it.each([
    ["blank", ["blank", "Blank", "BLANK"]],
    ["Kubernetes", ["Kubernetes", "KUBERNETES"]],
    ["iPhone", ["iPhone", "IPHONE"]],
  ])("accepts %j as %j", (entry, expected) => {
    expect(forms(entry)).toEqual(expected);
  });
});
