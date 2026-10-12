import { afterEach, describe, expect, it } from "vitest";

import { CommandIdentifier } from "../config";
import {
  activeTabId,
  announcement,
  shownPdf,
  signaturesPopover,
  tabs,
} from "../state";
import {
  forPdf,
  pdfRefusal,
  showSignatures,
  SIGN_RECEIVED_REFUSAL,
} from "./commands";

const run = () => true;

const showTab = (kind: "markdown" | "pdf") => {
  tabs.value = [
    {
      id: "a",
      kind,
      path: "/a.pdf",
      importedFrom: null,
      untitledNumber: null,
      unsaved: false,
      viewAnchor: null,
    },
  ];
  activeTabId.value = "a";
};

afterEach(() => {
  shownPdf.value = null;
  signaturesPopover.value = null;
  tabs.value = [];
  activeTabId.value = null;
});

describe("commands in a PDF tab", () => {
  it("says why a command of the text doesn't run", () => {
    expect(pdfRefusal(CommandIdentifier.FORMAT_BOLD)).toBe(
      "Blank can't change the text of a PDF",
    );
    expect(pdfRefusal(CommandIdentifier.EDIT_FIND)).toBe(
      "Blank can't search PDFs yet",
    );
    expect(pdfRefusal(CommandIdentifier.FILE_SAVE)).toMatch(/Sign the PDF/);
    expect(pdfRefusal(CommandIdentifier.TAB_CLOSE)).toBeNull();
    expect(pdfRefusal(CommandIdentifier.APP_SETTINGS)).toBeNull();
  });

  it("says once that received PDFs can't be signed yet", () => {
    for (const id of [
      CommandIdentifier.EXPORT_SIGNED_PDF,
      CommandIdentifier.INSERT_SIGNATURE,
      CommandIdentifier.SIGNING_SIGNATURE,
      CommandIdentifier.SIGNING_INITIALS,
    ])
      expect(pdfRefusal(id)).toBe(SIGN_RECEIVED_REFUSAL);
  });

  it("says why in a sentence for every command that doesn't run", () => {
    for (const id of Object.values(CommandIdentifier)) {
      const refusal = pdfRefusal(id);
      if (refusal !== null) expect(refusal).not.toMatch(/isn't for PDFs|…/);
    }
  });

  it("can't run there, and its key says why", () => {
    showTab("pdf");
    const bold = forPdf(CommandIdentifier.FORMAT_BOLD, run);
    const state = {} as never;

    expect(bold(state)).toBe(false);
    expect(bold(state, () => {})).toBe(true);
    expect(announcement.value?.text).toBe(
      "Blank can't change the text of a PDF",
    );
    expect(forPdf(CommandIdentifier.TAB_NEXT, run)(state)).toBe(true);
  });

  it("runs as it does in a markdown tab", () => {
    showTab("markdown");
    expect(forPdf(CommandIdentifier.FORMAT_BOLD, run)({} as never)).toBe(true);
  });
});

describe("the signatures command", () => {
  it("waits for the check before it lists them", () => {
    shownPdf.value = {
      path: "/a.pdf",
      opened: null,
      problem: null,
      failedPages: [],
      signatures: null,
    };
    showSignatures()({} as never, () => {});
    expect(signaturesPopover.value).toBeNull();
    expect(announcement.value?.text).toBe(
      "The signatures are still being checked",
    );

    shownPdf.value = { ...shownPdf.value, signatures: [] };
    showSignatures()({} as never, () => {});
    expect(signaturesPopover.value).not.toBeNull();
  });
});
