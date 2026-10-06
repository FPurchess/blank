import { afterEach, describe, expect, it } from "vitest";

import { CommandIdentifier as C } from "../config";
import {
  cleanRecentCommands,
  cleanRecentFiles,
  forgetFile,
  pushRecent,
  RECENT_COMMANDS,
  RECENT_FILES,
  recentCommands,
  recentFiles,
  recordCommand,
  rememberFile,
} from "./recent";

afterEach(() => {
  recentCommands.value = [];
  recentFiles.value = [];
});

describe("pushRecent", () => {
  it("puts an item first, once, and keeps at most `cap`", () => {
    expect(pushRecent([1, 2, 3], 3, 5)).toEqual([3, 1, 2]);
    expect(pushRecent([1, 2, 3], 4, 3)).toEqual([4, 1, 2]);
  });

  it("returns the same list when the item is first already", () => {
    const list = [1, 2];
    expect(pushRecent(list, 1, 5)).toBe(list);
  });
});

describe("recent commands", () => {
  const known = new Set<string>(Object.values(C));

  it("are remembered newest first, by key or not", () => {
    recordCommand(C.FILE_SAVE, true);
    recordCommand(C.EXPORT_PDF, false);
    recordCommand(C.FILE_SAVE, true);

    expect(recentCommands.value).toEqual([
      { id: C.FILE_SAVE, byKey: true },
      { id: C.EXPORT_PDF, byKey: false },
    ]);
  });

  it("keep a command once, as it ran last", () => {
    recordCommand(C.FILE_SAVE, true);
    recordCommand(C.FILE_SAVE, false);
    expect(recentCommands.value).toEqual([{ id: C.FILE_SAVE, byKey: false }]);
  });

  it("store nothing when the newest runs again", () => {
    recordCommand(C.UNDO, true);
    const list = recentCommands.value;
    recordCommand(C.UNDO, true);
    expect(recentCommands.value).toBe(list);
  });

  it("keep at most RECENT_COMMANDS", () => {
    for (const id of Object.values(C)) recordCommand(id, false);
    expect(recentCommands.value).toHaveLength(RECENT_COMMANDS);
  });

  it("drop stored entries Blank doesn't know", () => {
    expect(
      cleanRecentCommands(
        [
          { id: "gone", byKey: true },
          { id: C.FILE_NEW, byKey: false, extra: 1 },
          { id: C.FILE_OPEN },
          "file.save",
        ],
        known,
      ),
    ).toEqual([{ id: C.FILE_NEW, byKey: false }]);
    expect(cleanRecentCommands(null, known)).toEqual([]);
  });
});

describe("recent files", () => {
  it("are remembered newest first and forgotten one by one", () => {
    rememberFile("/a.md");
    rememberFile("/b.md");
    rememberFile("/a.md");
    expect(recentFiles.value).toEqual(["/a.md", "/b.md"]);

    forgetFile("/a.md");
    expect(recentFiles.value).toEqual(["/b.md"]);
    const list = recentFiles.value;
    forgetFile("/c.md");
    expect(recentFiles.value).toBe(list);
  });

  it("keep at most RECENT_FILES", () => {
    for (let i = 0; i < 15; i++) rememberFile(`/${i}.md`);
    expect(recentFiles.value).toHaveLength(RECENT_FILES);
    expect(recentFiles.value[0]).toBe("/14.md");
  });

  it("keep only paths from what was stored", () => {
    expect(cleanRecentFiles(["/a.md", 3, "", null])).toEqual(["/a.md"]);
    expect(cleanRecentFiles("x")).toEqual([]);
  });
});
