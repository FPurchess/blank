import { describe, expect, it } from "vitest";
import JSZip from "jszip";

import { fixPackage } from "./fixups";

const pack = (files: Record<string, string>) => {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  return zip.generateAsync({ type: "uint8array" });
};

const unpack = async (contents: Uint8Array) => {
  const zip = await JSZip.loadAsync(contents);
  return (name: string) => zip.file(name)?.async("string") ?? null;
};

describe("exporter.docx.fixPackage", () => {
  it("keeps real comments", async () => {
    const comments = '<w:comments><w:comment w:id="0"/></w:comments>';
    const file = await unpack(
      await fixPackage(await pack({ "word/comments.xml": comments })),
    );

    expect(await file("word/comments.xml")).toBe(comments);
  });

  it("removes empty comments with their relationship and content type", async () => {
    const file = await unpack(
      await fixPackage(
        await pack({
          "word/comments.xml": "<w:comments/>",
          "word/_rels/comments.xml.rels": "<Relationships/>",
          "word/_rels/document.xml.rels":
            '<Relationships><Relationship Id="rId1" Target="styles.xml"/><Relationship Id="rId2" Target="comments.xml"/></Relationships>',
          "[Content_Types].xml":
            '<Types><Override PartName="/word/document.xml"/><Override PartName="/word/comments.xml"/></Types>',
        }),
      ),
    );

    expect(await file("word/comments.xml")).toBeNull();
    expect(await file("word/_rels/comments.xml.rels")).toBeNull();
    expect(await file("word/_rels/document.xml.rels")).toBe(
      '<Relationships><Relationship Id="rId1" Target="styles.xml"/></Relationships>',
    );
    expect(await file("[Content_Types].xml")).toBe(
      '<Types><Override PartName="/word/document.xml"/></Types>',
    );
  });

  it("makes Normal the default paragraph style", async () => {
    const file = await unpack(
      await fixPackage(
        await pack({
          "word/styles.xml":
            '<w:styles><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>',
        }),
      ),
    );

    expect(await file("word/styles.xml")).toBe(
      '<w:styles><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>',
    );
  });

  it("leaves documents without these parts alone", async () => {
    const file = await unpack(
      await fixPackage(await pack({ "word/document.xml": "<w:document/>" })),
    );

    expect(await file("word/document.xml")).toBe("<w:document/>");
    expect(await file("word/styles.xml")).toBeNull();
  });
});
