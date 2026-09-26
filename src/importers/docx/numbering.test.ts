import { describe, expect, it } from "vitest";
import JSZip from "jszip";

import { inlineLevelOverrides, normalizeNumbering } from "./numbering";

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const level = (ilvl: number, format: string) =>
  `<w:lvl w:ilvl="${ilvl}"><w:numFmt w:val="${format}"/></w:lvl>`;

const bullets = `<w:abstractNum w:abstractNumId="2">${level(0, "bullet")}${level(1, "bullet")}</w:abstractNum>`;

const numbering = (nums: string) =>
  `<w:numbering ${NS}>${bullets}${nums}</w:numbering>`;

describe("importers.docx.inlineLevelOverrides", () => {
  it("moves overridden levels into a copy of the list definition", () => {
    const xml = numbering(
      `<w:num w:numId="1"><w:abstractNumId w:val="2"/></w:num>` +
        `<w:num w:numId="5"><w:abstractNumId w:val="2"/>` +
        `<w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride>` +
        `<w:lvlOverride w:ilvl="1">${level(1, "decimal")}</w:lvlOverride>` +
        `<w:lvlOverride w:ilvl="3">${level(3, "lowerRoman")}</w:lvlOverride></w:num>`,
    );

    const doc = new DOMParser().parseFromString(
      inlineLevelOverrides(xml)!,
      "application/xml",
    );

    const definitions = [...doc.getElementsByTagName("w:abstractNum")];
    expect(definitions.map((d) => d.getAttribute("w:abstractNumId"))).toEqual([
      "2",
      "3",
    ]);
    const formats = (definition: Element) =>
      [...definition.getElementsByTagName("w:numFmt")].map((f) =>
        f.getAttribute("w:val"),
      );
    expect(formats(definitions[0])).toEqual(["bullet", "bullet"]);
    expect(formats(definitions[1])).toEqual([
      "bullet",
      "decimal",
      "lowerRoman",
    ]);

    const nums = [...doc.getElementsByTagName("w:num")].map((num) =>
      num.getElementsByTagName("w:abstractNumId")[0].getAttribute("w:val"),
    );
    expect(nums).toEqual(["2", "3"]);
    // the definitions stay before the numberings
    expect(doc.documentElement.children[1].localName).toBe("abstractNum");
  });

  it("leaves numberings without level overrides alone", () => {
    const xml = numbering(
      `<w:num w:numId="1"><w:abstractNumId w:val="2"/>` +
        `<w:lvlOverride w:ilvl="0"><w:startOverride w:val="3"/></w:lvlOverride></w:num>` +
        `<w:num w:numId="2"><w:abstractNumId w:val="9"/>` +
        `<w:lvlOverride w:ilvl="0">${level(0, "decimal")}</w:lvlOverride></w:num>`,
    );

    expect(inlineLevelOverrides(xml)).toBeNull();
  });
});

describe("importers.docx.normalizeNumbering", () => {
  const pack = async (files: Record<string, string>) => {
    const zip = new JSZip();
    for (const [name, content] of Object.entries(files))
      zip.file(name, content);
    return zip.generateAsync({ type: "uint8array" });
  };

  it("keeps documents without level overrides as they are", async () => {
    const withoutNumbering = await pack({
      "word/document.xml": "<w:document/>",
    });
    const plain = await pack({
      "word/numbering.xml": numbering(
        `<w:num w:numId="1"><w:abstractNumId w:val="2"/></w:num>`,
      ),
    });

    expect(await normalizeNumbering(withoutNumbering)).toBe(withoutNumbering);
    expect(await normalizeNumbering(plain)).toBe(plain);
  });

  it("rewrites the numbering of documents with level overrides", async () => {
    const bytes = await pack({
      "word/numbering.xml": numbering(
        `<w:num w:numId="5"><w:abstractNumId w:val="2"/>` +
          `<w:lvlOverride w:ilvl="1">${level(1, "decimal")}</w:lvlOverride></w:num>`,
      ),
    });

    const zip = await JSZip.loadAsync(await normalizeNumbering(bytes));
    const xml = await zip.file("word/numbering.xml")!.async("string");

    expect(xml).toContain('w:abstractNumId="3"');
  });
});
