import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cancelRender, renderPage } from "../pdf/ipc";
import type { PdfTabDocument } from "../pdf/document";
import {
  activeTabId,
  announcement,
  pdfPageInView,
  shownPdf,
  tabs,
} from "../state";
import { flushPromises } from "../test/async";
import { createTestHandle } from "../test/editor";
import { bootApp } from "./mount";
import { pdfBitmaps } from "./pageBitmaps";

vi.mock("../pdf/ipc", async (original) => ({
  ...(await original<typeof import("../pdf/ipc")>()),
  renderPage: vi.fn(),
  cancelRender: vi.fn(),
}));

const a4 = { width: 595, height: 842, rotation: 0 };

const pdf = (change: Partial<PdfTabDocument> = {}): PdfTabDocument => ({
  path: "/docs/contract.pdf",
  opened: {
    sha256: "abc",
    pages: [a4, a4, a4],
    repaired: false,
    encrypted: false,
  },
  problem: null,
  failedPages: [],
  signatures: [],
  ...change,
});

const view = () => document.getElementById("pdf-view");

describe("the page view of PDFs", () => {
  let dispose = () => {};

  beforeEach(() => {
    tabs.value = [
      {
        id: "t",
        kind: "pdf",
        path: "/docs/contract.pdf",
        importedFrom: null,
        untitledNumber: null,
        unsaved: false,
        viewAnchor: null,
      },
    ];
    activeTabId.value = "t";
    vi.mocked(cancelRender).mockResolvedValue();
    vi.mocked(renderPage).mockImplementation(async () => ({
      width: 2,
      height: 2,
      pixels: new Uint8ClampedArray(16),
    }));
    vi.stubGlobal(
      "ImageData",
      class {
        constructor(
          public data: Uint8ClampedArray,
          public width: number,
          public height: number,
        ) {}
      },
    );
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async (data: ImageData) => ({
        width: data.width,
        height: data.height,
        close() {},
      })),
    );
  });

  afterEach(() => {
    dispose();
    shownPdf.value = null;
    tabs.value = [];
    activeTabId.value = null;
    pdfBitmaps.clear();
    vi.unstubAllGlobals();
  });

  const show = async (doc = pdf()) => {
    shownPdf.value = doc;
    dispose = bootApp(createTestHandle());
    await flushPromises();
  };

  it("shows nothing in a markdown tab", async () => {
    dispose = bootApp(createTestHandle());
    await flushPromises();

    expect(view()).toBeNull();
    expect(document.getElementById("page-view")).not.toBeNull();
  });

  it("shows the PDF's pages in place of the page view, and draws those in view", async () => {
    await show();

    expect(view()?.getAttribute("aria-label")).toBe("contract.pdf");
    expect(document.getElementById("page-view")).toBeNull();
    expect(view()!.querySelectorAll(".pdf-page").length).toBeGreaterThan(0);
    expect(renderPage).toHaveBeenCalledWith("t", 0, expect.any(Number), 1);
    expect(pdfBitmaps.size).toBeGreaterThan(0);
    expect(pdfPageInView.value).toBe(0);
  });

  it("says which page it couldn't draw, and doesn't ask for it again", async () => {
    vi.mocked(renderPage).mockRejectedValueOnce("crashed");
    await show();

    expect(shownPdf.value?.failedPages).toEqual([0]);
    expect(view()!.querySelector(".pdf-page-failed")?.textContent).toBe(
      "Blank couldn't draw this page",
    );
    expect(
      vi.mocked(renderPage).mock.calls.filter(([, page]) => page === 0),
    ).toHaveLength(1);
  });

  it("says when the PDF can't be shown any more, offering to open it again", async () => {
    vi.mocked(renderPage).mockRejectedValue("failed");
    await show();

    const problem = view()!.querySelector(".pdf-problem")!;
    expect(problem.querySelector(".pdf-problem-title")?.textContent).toBe(
      "Blank can't show this PDF any more",
    );
    expect(
      [...problem.querySelectorAll("button")].map((b) => b.textContent?.trim()),
    ).toEqual(["Open again", "Close tab"]);
  });

  it("offers to find a PDF that was moved", async () => {
    await show(pdf({ opened: null, problem: "missing" }));

    expect(
      [...view()!.querySelectorAll("button")].map((b) => b.textContent?.trim()),
    ).toEqual(["Find it…", "Close tab"]);
  });

  it("says why a command of the text doesn't work here", async () => {
    await show();

    view()!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true }),
    );

    expect(announcement.value?.text).toBe("Bold isn't for PDFs");
  });
});
