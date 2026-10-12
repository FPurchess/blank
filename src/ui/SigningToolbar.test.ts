import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cancelRender, renderPage } from "../pdf/ipc";
import type { PdfTabDocument } from "../pdf/document";
import { SIGNING_NEXT } from "../pdf/sign";
import { resetStampBooks, stampsOf } from "../pdf/stampBooks";
import { pdfRules, type PdfRules } from "../signing/ipc";
import {
  activeTabId,
  announcement,
  focusStop,
  placingStamp,
  savedMarks,
  selectedStamp,
  shownPdf,
  shownPdfRules,
  signatureDialog,
  signingPlace,
  tabs,
  toolbarFocused,
} from "../state";
import { flushPromises } from "../test/async";
import { createTestHandle, keyEvent } from "../test/editor";
import { bootApp } from "./mount";

// The signing toolbar of a PDF tab (SigningToolbar.vue): the tools, why
// they're off, placing from the keyboard and with the mouse, and Sign….

vi.mock("../pdf/ipc", async (original) => ({
  ...(await original<typeof import("../pdf/ipc")>()),
  renderPage: vi.fn(),
  cancelRender: vi.fn(),
}));

vi.mock("../signing/ipc", async (original) => ({
  ...(await original<typeof import("../signing/ipc")>()),
  pdfRules: vi.fn(),
}));

vi.mock("../signing/marks", async (original) => ({
  ...(await original<typeof import("../signing/marks")>()),
  loadMarks: vi.fn(async () => {}),
}));

vi.mock("../pdf/stampEngine", () => ({
  STAMPS_NEED_LAYOUT: "Stamps need the page layout",
  naturalSize: vi.fn(async () => ({ width: 90, height: 14 })),
  paintStamp: vi.fn(async () => true),
  releaseStamp: vi.fn(async () => {}),
}));

const engine = vi.hoisted(() => ({ off: false }));
vi.mock("../engine/engine", async (original) => ({
  ...(await original<typeof import("../engine/engine")>()),
  engineless: () => engine.off,
}));

const a4 = { width: 595, height: 842, rotation: 0 };

const pdf: PdfTabDocument = {
  path: "/docs/contract.pdf",
  opened: { sha256: "abc", pages: [a4], repaired: false, encrypted: false },
  problem: null,
  failedPages: [],
  signatures: [],
};

const rules = (over: Partial<PdfRules> = {}): PdfRules => ({
  signed: false,
  docmdp: null,
  encrypted: false,
  damaged: false,
  locked: [],
  ...over,
});

const mark = {
  source: { kind: "image" as const },
  png: "",
  width: 300,
  height: 100,
};

const toolbar = () => document.getElementById("signing-toolbar")!;
const tool = (kind: string) =>
  toolbar().querySelector<HTMLButtonElement>(`[data-tool="${kind}"]`)!;
const signButton = () =>
  toolbar().querySelector<HTMLButtonElement>(".signing-sign")!;
// a click from the keyboard (Enter or Space) has no pointer's detail
const keyClick = (element: HTMLElement) =>
  element.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
const mouseClick = (element: HTMLElement) =>
  element.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));

