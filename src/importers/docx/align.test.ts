import { beforeAll, describe, expect, it, vi } from "vitest";
import { DOMSerializer } from "prosemirror-model";

import toDOCX from "../../exporters/docx";
import { resolveLayout } from "../../layout/resolve";
import { DEFAULT_PAGE } from "../../layout/settings";
import { parseMarkdown, schema, serializeMarkdown } from "../../markdown";
import { blocksMarkdown } from "../../editor/plugins/blockClipboard";
import { createState } from "../../test/editor";
import { rewriteDocx } from "../../test/docx";
import { importDocx } from ".";
import { ALIGN_MARKER, fromWordAlignment, readStyleAlignment } from "./align";

vi.mock("../../images/codec", () => ({
  decodeSize: vi.fn(),
  rasterize: vi.fn(),
}));
vi.mock("../../exporters/docx/font", () => ({
  loadFonts: async () => [
    { name: "IBM Plex Sans", data: new TextEncoder().encode("font") },
    { name: "IBM Plex Mono", data: new TextEncoder().encode("font") },
  ],
}));

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

const exportDocx = async (markdown: string) => {
  const doc = parseMarkdown(markdown);
  const { layout } = resolveLayout(doc.attrs.frontmatter, DEFAULT_PAGE);
  return (await toDOCX(createState(doc), { docPath: null, layout })).contents;
};

/**
 * withJc exports `markdown` and sets the w:jc of its body's paragraphs, in
 * order, as a Word user would align them (null leaves one alone)
 */
const withJc = async (markdown: string, jcs: (string | null)[]) => {
  let index = 0;
  return rewriteDocx(await exportDocx(markdown), "word/document.xml", (xml) =>
    xml!
      .replace(/<w:p>|<w:p (?=[^>]*>)/g, (start) => {
        const jc = jcs[index++];
        return jc
          ? `${start === "<w:p>" ? "<w:p>" : start}<w:pPr><w:jc w:val="${jc}"/></w:pPr>`
          : start;
      })
      .replace(/<\/w:pPr><w:pPr>/g, ""),
  );
};

const imported = async (bytes: Uint8Array) => {
  const { doc } = await importDocx(bytes, DEFAULT_PAGE);
  return doc;
};

const aligns = (doc: Awaited<ReturnType<typeof imported>>) =>
  doc.content.content.map((node) => [
    node.textContent,
    node.attrs.align ?? null,
  ]);

// everywhere the imported document's text can go
const everywhere = (doc: Awaited<ReturnType<typeof imported>>) => {
  const container = document.createElement("div");
  container.append(
    DOMSerializer.fromSchema(schema).serializeFragment(doc.content, {
      document,
    }),
  );
  return [
    doc.textContent,
    serializeMarkdown(doc),
    container.innerHTML,
    blocksMarkdown(doc.slice(0, doc.content.size), doc) ?? "",
  ];
};

describe("fromWordAlignment", () => {
  it("reads every way Word aligns a paragraph", () => {
    expect(
      ["left", "start", "center", "right", "end", "both", "distribute"].map(
        fromWordAlignment,
      ),
    ).toEqual([
      "left",
      "left",
      "center",
      "right",
      "right",
      "justify",
      "justify",
    ]);
    for (const spread of [
      "lowKashida",
      "mediumKashida",
      "highKashida",
      "thaiDistribute",
    ]) {
      expect(fromWordAlignment(spread)).toBe("justify");
    }
    expect(fromWordAlignment("numTab")).toBeNull();
    expect(fromWordAlignment(null)).toBeNull();
  });
});

