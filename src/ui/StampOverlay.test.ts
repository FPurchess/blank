import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cancelRender, renderPage } from "../pdf/ipc";
import type { PdfTabDocument } from "../pdf/document";
import { changeStamps, resetStampBooks, stampsOf } from "../pdf/stampBooks";
import { type Stamp, stampSpec } from "../pdf/stampModel";
import {
  activeTabId,
  announcement,
  placingStamp,
  selectedStamp,
  shownPdf,
  shownPdfRules,
  tabs,
} from "../state";
import { flushPromises } from "../test/async";
import { createTestHandle, keyEvent } from "../test/editor";
import { bootApp } from "./mount";
import { pdfBitmaps } from "./pageBitmaps";

// The stamps on a PDF's pages (StampOverlay.vue in PdfView.vue): what a
// screen reader and Tab find, the keys of a selected stamp, the mouse.

vi.mock("../pdf/ipc", async (original) => ({
  ...(await original<typeof import("../pdf/ipc")>()),
  renderPage: vi.fn(),
  cancelRender: vi.fn(),
}));

vi.mock("../pdf/stampEngine", () => ({
  naturalSize: vi.fn(async () => ({ width: 90, height: 14 })),
  paintStamp: vi.fn(async () => true),
  releaseStamp: vi.fn(async () => {}),
}));

vi.mock("../engine/engine", async (original) => ({
  ...(await original<typeof import("../engine/engine")>()),
  engineless: () => false,
}));

const a4 = { width: 595, height: 842, rotation: 0 };

const pdf: PdfTabDocument = {
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
};

const stamp = (over: Partial<Stamp> = {}): Stamp => ({
  id: "s1",
  kind: "signature",
  page: 0,
  rect: [100, 100, 180, 60],
  natural: [180, 60],
  spec: stampSpec("signature"),
  ...over,
});

const view = () => document.getElementById("pdf-view")!;
const stampEl = (id = "s1") => document.getElementById(`stamp-${id}`)!;
const groups = () => [
  ...document.querySelectorAll<HTMLElement>('.pdf-stamp[role="group"]'),
];
const press = async (element: HTMLElement, combo: string) => {
  const base = keyEvent(combo);
  const event = new KeyboardEvent("keydown", {
    key: base.key,
    ctrlKey: base.ctrlKey,
    shiftKey: base.shiftKey,
    altKey: base.altKey,
    metaKey: base.metaKey,
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(event);
  await flushPromises();
  return event;
};
const pointer = (element: HTMLElement, type: string, x: number, y: number) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
  });
  Object.defineProperty(event, "pointerId", { value: 1 });
  element.dispatchEvent(event);
};

