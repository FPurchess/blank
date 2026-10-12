import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// first, so it asks the tabs mocked below to open what it signed, not the
// tabs it was loaded with
import "../pdf/sign";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { config } from "../config";
import { openPaths } from "../editor/tabs";
import { resetFills } from "../pdf/fills";
import {
  cancelRender,
  type PageText,
  pageText,
  type PdfField,
  pdfFields,
  renderPage,
  setFills,
} from "../pdf/ipc";
import type { PdfTabDocument } from "../pdf/document";
import { nextShownPlace } from "../pdf/placeActions";
import { resetPlaces } from "../pdf/placesRead";
import {
  changeSheet,
  changeStamps,
  fillsOf,
  hasChanges,
  resetStampBooks,
  stampsOf,
} from "../pdf/stampBooks";
import { stampSpec } from "../pdf/stampModel";
import {
  type PdfRules,
  pdfRules,
  type SignRequest,
  signPdf,
} from "../signing/ipc";
import {
  activeTabId,
  announcement,
  fieldProblem,
  pageRevisions,
  placeDialog,
  savedMarks,
  selectedStamp,
  shownPdf,
  shownPdfRules,
  signDialog,
  type SignDialogRequest,
  signingCertificate,
  signingPlace,
  tabs,
} from "../state";
import { flushPromises } from "../test/async";
import {
  createState,
  createTestHandle,
  doc,
  keyEvent,
  p,
} from "../test/editor";
import { bootApp } from "./mount";
import { pdfBitmaps } from "./pageBitmaps";

// The places of a PDF tab on its pages (PdfView.vue, PdfTarget.vue,
// PdfField.vue), Next on the signing toolbar, and signing a PDF received:
// what Tab and screen readers find, what Enter and Delete do, what a field
// fills in, and what the signer is asked for.

vi.mock("../pdf/ipc", async (original) => ({
  ...(await original<typeof import("../pdf/ipc")>()),
  renderPage: vi.fn(),
  cancelRender: vi.fn(),
  pdfFields: vi.fn(),
  pageText: vi.fn(),
  setFills: vi.fn(),
}));

vi.mock("../signing/ipc", async (original) => ({
  ...(await original<typeof import("../signing/ipc")>()),
  pdfRules: vi.fn(),
  signPdf: vi.fn(),
  checkPassphrase: vi.fn(),
}));

vi.mock("../signing/marks", async (original) => ({
  ...(await original<typeof import("../signing/marks")>()),
  loadMarks: vi.fn(async () => {}),
}));

vi.mock("../signing/certificate", async (original) => ({
  ...(await original<typeof import("../signing/certificate")>()),
  loadCertificate: vi.fn(async () => {}),
}));

vi.mock("../editor/tabs", async (original) => ({
  ...(await original<typeof import("../editor/tabs")>()),
  openPaths: vi.fn(async () => {}),
}));

vi.mock("../pdf/stampEngine", () => ({
  STAMPS_NEED_LAYOUT: "Stamps need the page layout",
  naturalSize: vi.fn(async () => ({ width: 90, height: 14 })),
  paintStamp: vi.fn(async () => true),
  releaseStamp: vi.fn(async () => {}),
  stampPdf: vi.fn(async () => new Uint8Array([1, 2, 3])),
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
    pages: [a4, a4],
    repaired: false,
    encrypted: false,
  },
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

const field = (name: string, more: Partial<PdfField>): PdfField => ({
  name,
  kind: "text",
  label: null,
  value: "",
  options: [],
  flags: {
    readOnly: false,
    required: false,
    multiline: false,
    comb: false,
    maxLen: 40,
  },
  signed: false,
  widgets: [],
  ...more,
});

// form.pdf's fields: its name, a checkbox, a signature field
const fields: PdfField[] = [
  field("name", {
    label: "Your name",
    widgets: [{ page: 0, rect: [100, 122, 200, 20], onValue: null }],
  }),
  field("agree", {
    kind: "checkbox",
    value: "Off",
    widgets: [{ page: 0, rect: [100, 177, 15, 15], onValue: "Yes" }],
  }),
  field("signature", {
    kind: "signature",
    widgets: [{ page: 0, rect: [100, 292, 200, 50], onValue: null }],
  }),
];

// form.pdf's words: "Unterschrift" under a rule, and "Ort, Datum: ____",
// on both pages (the second has no fields)
const text: PageText = {
  words: [
    { text: "Unterschrift", rect: [100, 364.82, 51.12, 9.25] },
    { text: "Ort,", rect: [350, 364.82, 16.67, 9.25] },
    { text: "Datum:", rect: [369.45, 364.82, 32.23, 9.25] },
    { text: "______________", rect: [404.46, 364.82, 77.84, 9.25] },
  ],
  rules: [[100, 351.75, 200, 0.5]],
};

const mark = {
  source: { kind: "image" as const },
  png: "",
  width: 300,
  height: 100,
};

const view = () => document.getElementById("pdf-view")!;
const placeEl = (id: string) =>
  document.getElementById(`place-${encodeURIComponent(id)}`) as HTMLElement;
const overlays = () => [
  ...document.querySelectorAll<HTMLElement>(
    ".page-desk .pdf-target, .page-desk .pdf-field, .page-desk .pdf-stamp:not(.ghost)",
  ),
];
const next = () =>
  document.querySelector<HTMLButtonElement>("#signing-toolbar .signing-next")!;
const press = async (element: HTMLElement, combo: string) => {
  const base = keyEvent(combo);
  element.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: base.key,
      ctrlKey: base.ctrlKey,
      shiftKey: base.shiftKey,
      altKey: base.altKey,
      bubbles: true,
      cancelable: true,
    }),
  );
  await flushPromises();
};

