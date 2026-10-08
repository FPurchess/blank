import { describe, expect, it, vi } from "vitest";
import { exists } from "@tauri-apps/plugin-fs";

import {
  openPdfDocument,
  problemOf,
  problemText,
  withFailedPage,
} from "./document";
import { openPdf } from "./ipc";

vi.mock("./ipc", async (original) => ({
  ...(await original<typeof import("./ipc")>()),
  openPdf: vi.fn(),
}));

const opened = {
  sha256: "abc",
  pages: [{ width: 595, height: 842, rotation: 0 }],
  repaired: false,
  encrypted: false,
};

describe("a PDF tab's document", () => {
  it("opens the PDF", async () => {
    vi.mocked(exists).mockResolvedValue(true);
    vi.mocked(openPdf).mockResolvedValue(opened);

    expect(await openPdfDocument("t", "/a.pdf")).toEqual({
      path: "/a.pdf",
      opened,
      problem: null,
      failedPages: [],
      signatures: null,
    });
    expect(openPdf).toHaveBeenCalledWith("t", "/a.pdf");
  });

  it("tells why it can't, and logs only the kind", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(exists).mockResolvedValue(false);
    expect((await openPdfDocument("t", "/gone.pdf")).problem).toBe("missing");

    vi.mocked(exists).mockResolvedValue(true);
    vi.mocked(openPdf).mockRejectedValue("needsPassword");
    expect((await openPdfDocument("t", "/a.pdf")).problem).toBe(
      "needsPassword",
    );
    expect(warn).toHaveBeenCalledWith("failed to open a PDF", "needsPassword");
  });

  it("names the problems of the helper's failures", () => {
    expect(problemOf("damaged")).toBe("damaged");
    expect(problemOf("engine")).toBe("damaged");
    expect(problemOf("crashed")).toBe("failed");
    expect(problemOf("source")).toBe("unreadable");
    expect(problemOf("start")).toBe("start");
  });

  it("says why in words, with Find it… for a file that went", () => {
    expect(problemText("missing", "/docs/contract.pdf")).toEqual({
      title: "contract.pdf was moved or deleted",
      reason: "Blank can't find it where it was.",
      find: true,
    });
    expect(problemText("failed", "/a.pdf")).toMatchObject({
      title: "Blank can't show this PDF any more",
      find: false,
    });
  });

  it("keeps the pages it couldn't draw once each", () => {
    const doc = {
      path: "/a.pdf",
      opened,
      problem: null,
      failedPages: [],
      signatures: null,
    };
    const failed = withFailedPage(withFailedPage(doc, 2), 2);
    expect(failed.failedPages).toEqual([2]);
    expect(withFailedPage(failed, 2)).toBe(failed);
  });
});