describe("stamps on a PDF's pages", () => {
  let dispose = () => {};

  beforeEach(async () => {
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
    shownPdfRules.value = {
      sha256: "abc",
      rules: {
        signed: false,
        docmdp: null,
        encrypted: false,
        damaged: false,
        locked: [],
      },
    };
    changeStamps("t", [
      stamp({ id: "low", rect: [100, 500, 180, 60] }),
      stamp(),
      stamp({ id: "next", page: 1 }),
    ]);
    dispose = bootApp(createTestHandle());
    await flushPromises();
  });

  afterEach(() => {
    dispose();
    resetStampBooks();
    shownPdf.value = null;
    shownPdfRules.value = null;
    selectedStamp.value = null;
    placingStamp.value = null;
    tabs.value = [];
    activeTabId.value = null;
    pdfBitmaps.clear();
  });

  it("are groups in reading order, so Tab follows it", () => {
    expect(groups().map((group) => group.id)).toEqual([
      "stamp-s1",
      "stamp-low",
      "stamp-next",
    ]);
    expect(groups().every((group) => group.tabIndex === 0)).toBe(true);
    expect(stampEl().getAttribute("aria-label")).toBe("Signature on page 1");
  });

  it("are selected when they take the focus, with their ring, corners and toolbar", async () => {
    stampEl().focus();
    await flushPromises();
    expect(selectedStamp.value).toBe("s1");
    expect(stampEl().classList.contains("selected")).toBe(true);
    expect(stampEl().getAttribute("aria-label")).toBe(
      "Signature on page 1, selected",
    );
    expect(stampEl().querySelectorAll(".stamp-handle")).toHaveLength(4);
    // the toolbar comes right after it, for Tab
    const toolbar = stampEl().nextElementSibling as HTMLElement;
    expect(toolbar.classList.contains("stamp-toolbar")).toBe(true);
    expect(toolbar.querySelector('[aria-label="Remove"]')).not.toBeNull();
    // a signature doesn't repeat
    expect(
      toolbar.querySelector('[aria-label="Repeat on every page"]'),
    ).toBeNull();
  });

  it("move with the arrows and change size with Alt and the arrows", async () => {
    stampEl().focus();
    await press(stampEl(), "ArrowRight");
    await press(stampEl(), "Shift-ArrowDown");
    expect(stampsOf("t").find((s) => s.id === "s1")!.rect).toEqual([
      101, 110, 180, 60,
    ]);
    await press(stampEl(), "Alt-ArrowRight");
    expect(stampsOf("t").find((s) => s.id === "s1")!.rect).toEqual([
      101,
      110,
      181,
      181 / 3,
    ]);
  });

  it("undo with Mod-Z, the nudges of a moment as one step", async () => {
    stampEl().focus();
    await press(stampEl(), "ArrowRight");
    await press(stampEl(), "ArrowRight");
    await press(stampEl(), "Mod-z");
    expect(stampsOf("t").find((s) => s.id === "s1")!.rect[0]).toBe(100);
    await press(stampEl(), "Mod-Shift-z");
    expect(stampsOf("t").find((s) => s.id === "s1")!.rect[0]).toBe(102);
  });

  it("go with Delete, which says so and gives the pages the focus", async () => {
    stampEl().focus();
    await press(stampEl(), "Delete");
    expect(stampsOf("t").map((s) => s.id)).toEqual(["low", "next"]);
    expect(announcement.value?.text).toBe("Signature removed");
    await flushPromises();
    expect(document.activeElement).toBe(view());
    // and come back with undo
    await press(view(), "Mod-z");
    expect(stampsOf("t")).toHaveLength(3);
  });

  it("are left with Esc, which gives the pages the focus", async () => {
    stampEl().focus();
    await press(stampEl(), "Escape");
    expect(selectedStamp.value).toBeNull();
    expect(document.activeElement).toBe(view());
  });

  it("move with the mouse in one step, once it moved a few pixels", async () => {
    const element = stampEl();
    pointer(element, "pointerdown", 10, 10);
    pointer(element, "pointermove", 12, 10);
    pointer(element, "pointermove", 10 + 40, 10);
    await flushPromises();
    expect(element.classList.contains("dragging")).toBe(true);
    pointer(element, "pointerup", 50, 10);
    await flushPromises();
    const moved = stampsOf("t").find((s) => s.id === "s1")!;
    expect(moved.rect[0]).toBeGreaterThan(100);
    await press(view(), "Mod-z");
    expect(stampsOf("t").find((s) => s.id === "s1")!.rect[0]).toBe(100);
  });

  it("repeat initials on every page, as faded copies nobody reads", async () => {
    changeStamps("t", [
      stamp({ id: "i", kind: "initials", spec: stampSpec("initials") }),
    ]);
    await flushPromises();
    stampEl("i").focus();
    await flushPromises();
    const repeat = document.querySelector<HTMLElement>(
      '[aria-label="Repeat on every page"]',
    )!;
    expect(repeat.getAttribute("aria-pressed")).toBe("false");
    repeat.click();
    await flushPromises();
    expect(stampsOf("t")[0].repeat).toBe(true);
    expect(announcement.value?.text).toBe("Initials on every page");
    // on every page mounted but its own
    const ghosts = document.querySelectorAll(".pdf-stamp.ghost");
    expect(ghosts.length).toBeGreaterThan(0);
    expect(ghosts).toHaveLength(
      document.querySelectorAll(".page-sheet").length - 1,
    );
    expect(ghosts[0].getAttribute("aria-hidden")).toBe("true");
  });

  it("are placed where a page is pressed once a tool was chosen", async () => {
    placingStamp.value = "date";
    await flushPromises();
    expect(view().classList.contains("pdf-placing")).toBe(true);
    const desk = view().querySelector<HTMLElement>(".page-desk")!;
    const frame = desk.querySelector<HTMLElement>(".page-sheet")!;
    const left = parseFloat(frame.style.left);
    const top = parseFloat(frame.style.top);
    pointer(desk, "pointerdown", left + 100, top + 100);
    await flushPromises();
    const placed = stampsOf("t").find((s) => s.kind === "date")!;
    expect(placed.page).toBe(0);
    expect(placed.spec.lines).toHaveLength(1);
    expect(placingStamp.value).toBeNull();
    expect(selectedStamp.value).toBe(placed.id);
    expect(announcement.value?.text).toBe(
      "Date placed on page 1, use the arrow keys to move it",
    );
    await flushPromises();
    expect(document.activeElement).toBe(stampEl(placed.id));
  });

  it("aren't placed after Esc, which says so", async () => {
    placingStamp.value = "date";
    view().focus();
    await press(view(), "Escape");
    expect(placingStamp.value).toBeNull();
    expect(announcement.value?.text).toBe("Placing canceled");
  });
});
