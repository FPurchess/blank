import type { PdfTabDocument } from "../pdf/document";
import type { PageText, PdfField } from "../pdf/ipc";
import { resetFills } from "../pdf/fills";
import { resetPlaces } from "../pdf/placesRead";
import { resetStampBooks } from "../pdf/stampBooks";
import { type Stamp, stampSpec } from "../pdf/stampModel";
import type { PdfRules } from "../signing/ipc";
import type { SavedMark } from "../signing/profile";
import {
  activeTabId,
  placeDialog,
  placingStamp,
  savedMarks,
  selectedStamp,
  shownPdf,
  shownPdfRules,
  signatureDialog,
  signDialog,
  signingCertificate,
  signingPlace,
  signingTabs,
  type Tab,
  tabs,
} from "../state";

// What the tests of PDF tabs share: a PDF as it opened, what it allows, its
// fields and words (form.pdf's), stamps, the user's marks, a PDF tab shown,
// and the shared state put back after each test. The modules they mock
// stay in each test file, since vi.mock only applies there.

export const A4 = { width: 595, height: 842, rotation: 0 };

/**
 * pdfDocument returns a PDF tab's document of `pages` A4 pages, opened
 */
export const pdfDocument = (
  pages = 2,
  over: Partial<PdfTabDocument> = {},
): PdfTabDocument => ({
  path: "/docs/contract.pdf",
  opened: {
    sha256: "abc",
    pages: Array.from({ length: pages }, () => A4),
    repaired: false,
    encrypted: false,
  },
  problem: null,
  failedPages: [],
  signatures: [],
  ...over,
});

/**
 * pdfRules returns what a PDF allows: nobody signed it, unless `over` says
 */
export const pdfRulesOf = (over: Partial<PdfRules> = {}): PdfRules => ({
  signed: false,
  docmdp: null,
  encrypted: false,
  damaged: false,
  locked: [],
  ...over,
});

/**
 * pdfField returns a text field `name` of a form, unless `more` says else
 */
export const pdfField = (name: string, more: Partial<PdfField>): PdfField => ({
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
export const FORM_FIELDS: PdfField[] = [
  pdfField("name", {
    label: "Your name",
    widgets: [{ page: 0, rect: [100, 122, 200, 20], onValue: null }],
  }),
  pdfField("agree", {
    kind: "checkbox",
    value: "Off",
    widgets: [{ page: 0, rect: [100, 177, 15, 15], onValue: "Yes" }],
  }),
  pdfField("signature", {
    kind: "signature",
    widgets: [{ page: 0, rect: [100, 292, 200, 50], onValue: null }],
  }),
];

// form.pdf's words: "Unterschrift" under a rule, and "Ort, Datum: ____"
export const FORM_TEXT: PageText = {
  words: [
    { text: "Unterschrift", rect: [100, 364.82, 51.12, 9.25] },
    { text: "Ort,", rect: [350, 364.82, 16.67, 9.25] },
    { text: "Datum:", rect: [369.45, 364.82, 32.23, 9.25] },
    { text: "______________", rect: [404.46, 364.82, 77.84, 9.25] },
  ],
  rules: [[100, 351.75, 200, 0.5]],
};

// the user's signature or initials, a picture of 300 × 100
export const MARK: SavedMark = {
  source: { kind: "image" },
  png: "",
  width: 300,
  height: 100,
};

/**
 * testStamp returns a signature stamp on the first page, unless `over` says
 */
export const testStamp = (over: Partial<Stamp> = {}): Stamp => ({
  id: "s1",
  kind: "signature",
  page: 0,
  rect: [100, 100, 180, 60],
  natural: [180, 60],
  spec: stampSpec("signature"),
  ...over,
});

/**
 * pdfTab returns the PDF tab `id` of `path`
 */
export const pdfTab = (id = "t", path = "/docs/contract.pdf"): Tab => ({
  id,
  kind: "pdf",
  path,
  importedFrom: null,
  untitledNumber: null,
  unsaved: false,
  viewAnchor: null,
});

/**
 * showPdf shows `doc` in the one tab, "t", with the user's marks and
 * `rules` read already, unless null
 */
export const showPdf = (
  doc: PdfTabDocument,
  rules: PdfRules | null = pdfRulesOf(),
) => {
  tabs.value = [pdfTab("t", doc.path)];
  activeTabId.value = "t";
  shownPdf.value = doc;
  shownPdfRules.value =
    rules && doc.opened ? { sha256: doc.opened.sha256, rules } : null;
  savedMarks.value = { signature: MARK, initials: MARK };
};

/**
 * resetPdfState puts back what the tests of PDF tabs change
 */
export const resetPdfState = () => {
  resetStampBooks();
  resetPlaces();
  resetFills();
  shownPdf.value = null;
  shownPdfRules.value = null;
  savedMarks.value = undefined;
  selectedStamp.value = null;
  placingStamp.value = null;
  signDialog.value = null;
  signatureDialog.value = null;
  placeDialog.value = null;
  signingPlace.value = "";
  signingCertificate.value = null;
  signingTabs.value = new Set();
  tabs.value = [];
  activeTabId.value = null;
};