const SIGNATURE_LINE = "found:1:100:316";
const PLACE_DATE = "found:0:404:359";

describe("the places of a PDF", () => {
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
    vi.mocked(pdfFields).mockResolvedValue(fields);
    vi.mocked(pageText).mockResolvedValue(text);
    vi.mocked(setFills).mockResolvedValue([0]);
    vi.mocked(pdfRules).mockResolvedValue(rules());
    savedMarks.value = { signature: mark, initials: mark };
    signingPlace.value = "Berlin";
    config.value = {
      ...config.value,
      signing: { ...config.value.signing, name: "Ada Lovelace" },
    };
    shownPdf.value = pdf;
    dispose = bootApp(createTestHandle(createState(doc(p()))));
    await flushPromises();
  });

  afterEach(() => {
    dispose();
    resetStampBooks();
    resetPlaces();
    resetFills();
    shownPdf.value = null;
    shownPdfRules.value = null;
    savedMarks.value = undefined;
    selectedStamp.value = null;
    signDialog.value = null;
    placeDialog.value = null;
    signingPlace.value = "";
    signingCertificate.value = null;
    config.value = {
      ...config.value,
      signing: { ...config.value.signing, name: "" },
    };
    tabs.value = [];
    activeTabId.value = null;
    pdfBitmaps.clear();
  });

  it("show in reading order with the stamps, so Tab follows it", async () => {
    changeStamps("t", [
      {
        id: "d",
        kind: "date",
        page: 0,
        rect: [100, 150, 90, 14],
        natural: [90, 14],
        spec: stampSpec("date", "1 May"),
      },
    ]);
    await flushPromises();
    expect(overlays().map((element) => element.id)).toEqual([
      "place-field%3Aname",
      "stamp-d",
      "place-field%3Aagree",
      "place-field%3Asignature",
      `place-${encodeURIComponent(PLACE_DATE)}`,
      `place-${encodeURIComponent(SIGNATURE_LINE)}`,
      "place-found%3A1%3A404%3A359",
    ]);
    expect(
      overlays().map((element) => element.getAttribute("aria-label")),
    ).toEqual([
      "Your name, page 1",
      "Date on page 1",
      "Agree, page 1",
      "Signature, page 1",
      "Place and date, page 1",
      "Signature, page 2",
      "Place and date, page 2",
    ]);
    // the signature field wins over the line found under it
    expect(placeEl("found:0:100:316")).toBeNull();
    expect(placeEl("field:signature").tagName).toBe("BUTTON");
    expect(placeEl("field:signature").classList).toContain("pdf-target");
  });

  it("fill a signature line with the signature, standing on it", async () => {
    placeEl(SIGNATURE_LINE).focus();
    await press(placeEl(SIGNATURE_LINE), "Enter");
    const [placed] = stampsOf("t");
    expect(placed).toMatchObject({
      kind: "signature",
      page: 1,
      place: SIGNATURE_LINE,
      rect: [146, 315.75, 108, 36],
    });
    expect(selectedStamp.value).toBe(placed.id);
    expect(document.activeElement?.id).toBe(`stamp-${placed.id}`);
    // the stamp takes the target's place
    expect(placeEl(SIGNATURE_LINE)).toBeNull();
  });

  it("fill a signature field with the signature, in its middle", async () => {
    placeEl("field:signature").click();
    await flushPromises();
    expect(stampsOf("t")[0]).toMatchObject({
      place: "field:signature",
      rect: [125, 292, 150, 50],
    });
  });

  it("make the signature first when there's none", async () => {
    savedMarks.value = { signature: null, initials: null };
    placeEl("field:signature").click();
    await flushPromises();
    expect(stampsOf("t")).toEqual([]);
  });

  it("fill a place and date line with both", async () => {
    placeEl(PLACE_DATE).click();
    await flushPromises();
    const [placed] = stampsOf("t");
    expect(placed.kind).toBe("place");
    expect(placed.spec.lines[0]).toMatch(/^Berlin, /);
    expect(placed.place).toBe(PLACE_DATE);
  });

  it("ask where the user signs before a place they don't know yet", async () => {
    signingPlace.value = "";
    placeEl(PLACE_DATE).click();
    await flushPromises();
    expect(placeDialog.value).not.toBeNull();
    const input = document.querySelector<HTMLInputElement>(
      "#place-dialog-place",
    )!;
    // nothing typed: it says so
    document
      .querySelector<HTMLFormElement>("#place-dialog form")!
      .requestSubmit();
    await flushPromises();
    expect(document.getElementById("place-dialog-error")?.textContent).toMatch(
      /Type where you sign/,
    );
    input.value = "Hamburg";
    input.dispatchEvent(new Event("input"));
    document
      .querySelector<HTMLFormElement>("#place-dialog form")!
      .requestSubmit();
    await flushPromises();
    expect(placeDialog.value).toBeNull();
    expect(signingPlace.value).toBe("Hamburg");
    expect(stampsOf("t")[0].spec.lines[0]).toMatch(/^Hamburg, /);
  });

  it("place a place stamp from the toolbar after asking for the place", async () => {
    signingPlace.value = "";
    document
      .querySelector<HTMLElement>('#signing-toolbar [data-tool="place"]')!
      .dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
    await flushPromises();
    expect(placeDialog.value).not.toBeNull();
    placeDialog.value!.submit("Köln");
    placeDialog.value = null;
    await flushPromises();
    expect(stampsOf("t")[0]).toMatchObject({ kind: "place" });
    expect(stampsOf("t")[0].spec.lines).toEqual(["Köln"]);
  });

  it("are dismissed with Delete, which undo brings back", async () => {
    placeEl(PLACE_DATE).focus();
    await press(placeEl(PLACE_DATE), "Delete");
    expect(announcement.value?.text).toBe("Place dismissed");
    expect(placeEl(PLACE_DATE)).toBeNull();
    expect(document.activeElement).toBe(view());
    // no longer counted
    expect(next().textContent?.trim()).toBe("Next · 1 of 5");
    await press(view(), "Mod-z");
    expect(placeEl(PLACE_DATE)).not.toBeNull();
    // fields are never dismissed
    placeEl("field:signature").focus();
    await press(placeEl("field:signature"), "Delete");
    expect(placeEl("field:signature")).not.toBeNull();
  });

  it("come back and take the focus when the stamp on them goes", async () => {
    placeEl(SIGNATURE_LINE).click();
    await flushPromises();
    const [placed] = stampsOf("t");
    const stamp = document.getElementById(`stamp-${placed.id}`)!;
    stamp.focus();
    await press(stamp, "Delete");
    await flushPromises();
    expect(document.activeElement).toBe(placeEl(SIGNATURE_LINE));
  });

  it("go one after another with Next, which says where it went", async () => {
    expect(next().hidden).toBe(false);
    expect(next().textContent?.trim()).toBe("Next · 1 of 6");
    next().click();
    await flushPromises();
    expect(document.activeElement).toBe(placeEl("field:name"));
    expect(announcement.value?.text).toBe(
      "Your name on page 1. Type to fill it in.",
    );
    expect(next().textContent?.trim()).toBe("Next · 2 of 6");
    // pdf.next does the same
    nextShownPlace()(createState(doc(p())), () => {});
    await flushPromises();
    expect(document.activeElement).toBe(placeEl("field:agree"));
    // all filled: nowhere to go
    changeStamps("t", [
      ...["field:signature", PLACE_DATE, SIGNATURE_LINE, "found:1:404:359"].map(
        (place, at) => ({
          id: `s${at}`,
          kind: "signature" as const,
          page: 0,
          rect: [0, 0, 10, 10] as [number, number, number, number],
          natural: [10, 10] as const,
          place,
          spec: stampSpec("signature"),
        }),
      ),
    ]);
    changeSheet("t", {
      fills: [
        { field: "name", value: "Ada" },
        { field: "agree", value: true },
      ],
    });
    await flushPromises();
    expect(next().textContent?.trim()).toBe("All places filled");
    expect(next().getAttribute("aria-disabled")).toBe("true");
    expect(nextShownPlace()(createState(doc(p())))).toBe(false);
  });

  it("fill a text field in, prefilled with what it asks for", async () => {
    const input = placeEl("field:name") as HTMLInputElement;
    input.focus();
    await flushPromises();
    expect(input.classList).toContain("editing");
    expect(input.value).toBe("Ada Lovelace");
    expect(input.maxLength).toBe(40);
    input.value = "Ada King";
    input.dispatchEvent(new Event("input"));
    await press(input, "Enter");
    expect(setFills).toHaveBeenLastCalledWith("t", [
      { field: "name", value: "Ada King" },
    ]);
    expect(fillsOf("t")).toEqual([{ field: "name", value: "Ada King" }]);
    expect(hasChanges("t")).toBe(true);
    // the page it changed draws again
    expect(pageRevisions.value.get("t:0")).toBe(1);
    // undo takes it back, and the helper gets the set without it
    view().focus();
    await flushPromises();
    await press(view(), "Mod-z");
    expect(fillsOf("t")).toEqual([]);
    expect(setFills).toHaveBeenLastCalledWith("t", []);
  });

  it("fill in what they suggest on Enter only, not when Tab passes", async () => {
    const input = placeEl("field:name") as HTMLInputElement;
    input.focus();
    await flushPromises();
    input.blur();
    await flushPromises();
    expect(setFills).not.toHaveBeenCalled();
    input.focus();
    await flushPromises();
    await press(input, "Enter");
    expect(fillsOf("t")).toEqual([{ field: "name", value: "Ada Lovelace" }]);
  });

  it("refuse what the field's font can't show, and keep what it had", async () => {
    vi.mocked(setFills).mockRejectedValue("missingGlyphs");
    const input = placeEl("field:name") as HTMLInputElement;
    input.focus();
    await flushPromises();
    input.value = "Łukasz";
    input.dispatchEvent(new Event("input"));
    await press(input, "Enter");
    expect(fillsOf("t")).toEqual([]);
    expect(fieldProblem.value?.field).toBe("name");
    const problem = document.querySelector(".pdf-field-problem")!;
    expect(problem.textContent?.trim()).toBe(
      "This field's font can't show some of these characters",
    );
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  it("tick a checkbox", async () => {
    placeEl("field:agree").click();
    await flushPromises();
    expect(fillsOf("t")).toEqual([{ field: "agree", value: true }]);
    expect(placeEl("field:agree").getAttribute("aria-checked")).toBe("true");
  });

  it("send the fills again to a helper opened afresh", async () => {
    changeSheet("t", { fills: [{ field: "name", value: "Ada" }] });
    await flushPromises();
    expect(setFills).toHaveBeenLastCalledWith("t", [
      { field: "name", value: "Ada" },
    ]);
    vi.mocked(setFills).mockClear();
    // Open again: the same file, a new helper
    shownPdf.value = { ...pdf, opened: { ...pdf.opened! } };
    await flushPromises();
    expect(setFills).toHaveBeenCalledWith("t", [
      { field: "name", value: "Ada" },
    ]);
  });
});