describe("the signing toolbar", () => {
  let dispose = () => {};

  const mount = async (read = rules()) => {
    vi.mocked(pdfRules).mockResolvedValue(read);
    dispose = bootApp(createTestHandle());
    await flushPromises();
  };

  beforeEach(() => {
    tabs.value = [
      {
        id: "t",
        kind: "pdf",
        path: pdf.path,
        importedFrom: null,
        untitledNumber: null,
        unsaved: false,
        viewAnchor: null,
      },
    ];
    activeTabId.value = "t";
    vi.mocked(cancelRender).mockResolvedValue();
    vi.mocked(renderPage).mockImplementation(() => new Promise(() => {}));
    shownPdf.value = pdf;
    savedMarks.value = { signature: mark, initials: mark };
    signingPlace.value = "Berlin";
    engine.off = false;
  });

  afterEach(() => {
    dispose();
    resetStampBooks();
    shownPdf.value = null;
    shownPdfRules.value = null;
    savedMarks.value = undefined;
    signatureDialog.value = null;
    selectedStamp.value = null;
    placingStamp.value = null;
    signingPlace.value = "";
    toolbarFocused.value = false;
    tabs.value = [];
    activeTabId.value = null;
  });

  it("takes the formatting toolbar's row, with its tools and Sign…", async () => {
    await mount();
    expect(document.getElementById("format-toolbar")).toBeNull();
    expect(toolbar().getAttribute("aria-label")).toBe("Signing");
    expect(
      [...toolbar().querySelectorAll(".signing-tool")].map((b) =>
        b.textContent?.trim(),
      ),
    ).toEqual(["Signature", "Initials", "Date", "Place"]);
    expect(signButton().textContent?.trim()).toBe("Sign…");
    expect(signButton().dataset.tipKey).toBe("Ctrl+S");
    expect(
      toolbar().querySelector(".signing-next")!.hasAttribute("hidden"),
    ).toBe(true);
    expect(pdfRules).toHaveBeenCalledWith("/docs/contract.pdf");
  });

  it("is the toolbar's stop for F6 and Alt-F10", async () => {
    await mount();
    focusStop("toolbar");
    expect(document.activeElement).toBe(tool("signature"));
    expect(toolbarFocused.value).toBe(true);
  });

  it("turns off what would change the pages earlier signers signed", async () => {
    await mount(rules({ signed: true }));
    expect(tool("signature").getAttribute("aria-disabled")).toBeNull();
    expect(tool("initials").getAttribute("aria-disabled")).toBe("true");
    expect(tool("initials").dataset.tip).toBe(
      "Initials would change pages the earlier signers signed.",
    );
    expect(tool("date").dataset.tip).toBe(
      "A date would change pages the earlier signers signed.",
    );
    expect(tool("place").dataset.tip).toBe(
      "A place would change pages the earlier signers signed.",
    );
    // a press says why, and places nothing
    keyClick(tool("initials"));
    await flushPromises();
    expect(announcement.value?.text).toBe(
      "Initials would change pages the earlier signers signed.",
    );
    expect(stampsOf("t")).toEqual([]);
  });

  it("turns everything off on a PDF that allows no changes, saying why", async () => {
    await mount(rules({ docmdp: 1, signed: true }));
    const why = "This PDF doesn't allow any changes, not even signatures";
    for (const kind of ["signature", "initials", "date", "place"])
      expect(tool(kind).dataset.tip).toBe(why);
    expect(signButton().getAttribute("aria-disabled")).toBe("true");
    expect(toolbar().querySelector(".signing-note")?.textContent?.trim()).toBe(
      why,
    );
  });

  it("turns the tools off without the page layout", async () => {
    engine.off = true;
    await mount();
    const why = "Stamps need the page layout, which didn't start";
    expect(tool("signature").dataset.tip).toBe(why);
    expect(toolbar().querySelector(".signing-note")?.textContent?.trim()).toBe(
      why,
    );
    expect(signButton().getAttribute("aria-disabled")).toBeNull();
  });

  it("places a stamp at its spot from the keyboard, selected and focused", async () => {
    await mount();
    keyClick(tool("signature"));
    await flushPromises();
    const [placed] = stampsOf("t");
    expect(placed.kind).toBe("signature");
    expect(placed.rect.slice(2)).toEqual([180, 60]);
    expect(selectedStamp.value).toBe(placed.id);
    expect(announcement.value?.text).toBe(
      "Signature placed on page 1, use the arrow keys to move it",
    );
    await flushPromises();
    expect(document.activeElement?.id).toBe(`stamp-${placed.id}`);
  });

  it("asks for the signature first when there's none yet", async () => {
    savedMarks.value = { signature: null, initials: null };
    await mount();
    keyClick(tool("signature"));
    await flushPromises();
    expect(signatureDialog.value?.mark).toBe("signature");
    expect(stampsOf("t")).toEqual([]);
  });

  it("waits for a press on a page after a click, which Esc cancels", async () => {
    await mount();
    mouseClick(tool("date"));
    await flushPromises();
    expect(placingStamp.value).toBe("date");
    expect(tool("date").getAttribute("aria-pressed")).toBe("true");
    tool("date").focus();
    tool("date").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await flushPromises();
    expect(placingStamp.value).toBeNull();
    expect(announcement.value?.text).toBe("Placing canceled");
  });

  it("says that signing comes next, from Sign… and from Save's key", async () => {
    await mount();
    const said = () => announcement.value?.text;
    signButton().click();
    await flushPromises();
    expect(said()).toBe(SIGNING_NEXT);
    announcement.value = null;
    window.dispatchEvent(keyEvent("Mod-s"));
    await flushPromises();
    expect(said()).toBe(SIGNING_NEXT);
  });
});
