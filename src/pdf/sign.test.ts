import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { loadMarks } from "../signing/marks";
import { pdfRules, type SignRequest, signPdf } from "../signing/ipc";
import {
  activeTabId,
  announcement,
  type SignChoices,
  signDialog,
  type SignDialogRequest,
  signingInitials,
  signingTabs,
  shownPdfRules,
  tabs,
} from "../state";
import { flushPromises } from "../test/async";
import { createState, doc, p } from "../test/editor";
import {
  pdfDocument,
  pdfRulesOf,
  pdfTab,
  resetPdfState,
  showPdf,
  testStamp,
} from "../test/pdf";
import { readShownRules, signShownPdf } from "./sign";
import { changeStamps, stampsOf } from "./stampBooks";
import { stampPdf } from "./stampEngine";
import { CHECKING, RESTRICTED, SIGNING, VISIBLE_ON_SIGNED } from "./toolRules";

// Signing a PDF received (sign.ts): what refuses it, what the Sign dialog
// is asked, what it signs, and that a failure keeps what was placed.

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

vi.mock("../editor/tabs", () => ({ openPaths: vi.fn(async () => {}) }));

vi.mock("./stampEngine", () => ({
  naturalSize: vi.fn(async () => ({ width: 90, height: 14 })),
  releaseStamp: vi.fn(async () => {}),
  stampPdf: vi.fn(async () => new Uint8Array([1])),
}));

vi.mock("../engine/engine", async (original) => ({
  ...(await original<typeof import("../engine/engine")>()),
  engineless: () => false,
}));

const pdf = pdfDocument(2);
const state = createState(doc(p()));
const run = () => signShownPdf()(state, () => {});
const canSign = () => signShownPdf()(state);

/**
 * ask opens the Sign dialog and returns its request
 */
const ask = async (): Promise<SignDialogRequest> => {
  run();
  await flushPromises();
  return signDialog.value!;
};

const CHOICES: SignChoices = {
  pos: null,
  place: "Berlin",
  reason: "",
  passphrase: "secret",
  initials: { on: false, side: "right" },
  open: false,
};

/**
 * sign signs as `choices` say, from the Sign dialog
 */
const sign = async (choices: Partial<SignChoices> = {}) => {
  const request = await ask();
  signDialog.value = null;
  request.submit({ ...CHOICES, ...choices });
  await flushPromises();
};

describe("signing a PDF received", () => {
  beforeEach(() => {
    showPdf(pdf);
    vi.mocked(save).mockResolvedValue("/docs/contract signed.pdf");
    vi.mocked(signPdf).mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
    changeStamps("t", [testStamp()]);
  });

  afterEach(() => {
    resetPdfState();
  });

  it("refuses a PDF it can't sign yet or at all, and says why", async () => {
    shownPdfRules.value = null;
    expect(canSign()).toBe(false);
    run();
    expect(announcement.value?.text).toBe(CHECKING);
    shownPdfRules.value = {
      sha256: "abc",
      rules: pdfRulesOf({ encrypted: true }),
    };
    run();
    await flushPromises();
    expect(announcement.value?.text).toBe(RESTRICTED);
    expect(signDialog.value).toBeNull();
  });

  it("signs only the stamps on the pages the PDF has", async () => {
    changeStamps("t", [testStamp(), testStamp({ id: "far", page: 5 })]);
    await sign();
    const [request, parts] = vi.mocked(signPdf).mock.lastCall!;
    expect(parts).toHaveLength(1);
    expect((request as SignRequest).plan.stamps).toEqual([]);
    expect(stampsOf("t")).toEqual([]);
  });

  it("lets nothing change while it signs, and only then is done with the stamps", async () => {
    let answer: (bytes: Uint8Array<ArrayBuffer>) => void = () => {};
    vi.mocked(signPdf).mockImplementationOnce(
      () => new Promise((resolve) => (answer = resolve)),
    );
    await sign();
    expect(signingTabs.value.has("t")).toBe(true);
    expect(canSign()).toBe(false);
    changeStamps("t", []);
    expect(announcement.value?.text).toBe(SIGNING);
    expect(stampsOf("t")).toHaveLength(1);
    answer(new Uint8Array([37]));
    await flushPromises();
    expect(signingTabs.value.size).toBe(0);
    expect(stampsOf("t")).toEqual([]);
    expect(announcement.value?.text).toBe(
      "Signed and saved as contract signed.pdf",
    );
  });

  it("keeps what was placed when the signed PDF can't be written", async () => {
    vi.mocked(writeFile).mockRejectedValueOnce(new Error("disk full"));
    await sign();
    expect(stampsOf("t")).toHaveLength(1);
    expect(signingTabs.value.size).toBe(0);
    expect(vi.mocked(sendNotification).mock.lastCall?.[0]).toMatchObject({
      title: "Signed PDF",
      body: expect.stringContaining("Nothing was saved."),
    });
  });

  it("signs nothing when a stamp's PDF can't be made", async () => {
    vi.mocked(stampPdf).mockRejectedValueOnce(new Error("no layout"));
    await sign();
    expect(signPdf).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
    expect(stampsOf("t")).toHaveLength(1);
  });

  it("asks nothing when the signature can't be read", async () => {
    vi.mocked(loadMarks).mockRejectedValueOnce(new Error("unreadable"));
    run();
    await flushPromises();
    expect(signDialog.value).toBeNull();
    expect(sendNotification).toHaveBeenCalled();
  });

  it("signs nothing once another tab shows", async () => {
    const request = await ask();
    tabs.value = [...tabs.value, pdfTab("other")];
    activeTabId.value = "other";
    signDialog.value = null;
    request.submit(CHOICES);
    await flushPromises();
    expect(save).not.toHaveBeenCalled();
    expect(stampsOf("t")).toHaveLength(1);
  });

  it("signs a PDF others signed only digitally", async () => {
    shownPdfRules.value = {
      sha256: "abc",
      rules: pdfRulesOf({ signed: true }),
    };
    expect((await ask()).visibleRefusal).toBe(VISIBLE_ON_SIGNED);
    shownPdfRules.value = { sha256: "abc", rules: pdfRulesOf() };
    signDialog.value = null;
    expect((await ask()).visibleRefusal).toBeUndefined();
  });

  it("takes back the initials the dialog put on when it's cancelled", async () => {
    const request = await ask();
    request.setInitials!({ on: true, side: "left" });
    await flushPromises();
    expect(stampsOf("t").some((stamp) => stamp.kind === "initials")).toBe(true);
    signDialog.value = null;
    request.cancel();
    expect(stampsOf("t")).toEqual([testStamp()]);
  });

  it("remembers the initials chosen once it signed", async () => {
    await sign({ initials: { on: true, side: "left" } });
    expect(signingInitials.value).toEqual({ on: true, side: "left" });
  });

  it("lets the tools place anything when the PDF's rules can't be read", async () => {
    shownPdfRules.value = null;
    vi.mocked(pdfRules).mockRejectedValueOnce({ kind: "failed", message: "" });
    await readShownRules();
    expect(shownPdfRules.value).toEqual({
      sha256: "abc",
      rules: pdfRulesOf(),
    });
  });
});
