import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { sendNotification } from "@tauri-apps/plugin-notification";

import {
  forgetEngineFailure,
  type PageEngine,
  setPageEngine,
  useFallbackEditor,
} from "../../engine/engine";
import toPDF from "../../engine/pdf";
import { PDF_FILTER } from "../../formats";
import { activeTabId, announcement, printDialog } from "../../state";
import { doc, docWithFrontmatter, h, p } from "../../test/editor";
import {
  NOTHING_TO_PRINT,
  PRINT_UNAVAILABLE,
  STILL_PRINTING,
} from "../../print/printModel";
import printCommand, { openPrint } from "./print";

const printDocument = vi.hoisted(() => vi.fn());
const printingNow = vi.hoisted(() => vi.fn());
vi.mock("../../print/job", () => ({ printDocument, printingNow }));
const exportFile = vi.hoisted(() => vi.fn());
vi.mock("./exportAs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./exportAs")>()),
  exportFile,
}));
const openPageSetup = vi.hoisted(() => vi.fn());
vi.mock("./pageSetup", () => ({ openPageSetup }));
const caretPage = vi.hoisted(() => vi.fn());
vi.mock("../../engine/geometry", () => ({ caretPage }));

let view: EditorView;
const engine = { finish: vi.fn(), pages: vi.fn() };

const mount = (node: ReturnType<typeof doc>) => {
  view = new EditorView(document.createElement("div"), {
    state: EditorState.create({ doc: node }),
  });
  vi.spyOn(view, "focus").mockImplementation(() => {});
  return view;
};

const request = () => {
  const value = printDialog.value;
  if (!value) throw new Error("the print dialog isn't open");
  printDialog.value = null;
  return value;
};

describe("command.print", () => {
  beforeEach(() => {
    printDialog.value = null;
    announcement.value = null;
    engine.pages.mockReturnValue(3);
    caretPage.mockReturnValue(1);
    printingNow.mockReturnValue(false);
    setPageEngine(engine as unknown as PageEngine);
  });

  afterEach(() => {
    view?.destroy();
    printDialog.value = null;
    activeTabId.value = null;
    setPageEngine(null);
    forgetEngineFailure();
  });

  it("opens the dialog with every page laid out and the cursor's", () => {
    mount(docWithFrontmatter("title: Field notes", p("text")));

    expect(printCommand()(view.state, view.dispatch, view)).toBe(true);

    expect(engine.finish).toHaveBeenCalled();
    // jsdom's locale is en-US, whose paper is Letter
    expect(request()).toMatchObject({
      pages: 3,
      current: 1,
      page: { width: 612, height: 792 },
      paper: "Letter, normal margins",
    });
  });

  it("prints with what the document is", () => {
    mount(docWithFrontmatter("title: Field notes", p("text")));
    openPrint(view);
    const plan = {
      pages: [0, 2],
      perSheet: 2 as const,
      scale: "fit" as const,
      copies: 1,
      collate: true,
    };

    request().print(plan);

    expect(view.focus).toHaveBeenCalled();
    expect(printDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        state: view.state,
        docPath: null,
        title: "Field notes",
        page: { width: 612, height: 792 },
        plan,
      }),
    );
  });

  it("names a document without a title after its first heading", () => {
    mount(doc(h(1, "Findings"), p("text")));
    openPrint(view);

    request().print({
      pages: [0],
      perSheet: 1,
      scale: "actual",
      copies: 1,
      collate: true,
    });

    expect(printDocument).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Findings" }),
    );
  });

  it("saves a PDF of the chosen pages", () => {
    mount(doc(p("text")));
    openPrint(view);

    request().savePdf([1]);

    expect(exportFile).toHaveBeenCalledWith(
      expect.objectContaining({
        exporter: toPDF,
        filters: [PDF_FILTER],
        state: view.state,
        pages: [1],
      }),
    );
  });

  it("opens the page setup instead", () => {
    mount(doc(p("text")));
    openPrint(view);

    request().pageSetup();

    expect(openPageSetup).toHaveBeenCalledWith(view);
  });

  it("opens again with the reason, ready to save a PDF, while its tab shows", () => {
    activeTabId.value = "a";
    mount(doc(p("text")));
    openPrint(view);
    request().print({
      pages: [0],
      perSheet: 1,
      scale: "actual",
      copies: 1,
      collate: true,
    });
    const { reopen } = printDocument.mock.calls[0][0];

    reopen("It didn't work.");
    expect(request()).toMatchObject({
      note: "It didn't work.",
      destination: "pdf",
    });

    // on another tab, only the reason
    activeTabId.value = "b";
    reopen("It didn't work.");
    expect(printDialog.value).toBeNull();
    expect(sendNotification).toHaveBeenCalledWith({
      title: "Print",
      body: "It didn't work.",
    });
  });

  it("tells the reason alone when the dialog can't open again", () => {
    activeTabId.value = "a";
    mount(doc(p("text")));
    openPrint(view);
    request().print({
      pages: [0],
      perSheet: 1,
      scale: "actual",
      copies: 1,
      collate: true,
    });
    const { reopen } = printDocument.mock.calls[0][0];
    // the engine stopped working while the print PDF was written
    useFallbackEditor("failed");

    reopen("It didn't work.");

    expect(printDialog.value).toBeNull();
    expect(sendNotification).toHaveBeenCalledWith({
      title: "Print",
      body: "It didn't work.",
    });
  });

  it("can't print without the page layout", () => {
    useFallbackEditor("off");
    mount(doc(p("text")));

    openPrint(view);

    expect(printDialog.value).toBeNull();
    expect(announcement.value?.text).toBe(PRINT_UNAVAILABLE);
    expect(sendNotification).toHaveBeenCalledWith({
      title: "Print",
      body: PRINT_UNAVAILABLE,
    });
  });

  it("has nothing to print in an empty document", () => {
    mount(doc(p("")));

    openPrint(view);

    expect(printDialog.value).toBeNull();
    expect(sendNotification).toHaveBeenCalledWith({
      title: "Print",
      body: NOTHING_TO_PRINT,
    });
    expect(announcement.value?.text).toBe(NOTHING_TO_PRINT);
  });

  it("waits until the last print is with the system", () => {
    printingNow.mockReturnValue(true);
    mount(doc(p("text")));

    openPrint(view);

    expect(printDialog.value).toBeNull();
    expect(announcement.value?.text).toBe(STILL_PRINTING);
  });

  it("opens one dialog at a time", () => {
    mount(doc(p("text")));
    openPrint(view);
    const first = printDialog.value;

    openPrint(view);

    expect(printDialog.value).toBe(first);
  });
});
