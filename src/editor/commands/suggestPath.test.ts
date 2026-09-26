import { beforeEach, describe, expect, it } from "vitest";

import { importedFrom, path } from "../../state";
import suggestPath from "./suggestPath";

describe("command.suggestPath", () => {
  beforeEach(() => {
    path.value = null;
    importedFrom.value = null;
  });

  it("suggests the name of the imported Word document", () => {
    importedFrom.value = "/docs/report.docx";
    expect(suggestPath("md")).toBe("/docs/report.md");

    path.value = "/docs/saved.md";
    expect(suggestPath("pdf")).toBe("/docs/saved.pdf");
  });

  it("suggests the document's name with the extension", () => {
    path.value = "/docs/report.md";
    expect(suggestPath("pdf")).toBe("/docs/report.pdf");
  });

  it("suggests nothing for an untitled document", () => {
    expect(suggestPath("pdf")).toBeUndefined();
  });
});
