import { describe, expect, it } from "vitest";
import JSZip from "jszip";

import { prepareDocx, readWordProperties } from "./prepare";

const CORE = (inner: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">${inner}</cp:coreProperties>`;
const CUSTOM = (name: string, value: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="${name}"><vt:lpwstr>${value}</vt:lpwstr></property></Properties>`;

const zipOf = (files: Record<string, string>) => {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  return zip;
};

describe("importers.docx.readWordProperties", () => {
  it("reads the title and author", async () => {
    const zip = zipOf({
      "docProps/core.xml": CORE(
        "<dc:title> Report </dc:title><dc:creator>Ada</dc:creator>",
      ),
    });

    expect(await readWordProperties(zip)).toEqual({
      title: "Report",
      author: "Ada",
    });
  });

  it("ignores empty values and Word's placeholder author", async () => {
    const zip = zipOf({
      "docProps/core.xml": CORE(
        "<dc:title></dc:title><dc:creator>Un-named</dc:creator>",
      ),
    });

    expect(await readWordProperties(zip)).toEqual({});
  });

  it("reads the frontmatter Blank kept", async () => {
    const zip = zipOf({
      "docProps/custom.xml": CUSTOM("BlankFrontmatter", "title: Hi\n# note"),
    });

    expect(await readWordProperties(zip)).toEqual({
      frontmatter: "title: Hi\n# note",
    });
  });

  it("ignores other custom properties and broken parts", async () => {
    const zip = zipOf({
      "docProps/core.xml": "<not xml",
      "docProps/custom.xml": CUSTOM("Department", "Sales"),
    });

    expect(await readWordProperties(zip)).toEqual({});
  });

  it("reads documents without properties", async () => {
    expect(await readWordProperties(zipOf({}))).toEqual({});
  });
});

describe("importers.docx.prepareDocx", () => {
  it("returns the file as it is if nothing had to change", async () => {
    const bytes = await zipOf({
      "word/document.xml": "<w:document/>",
    }).generateAsync({ type: "uint8array" });

    expect((await prepareDocx(bytes)).bytes).toBe(bytes);
  });
});