describe("signing a PDF received", () => {
  let dispose = () => {};

  const sign = async (
    choices: Partial<Parameters<SignDialogRequest["submit"]>[0]> = {},
  ) => {
    document
      .querySelector<HTMLElement>("#signing-toolbar .signing-sign")!
      .click();
    await flushPromises();
    const request = signDialog.value!;
    signDialog.value = null;
    request.submit({
      pos: null,
      place: "Berlin",
      reason: "",
      passphrase: "secret",
      initials: { on: false, side: "right" },
      open: false,
      ...choices,
    });
    await flushPromises();
    return request;
  };
  const asked = () => {
    const [request, parts] = vi.mocked(signPdf).mock.lastCall!;
    return { request: request as SignRequest, parts };
  };

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
    vi.mocked(pdfFields).mockResolvedValue(fields);
    vi.mocked(pageText).mockResolvedValue(text);
    vi.mocked(setFills).mockResolvedValue([0]);
    vi.mocked(pdfRules).mockResolvedValue(rules());
    vi.mocked(signPdf).mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
    vi.mocked(save).mockResolvedValue("/docs/contract signed.pdf");
    savedMarks.value = { signature: mark, initials: mark };
    signingPlace.value = "Berlin";
    shownPdf.value = pdf;
    dispose = bootApp(createTestHandle(createState(doc(p()))));
    await flushPromises();
  });

  afterEach(() => {
    dispose();
    resetStampBooks();
    resetPlaces();
    resetFills();
    shownPdf.value = null;
    shownPdfRules.value = null;
    savedMarks.value = undefined;
    selectedStamp.value = null;
    signDialog.value = null;
    signingPlace.value = "";
    tabs.value = [];
    activeTabId.value = null;
    pdfBitmaps.clear();
  });

  it("asks in the Sign dialog, with what's still empty", async () => {
    document
      .querySelector<HTMLElement>("#signing-toolbar .signing-sign")!
      .click();
    await flushPromises();
    expect(signDialog.value).toMatchObject({
      mode: "pdf",
      title: "contract",
      stamped: false,
      emptyFields: 6,
      initials: { on: false },
    });
    expect(document.getElementById("sign-dialog")).not.toBeNull();
  });

  it("signs in the signature field the signature fills, with the fills", async () => {
    placeEl("field:signature").click();
    await flushPromises();
    changeSheet("t", { fills: [{ field: "name", value: "Ada" }] });
    await sign();
    expect(save).toHaveBeenCalledWith({
      filters: [expect.objectContaining({ extensions: ["pdf"] })],
      defaultPath: "/docs/contract signed.pdf",
    });
    const { request, parts } = asked();
    expect(request.source).toEqual({
      kind: "tab",
      tab: "t",
      path: "/docs/contract.pdf",
      sha256: "abc",
      fills: [{ field: "name", value: "Ada" }],
    });
    expect(request.passphrase).toBe("secret");
    expect(request.plan.signature).toEqual({
      kind: "existing",
      field: "signature",
      stamp: 0,
    });
    expect(parts).toHaveLength(1);
    expect(writeFile).toHaveBeenCalledWith(
      "/docs/contract signed.pdf",
      new Uint8Array([37, 80, 68, 70]),
    );
    expect(announcement.value?.text).toBe(
      "Signed and saved as contract signed.pdf",
    );
    // done with: nothing unsaved
    expect(hasChanges("t")).toBe(false);
    expect(stampsOf("t")).toEqual([]);
    expect(openPaths).not.toHaveBeenCalled();
  });

  it("signs a found line in a new field there, and opens the signed PDF", async () => {
    placeEl(SIGNATURE_LINE).click();
    await flushPromises();
    await sign({ open: true });
    expect(asked().request.plan.signature).toEqual({
      kind: "new",
      page: 2,
      rect: [146, 315.75, 108, 36],
      stamp: 0,
    });
    await vi.waitFor(() =>
      expect(openPaths).toHaveBeenCalledWith(["/docs/contract signed.pdf"]),
    );
  });

  it("draws the signature into the page without a digital signature", async () => {
    placeEl("field:signature").click();
    await flushPromises();
    await sign({ passphrase: null });
    const { request } = asked();
    expect(request.passphrase).toBeNull();
    expect(request.plan.signature).toEqual({ kind: "invisible" });
    expect(request.plan.stamps).toEqual([
      { part: 0, page: 1, rect: [125, 292, 150, 50], repeat: false },
    ]);
  });

  it("writes nothing when the signer fails, and says why", async () => {
    vi.mocked(signPdf).mockRejectedValue({ kind: "fileChanged" });
    placeEl("field:signature").click();
    await flushPromises();
    await sign();
    expect(writeFile).not.toHaveBeenCalled();
    expect(sendNotification).toHaveBeenCalledWith({
      title: "Signed PDF",
      body: "The PDF changed after Blank opened it. Nothing was saved.",
    });
    // still there to sign again
    expect(stampsOf("t")).toHaveLength(1);
  });

  it("writes nothing when the save dialog is cancelled", async () => {
    vi.mocked(save).mockResolvedValue(null);
    await sign();
    expect(signPdf).not.toHaveBeenCalled();
  });

  it("puts the initials on every page from the dialog", async () => {
    document
      .querySelector<HTMLElement>("#signing-toolbar .signing-sign")!
      .click();
    await flushPromises();
    const request = signDialog.value!;
    request.setInitials!({ on: true, side: "left" });
    await flushPromises();
    const [initials] = stampsOf("t");
    expect(initials).toMatchObject({ kind: "initials", repeat: true, page: 0 });
    expect(initials.rect[0]).toBe(36);
    request.setInitials!({ on: true, side: "right" });
    await flushPromises();
    expect(stampsOf("t")[0].rect[0]).toBeCloseTo(595 - 36 - initials.rect[2]);
    request.setInitials!({ on: false, side: "right" });
    await flushPromises();
    expect(stampsOf("t")).toEqual([]);
  });
});
