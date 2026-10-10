import { describe, expect, it, vi } from "vitest";
import { exists } from "@tauri-apps/plugin-fs";

import {
  openPdfDocument,
  problemOf,
  problemText,
  withFailedPage,
  withRenderFailure,
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
    expect(problemOf("crashed")).toBe("stopped");
    expect(problemOf("tooComplex")).toBe("tooComplex");
    expect(problemOf("timedOut")).toBe("tooComplex");
    expect(problemOf("source")).toBe("unreadable");
    expect(problemOf("start")).toBe("start");
    expect(problemText("tooComplex", "/big.pdf").title).toBe(
      "big.pdf is too large or complex",
    );
    expect(problemText("stopped", "/a.pdf").title).toBe(
      "Blank's PDF viewer stopped while it opened a.pdf",
    );
  });

  it("doesn't log a PDF whose tab closed while it opened", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(exists).mockResolvedValue(true);
    vi.mocked(openPdf).mockRejectedValue("closed");
    await openPdfDocument("t", "/a.pdf");
    expect(warn).not.toHaveBeenCalled();
  });

  it("shows why instead of the pages once a file it reads again went or changed", () => {
    const doc = {
      path: "/a.pdf",
      opened,
      problem: null,
      failedPages: [],
      signatures: null,
    };
    expect(withRenderFailure(doc, 1, "engine").failedPages).toEqual([1]);
    expect(withRenderFailure(doc, 1, "changed")).toMatchObject({
      opened: null,
      problem: "changed",
    });
    expect(withRenderFailure(doc, 1, "missing").problem).toBe("missing");
    expect(withRenderFailure(doc, 1, "failed").problem).toBe("failed");
    expect(withRenderFailure(doc, 1, "closed")).toBe(doc);
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
