import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorState } from "prosemirror-state";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { announcement } from "../state";
import { doc, p } from "../test/editor";
import { testLayout } from "../test/layout";
import { printDocument, printingNow } from "./job";
import {
  MAY_NOT_HAVE_PRINTED,
  NO_PRINT_DIALOG,
  NO_PRINT_SERVICE,
  type PrintPlan,
} from "./printModel";

const printPDF = vi.hoisted(() => vi.fn());
vi.mock("../engine/pdf", () => ({ printPDF }));
const preparePrint = vi.hoisted(() => vi.fn());
const sendPrint = vi.hoisted(() => vi.fn());
vi.mock("./ipc", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ipc")>()),
  preparePrint,
  sendPrint,
}));

const A4 = { width: 595.28, height: 841.89 };
const LETTER = { width: 612, height: 792 };
const PDF = new TextEncoder().encode("%PDF-1.7");

const plan: PrintPlan = {
  pages: [0, 1, 2],
  perSheet: 2,
  scale: "actual",
  copies: 2,
  collate: true,
};

const print = (changes: Partial<PrintPlan> = {}) => {
  const reopen = vi.fn();
  const done = printDocument({
    state: EditorState.create({ doc: doc(p("text")) }),
    docPath: "/docs/notes.md",
    layout: testLayout(),
    title: "Notes",
    page: A4,
    plan: { ...plan, ...changes },
    reopen,
  });
  return { done, reopen };
};

const ready = (setup = {}) =>
  preparePrint.mockResolvedValue({
    outcome: "ready",
    token: 7,
    paper: null,
    ranges: null,
    scale: null,
    ...setup,
  });

// the sheets the print PDF was written with
const printed = () => printPDF.mock.calls[0][1].sheets;

describe("printDocument", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    announcement.value = null;
    printPDF.mockResolvedValue({ contents: PDF, warnings: [], pages: 2 });
    ready();
    sendPrint.mockResolvedValue({ outcome: "sent", printer: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete window.blankPrintCapture;
  });

  it("asks the system, writes the sheets and hands them over", async () => {
    await print().done;

    // the system's dialog starts with the copies and Blank's paper
    const preset = {
      copies: 2,
      collate: true,
      fit: false,
      paper: { width: A4.height, height: A4.width },
    };
    expect(preparePrint).toHaveBeenCalledWith("Notes", preset);
    expect(printed()).toHaveLength(2);
    expect(printPDF.mock.calls[0][1]).toMatchObject({
      docPath: "/docs/notes.md",
    });
    expect(sendPrint).toHaveBeenCalledWith(PDF, {
      token: 7,
      title: "Notes",
      preset,
    });
    expect(announcement.value?.text).toBe("Sent 3 pages to the printer");
  });

  it("names the printer when the system does", async () => {
    sendPrint.mockResolvedValue({ outcome: "sent", printer: "Office" });

    await print().done;

    expect(announcement.value?.text).toBe("Sent 3 pages to Office");
  });

  it("lays the sheets out on the paper and the sheets the system chose", async () => {
    ready({ paper: LETTER, ranges: [[1, 1]], scale: 50 });

    await print().done;

    const [sheet] = printed();
    expect(printed()).toHaveLength(1);
    expect(sheet).toMatchObject({ width: 792, height: 612 });
    expect(sheet.placements.map(({ page }: { page: number }) => page)).toEqual([
      2,
    ]);
  });

  it("counts the pages the system chose to print", async () => {
    // 2 per sheet: pages 1 and 2 on the first sheet, page 3 on the second
    ready({ ranges: [[1, 1]] });

    await print().done;

    expect(announcement.value?.text).toBe("Sent 1 page to the printer");
  });

  it("is printing until the system has the job", async () => {
    let answer: (sent: unknown) => void = () => {};
    sendPrint.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { done } = print();
    await vi.waitFor(() => expect(sendPrint).toHaveBeenCalled());

    expect(printingNow()).toBe(true);
    answer({ outcome: "sent", printer: null });
    await done;
    expect(printingNow()).toBe(false);
  });

  it("says nothing when the system's dialog is cancelled", async () => {
    preparePrint.mockResolvedValue({ outcome: "cancelled" });
    const first = print();
    await first.done;
    expect(printPDF).not.toHaveBeenCalled();

    ready();
    sendPrint.mockResolvedValue({ outcome: "cancelled" });
    const second = print();
    await second.done;

    expect(announcement.value).toBeNull();
    expect(first.reopen).not.toHaveBeenCalled();
    expect(second.reopen).not.toHaveBeenCalled();
  });

  it("says nothing once the system's dialog shows where it won't tell more", async () => {
    sendPrint.mockResolvedValue({ outcome: "shown" });

    await print().done;

    expect(announcement.value).toBeNull();
  });

  it("tells what the print PDF left out", async () => {
    printPDF.mockResolvedValue({
      contents: PDF,
      warnings: ["1 image couldn't be read"],
      pages: 2,
    });

    await print().done;

    expect(sendNotification).toHaveBeenCalledWith({
      title: "Print",
      body: "1 image couldn't be read",
    });
  });

  it.each([
    [{ kind: "noService", message: "no portal" }, NO_PRINT_SERVICE],
    [{ kind: "unsupported", message: "old WebView2" }, NO_PRINT_DIALOG],
    [
      { kind: "failed", message: "the PDF didn't load" },
      "Printing didn't work: the PDF didn't load. Save a PDF and print it from another app.",
    ],
    [
      new Error("Out of paper."),
      "Printing didn't work: Out of paper. Save a PDF and print it from another app.",
    ],
  ])("opens the dialog again after %o", async (error, note) => {
    sendPrint.mockRejectedValue(error);
    const { done, reopen } = print();
    // the dialog opens again once the print is over, not while it runs
    reopen.mockImplementation(() => expect(printingNow()).toBe(false));
    await done;

    expect(reopen).toHaveBeenCalledWith(note);
    // and in the log, with what the system said
    expect(console.error).toHaveBeenCalled();
  });

  it("only tells when the job may have printed, so it doesn't print twice", async () => {
    sendPrint.mockRejectedValue({ kind: "uncertain", message: "lpr said 1" });
    const { done, reopen } = print();
    await done;

    expect(reopen).not.toHaveBeenCalled();
    expect(sendNotification).toHaveBeenCalledWith({
      title: "Print",
      body: MAY_NOT_HAVE_PRINTED,
    });
    expect(console.warn).toHaveBeenCalledWith(
      "printing may have failed",
      "lpr said 1",
    );
  });

  it("hands the PDF to a test that captures it instead, in a debug build", async () => {
    vi.stubGlobal("__TEST_HOOKS__", true);
    window.blankPrintCapture = { sent: [] };

    await print().done;

    expect(preparePrint).not.toHaveBeenCalled();
    expect(sendPrint).not.toHaveBeenCalled();
    expect(window.blankPrintCapture.sent).toEqual([
      { sheets: 2, pdf: "%PDF-" },
    ]);
  });
});
