import { afterEach, describe, expect, it } from "vitest";

import { CommandIdentifier } from "../config";
import { activeTabId, announcement, tabs } from "../state";
import { forPdf, pdfRefusal } from "./commands";

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
  tabs.value = [];
  activeTabId.value = null;
});

describe("commands in a PDF tab", () => {
  it("says why a command of the text doesn't run", () => {
    expect(pdfRefusal(CommandIdentifier.FORMAT_BOLD)).toBe(
      "Bold isn't for PDFs",
    );
    expect(pdfRefusal(CommandIdentifier.FILE_SAVE)).toMatch(/nothing to save/);
    expect(pdfRefusal(CommandIdentifier.TAB_CLOSE)).toBeNull();
    expect(pdfRefusal(CommandIdentifier.APP_SETTINGS)).toBeNull();
  });

  it("can't run there, and its key says why", () => {
    showTab("pdf");
    const bold = forPdf(CommandIdentifier.FORMAT_BOLD, run);
    const state = {} as never;

    expect(bold(state)).toBe(false);
    expect(bold(state, () => {})).toBe(true);
    expect(announcement.value?.text).toBe("Bold isn't for PDFs");
    expect(forPdf(CommandIdentifier.TAB_NEXT, run)(state)).toBe(true);
  });

  it("runs as it does in a markdown tab", () => {
    showTab("markdown");
    expect(forPdf(CommandIdentifier.FORMAT_BOLD, run)({} as never)).toBe(true);
  });
});