describe("readStyleAlignment", () => {
  const styles = (body: string) =>
    new DOMParser().parseFromString(
      `<w:styles xmlns:w="${W}">${body}</w:styles>`,
      "application/xml",
    );

  it("follows w:basedOn, and reads the default style and the defaults", () => {
    const read = readStyleAlignment(
      styles(`
        <w:docDefaults><w:pPrDefault><w:pPr><w:jc w:val="both"/></w:pPr></w:pPrDefault></w:docDefaults>
        <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:pPr><w:jc w:val="left"/></w:pPr></w:style>
        <w:style w:type="paragraph" w:styleId="Title"><w:pPr><w:jc w:val="center"/></w:pPr></w:style>
        <w:style w:type="paragraph" w:styleId="Subtitle"><w:basedOn w:val="Title"/></w:style>
        <w:style w:type="paragraph" w:styleId="A"><w:basedOn w:val="B"/></w:style>
        <w:style w:type="paragraph" w:styleId="B"><w:basedOn w:val="A"/></w:style>
        <w:style w:type="character" w:styleId="Strong"><w:pPr><w:jc w:val="right"/></w:pPr></w:style>
      `),
    );
    expect(read.docDefault).toBe("both");
    expect(read.defaultStyle).toBe("Normal");
    expect(read.byStyle.get("Normal")).toBe("left");
    expect(read.byStyle.get("Subtitle")).toBe("center");
    // a loop of w:basedOn ends
    expect(read.byStyle.get("A")).toBeUndefined();
    expect(read.byStyle.has("Strong")).toBe(false);
    expect(readStyleAlignment(null).byStyle.size).toBe(0);
  });
});

describe("the alignment of imported paragraphs", () => {
  // the first export and import load docx and mammoth
  beforeAll(async () => {
    await imported(await exportDocx("warm up"));
  }, 60_000);

  it("reads each paragraph's own alignment", async () => {
    const doc = await imported(
      await withJc("# Title\n\none\n\ntwo\n\nthree\n\nfour", [
        "center",
        "end",
        "distribute",
        "start",
        null,
      ]),
    );
    expect(aligns(doc)).toEqual([
      ["Title", "center"],
      ["one", "right"],
      ["two", "justify"],
      ["three", null],
      ["four", null],
    ]);
    expect(doc.child(0).type.name).toBe("heading");
  });

  it("takes the alignment of the paragraph's style, its default style or the defaults", async () => {
    const justified = await rewriteDocx(
      await exportDocx("# Title\n\ntext"),
      "word/styles.xml",
      (xml) =>
        xml!
          .replace(
            /<w:docDefaults>/,
            '<w:docDefaults><w:pPrDefault><w:pPr><w:jc w:val="both"/></w:pPr></w:pPrDefault>',
          )
          .replace(
            /(<w:style [^>]*w:styleId="Heading1"[^>]*>)/,
            '$1<w:pPr><w:jc w:val="center"/></w:pPr>',
          ),
    );
    const doc = await imported(justified);
    expect(aligns(doc)).toEqual([
      ["Title", "center"],
      ["text", "justify"],
    ]);
  });

  it("keeps the alignment of both pieces of a paragraph a page break splits", async () => {
    const bytes = await rewriteDocx(
      await withJc("before after", ["center"]),
      "word/document.xml",
      (xml) =>
        xml!.replace(
          /<w:t([^>]*)>before after<\/w:t>/,
          '<w:t$1>before</w:t><w:br w:type="page"/><w:t>after</w:t>',
        ),
    );
    const doc = await imported(bytes);
    expect(
      doc.content.content
        .filter((node) => node.type.name === "paragraph")
        .map((node) => [node.textContent, node.attrs.align]),
    ).toEqual([
      ["before", "center"],
      ["after", "center"],
    ]);
  });

  it("aligns a table's column by its paragraphs and no list item", async () => {
    const doc = await imported(
      await withJc("- item\n\n| a | b |\n| - | - |\n| c | d |", [
        "center",
        null,
        "right",
        null,
        "right",
      ]),
    );
    const list = doc.child(0);
    expect(list.firstChild!.firstChild!.attrs.align).toBeNull();
    const table = doc.child(1);
    const columns = table.content.content.map((row) =>
      row.content.content.map((cell) => cell.attrs.align),
    );
    expect(columns).toEqual([
      [null, "right"],
      [null, "right"],
    ]);
  });

  it("leaves no marker anywhere, for every alignment", async () => {
    const doc = await imported(
      await withJc("# Head\n\none\n\n\n\nthree\n\n| a |\n| - |\n| b |", [
        "center",
        "right",
        "both",
        "left",
        "center",
      ]),
    );
    for (const text of everywhere(doc)) {
      expect(text).not.toContain(ALIGN_MARKER);
    }
  });
});
