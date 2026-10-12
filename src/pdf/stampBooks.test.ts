import { afterEach, describe, expect, it, vi } from "vitest";

import { announcement, stampBooks } from "../state";
import type { PdfTabDocument } from "./document";
import {
  canRedoStamps,
  canUndoStamps,
  changeStamps,
  forgetStamps,
  redoStamps,
  resetStampBooks,
  restoreStamps,
  stampsOf,
  undoStamps,
} from "./stampBooks";
import { releaseStamp } from "./stampEngine";
import { type Stamp, stampSpec } from "./stampModel";

vi.mock("./stampEngine", () => ({
  releaseStamp: vi.fn(async () => {}),
}));

const a4 = { width: 595, height: 842, rotation: 0 };

const stamp = (over: Partial<Stamp> = {}): Stamp => ({
  id: "s1",
  kind: "signature",
  page: 0,
  rect: [100, 100, 180, 60],
  natural: [180, 60],
  spec: stampSpec("signature"),
  ...over,
});

const doc = (sha256: string, pages: number): PdfTabDocument => ({
  path: "/docs/contract.pdf",
  opened: {
    sha256,
    pages: Array.from({ length: pages }, () => a4),
    repaired: false,
    encrypted: false,
  },
  problem: null,
  failedPages: [],
  signatures: null,
});

afterEach(() => {
  resetStampBooks();
  announcement.value = null;
});

describe("a tab's stamps", () => {
  it("change in steps that undo and redo", () => {
    changeStamps("t", [stamp()], { sha256: "abc" });
    changeStamps("t", [stamp({ rect: [0, 0, 180, 60] })]);
    expect(stampBooks.value.get("t")?.sha256).toBe("abc");
    expect(canUndoStamps("t")).toBe(true);
    expect(undoStamps("t")).toBe(true);
    expect(stampsOf("t")[0].rect[0]).toBe(100);
    expect(canRedoStamps("t")).toBe(true);
    expect(redoStamps("t")).toBe(true);
    expect(stampsOf("t")[0].rect[0]).toBe(0);
    expect(redoStamps("t")).toBe(false);
  });

  it("keep their history once all are undone, and none of another tab's", () => {
    changeStamps("t", [stamp()]);
    undoStamps("t");
    expect(stampsOf("t")).toEqual([]);
    expect(canRedoStamps("t")).toBe(true);
    expect(canUndoStamps("other")).toBe(false);
    expect(undoStamps("other")).toBe(false);
    expect(canUndoStamps(null)).toBe(false);
  });

  it("free the engines of looks no stamp has any more", () => {
    changeStamps("t", [stamp()]);
    forgetStamps("t");
    expect(stampBooks.value.has("t")).toBe(false);
    expect(releaseStamp).toHaveBeenCalledWith(stampSpec("signature"));
  });
});

describe("restoring a tab's stamps", () => {
  const stored = (sha256: string) => ({
    sha256,
    stamps: [stamp(), stamp({ id: "far", page: 4 })],
    fills: [] as { field: string; value: string | boolean }[],
    dismissed: [] as string[],
  });

  it("brings them back as they were on the same file", () => {
    restoreStamps("t", doc("abc", 5), stored("abc"));
    expect(stampsOf("t").map((s) => s.id)).toEqual(["s1", "far"]);
    // with no history
    expect(canUndoStamps("t")).toBe(false);
    expect(announcement.value).toBeNull();
  });

  it("drops those on pages a changed file no longer has, and says so", () => {
    restoreStamps("t", doc("new", 2), stored("abc"));
    expect(stampsOf("t").map((s) => s.id)).toEqual(["s1"]);
    expect(stampBooks.value.get("t")?.sha256).toBe("new");
    expect(announcement.value?.text).toBe(
      "contract.pdf changed since you last had it open; 1 stamp was on pages it no longer has",
    );
  });

  it("brings back the fills and dismissed places on the same file only", () => {
    const kept = {
      ...stored("abc"),
      fills: [{ field: "name", value: "Ada" }],
      dismissed: ["found:0:100:300"],
    };
    restoreStamps("t", doc("abc", 5), kept);
    expect(stampBooks.value.get("t")?.book.fills).toEqual(kept.fills);
    expect(stampBooks.value.get("t")?.book.dismissed).toEqual(kept.dismissed);
    restoreStamps("u", doc("new", 5), kept);
    expect(stampBooks.value.get("u")?.book.fills).toEqual([]);
    expect(stampBooks.value.get("u")?.book.dismissed).toEqual([]);
    expect(announcement.value?.text).toBe(
      "contract.pdf changed since you last had it open; its form is empty again",
    );
  });

  it("keeps them when the file went", () => {
    restoreStamps(
      "t",
      { ...doc("abc", 1), opened: null, problem: "missing" },
      stored("abc"),
    );
    expect(stampsOf("t")).toHaveLength(2);
  });

  it("restores only once, and never over stamps placed meanwhile", () => {
    restoreStamps("t", doc("abc", 5), null);
    restoreStamps("t", doc("abc", 5), stored("abc"));
    expect(stampsOf("t")).toEqual([]);
    changeStamps("u", [stamp({ id: "new" })]);
    restoreStamps("u", doc("abc", 5), stored("abc"));
    expect(stampsOf("u").map((s) => s.id)).toEqual(["new"]);
  });
});
