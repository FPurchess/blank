import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  announcement,
  fieldProblem,
  pageRevisions,
  shownPdfRules,
  signingTabs,
  stampBooks,
} from "../state";
import { flushPromises } from "../test/async";
import {
  FORM_FIELDS,
  pdfDocument,
  pdfRulesOf,
  resetPdfState,
  showPdf,
} from "../test/pdf";
import {
  commitFill,
  FORM_FAILED,
  forgetFills,
  pageRevision,
  syncFills,
} from "./fills";
import { type Fill, setFills } from "./ipc";
import { MISSING_GLYPHS } from "./placeModel";
import { fillsOf, redoStamps, undoStamps } from "./stampBooks";
import { CHECKING, FIELD_LOCKED, RESTRICTED, SIGNING } from "./toolRules";

// The fills of a PDF tab's form (fills.ts): one after the other, each a
// step of the tab's history, refused where the field can't take them, and
// sent again whenever the history holds another set than the helper.

vi.mock("./ipc", async (original) => ({
  ...(await original<typeof import("./ipc")>()),
  setFills: vi.fn(),
}));

vi.mock("./stampEngine", () => ({ releaseStamp: vi.fn(async () => {}) }));

vi.mock("../engine/engine", async (original) => ({
  ...(await original<typeof import("../engine/engine")>()),
  engineless: () => false,
}));

const [name, agree] = FORM_FIELDS;
const pdf = pdfDocument(2);
const past = () => stampBooks.value.get("t")?.book.past.length ?? 0;

// a call of setFills that answers once `answer` is called
const held = () => {
  let answer: (pages: number[]) => void = () => {};
  vi.mocked(setFills).mockImplementationOnce(
    () => new Promise((resolve) => (answer = resolve)),
  );
  return (pages: number[]) => answer(pages);
};

describe("the fills of a PDF's form", () => {
  beforeEach(() => {
    vi.mocked(setFills).mockResolvedValue([0]);
    showPdf(pdf);
  });

  afterEach(() => {
    resetPdfState();
  });

  it("fill fields one after another, each on the set before it", async () => {
    const first = held();
    const second = held();
    const ada = commitFill(name, "Ada");
    const ticked = commitFill(agree, true);
    await flushPromises();
    // the second waits for the first
    expect(setFills).toHaveBeenCalledTimes(1);
    first([0]);
    await flushPromises();
    second([0]);
    expect(await ada).toBe(true);
    expect(await ticked).toBe(true);
    const both: Fill[] = [
      { field: "name", value: "Ada" },
      { field: "agree", value: true },
    ];
    expect(vi.mocked(setFills).mock.lastCall).toEqual(["t", both]);
    expect(fillsOf("t")).toEqual(both);
    expect(past()).toBe(2);
  });

  it("make no step for what a field holds already, e.g. Enter then leaving it", async () => {
    await Promise.all([commitFill(name, "Ada"), commitFill(name, "Ada")]);
    expect(setFills).toHaveBeenCalledTimes(1);
    expect(past()).toBe(1);
  });

  it("draw the pages a fill changed again", async () => {
    vi.mocked(setFills).mockResolvedValue([1]);
    await commitFill(name, "Ada");
    expect(pageRevision("t", 0)).toBe(0);
    expect(pageRevision("t", 1)).toBe(1);
    // a closed tab's go
    forgetFills(new Set());
    expect(pageRevisions.value.size).toBe(0);
  });

  it("keep the last set when one is refused, and say why under the field", async () => {
    vi.mocked(setFills).mockRejectedValue({
      kind: "missingGlyphs",
      field: "name",
    });
    expect(await commitFill(name, "Ωμέγα")).toBe(false);
    expect(fieldProblem.value).toEqual({
      tab: "t",
      field: "name",
      text: MISSING_GLYPHS,
    });
    expect(announcement.value?.text).toBe(MISSING_GLYPHS);
    expect(fillsOf("t")).toEqual([]);
    expect(past()).toBe(0);
  });

  it("refuse fields Blank can't fill in now, and say why", async () => {
    const refused = async (why: string) => {
      expect(await commitFill(name, "Ada")).toBe(false);
      expect(announcement.value?.text).toBe(why);
      expect(setFills).not.toHaveBeenCalled();
    };
    shownPdfRules.value = {
      sha256: "abc",
      rules: pdfRulesOf({ locked: ["name"] }),
    };
    await refused(FIELD_LOCKED);
    shownPdfRules.value = null;
    await refused(CHECKING);
    shownPdfRules.value = {
      sha256: "abc",
      rules: pdfRulesOf({ encrypted: true }),
    };
    await refused(RESTRICTED);
    shownPdfRules.value = { sha256: "abc", rules: pdfRulesOf() };
    signingTabs.value = new Set(["t"]);
    await refused(SIGNING);
  });

  it("send the set undo and redo bring back", async () => {
    await commitFill(name, "Ada");
    undoStamps("t");
    await syncFills();
    expect(vi.mocked(setFills).mock.lastCall).toEqual(["t", []]);
    redoStamps("t");
    await syncFills();
    expect(vi.mocked(setFills).mock.lastCall).toEqual([
      "t",
      [{ field: "name", value: "Ada" }],
    ]);
    // the helper holds it: nothing to send
    await syncFills();
    expect(setFills).toHaveBeenCalledTimes(3);
  });

  it("say when the helper didn't take the set, and send it again later", async () => {
    await commitFill(name, "Ada");
    undoStamps("t");
    vi.mocked(setFills).mockRejectedValueOnce("crashed");
    await syncFills();
    expect(announcement.value?.text).toBe(FORM_FAILED);
    await syncFills();
    expect(setFills).toHaveBeenCalledTimes(3);
    expect(vi.mocked(setFills).mock.lastCall).toEqual(["t", []]);
  });
});
