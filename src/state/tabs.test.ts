import { afterEach, describe, expect, it } from "vitest";

import {
  activeTab,
  activeTabId,
  freeUntitledNumber,
  type Tab,
  tabLabel,
  tabs,
  tabTooltip,
  updateTab,
} from "./tabs";

const tab = (id: string, change: Partial<Tab> = {}): Tab => ({
  id,
  path: null,
  importedFrom: null,
  untitledNumber: null,
  unsaved: false,
  viewAnchor: null,
  ...change,
});

afterEach(() => {
  tabs.value = [];
  activeTabId.value = null;
});

describe("tabLabel", () => {
  it.each([
    ["/docs/notes.md", "notes"],
    ["C:\\docs\\Report.MARKDOWN", "Report"],
    ["/docs/v1.2 draft.md", "v1.2 draft"],
    ["/docs/notes.txt", "notes.txt"],
    ["/docs/README", "README"],
  ])("names a tab of %s %j", (path, label) => {
    expect(tabLabel(tab("a", { path }))).toBe(label);
  });

  it("names an import after its Word document", () => {
    expect(tabLabel(tab("a", { importedFrom: "/docs/Report.docx" }))).toBe(
      "Report",
    );
  });

  it("names untitled tabs by their number", () => {
    expect(tabLabel(tab("a", { untitledNumber: 1 }))).toBe("Untitled");
    expect(tabLabel(tab("a", { untitledNumber: 3 }))).toBe("Untitled 3");
    expect(tabLabel(tab("a", { welcome: true }))).toBe("Welcome");
  });
});

describe("tabTooltip", () => {
  it("tells where the document is", () => {
    expect(tabTooltip(tab("a", { path: "/docs/notes.md" }))).toBe(
      "/docs/notes.md",
    );
    expect(tabTooltip(tab("a", { importedFrom: "/r.docx" }))).toBe(
      "Imported from /r.docx, not saved yet",
    );
    expect(tabTooltip(tab("a", { untitledNumber: 1 }))).toBe("Not saved yet");
  });
});

describe("freeUntitledNumber", () => {
  it("returns the lowest number no untitled tab has", () => {
    expect(freeUntitledNumber([])).toBe(1);
    expect(
      freeUntitledNumber([
        tab("a", { untitledNumber: 1 }),
        tab("b", { untitledNumber: 3 }),
        tab("c", { path: "/x.md" }),
      ]),
    ).toBe(2);
  });
});

describe("updateTab and activeTab", () => {
  it("replace the list, and follow the active tab", () => {
    const before = [tab("a"), tab("b")];
    tabs.value = before;
    activeTabId.value = "b";

    updateTab("b", { unsaved: true });

    expect(tabs.value).not.toBe(before);
    expect(tabs.value[0]).toBe(before[0]);
    expect(activeTab.value).toMatchObject({ id: "b", unsaved: true });
  });
});
