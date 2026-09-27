import { describe, expect, it } from "vitest";
import JSZip from "jszip";

import { markPageBreaks, PAGE_BREAK_STYLE } from "./pageBreaks";
import { W } from "./xml";

const run = (text: string) =>
  `<w:r><w:rPr><w:b/></w:rPr><w:t>${text}</w:t></w:r>`;
const pageBreak = '<w:r><w:br w:type="page"/></w:r>';

const docx = (body: string) => {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`,
  );
  return zip;
};

// the paragraphs after the rewrite: their text, or "|" for a marker
const paragraphs = async (zip: JSZip) => {
  const xml = await zip.file("word/document.xml")!.async("string");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return [...doc.getElementsByTagNameNS(W, "p")].map((p) => {
    const style = p.getElementsByTagNameNS(W, "pStyle")[0];
    return style?.getAttributeNS(W, "val") === PAGE_BREAK_STYLE
      ? "|"
      : p.textContent;
  });
};

const rewrite = async (body: string) => {
  const zip = docx(body);
  const changed = await markPageBreaks(zip);
  return { changed, paragraphs: await paragraphs(zip), zip };
};

describe("importers.docx.markPageBreaks", () => {
  it("leaves a document without page breaks as it is", async () => {
    expect(await rewrite(`<w:p>${run("a")}</w:p>`)).toMatchObject({
      changed: false,
      paragraphs: ["a"],
    });
  });

  it("splits a paragraph at its page breaks", async () => {
    const { changed, paragraphs } = await rewrite(
      `<w:p>${run("a")}${pageBreak}${run("b")}${pageBreak}${run("c")}</w:p>`,
    );
    expect(changed).toBe(true);
    expect(paragraphs).toEqual(["a", "|", "b", "|", "c"]);
  });

  it("splits a run with a break inside, keeping its formatting", async () => {
    const { paragraphs, zip } = await rewrite(
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:i/></w:rPr><w:t>a</w:t><w:br w:type="page"/><w:t>b</w:t></w:r></w:p>',
    );
    expect(paragraphs).toEqual(["a", "|", "b"]);
    const xml = await zip.file("word/document.xml")!.async("string");
    // both parts keep the heading style and the italics
    expect(xml.match(/w:val="Heading1"/g)).toHaveLength(2);
    expect(xml.match(/<w:i\/>/g)).toHaveLength(2);
  });

  it("splits at breaks in tracked insertions and links", async () => {
    const { paragraphs, zip } = await rewrite(
      `<w:p>${run("a")}<w:ins w:id="1" w:author="A">${run("b")}${pageBreak}${run("c")}</w:ins>` +
        `<w:hyperlink w:anchor="x">${pageBreak}${run("d")}</w:hyperlink></w:p>`,
    );
    expect(paragraphs).toEqual(["ab", "|", "c", "|", "d"]);
    const xml = await zip.file("word/document.xml")!.async("string");
    // each part keeps its tracked insertion and link
    expect(xml.match(/<w:ins /g)).toHaveLength(2);
    expect(xml.match(/<w:hyperlink /g)).toHaveLength(1);
  });

  it.each([
    [
      "table cells",
      (p: string) => `<w:tbl><w:tr><w:tc>${p}</w:tc></w:tr></w:tbl>`,
    ],
    [
      "text boxes",
      (p: string) =>
        `<w:p><w:r><w:pict><w:txbxContent>${p}</w:txbxContent></w:pict></w:r></w:p>`,
    ],
  ])("leaves page breaks in %s alone", async (_, wrap) => {
    const { changed } = await rewrite(
      wrap(
        `<w:p><w:pPr><w:pageBreakBefore/></w:pPr>${run("a")}${pageBreak}${run("b")}</w:p>`,
      ),
    );
    expect(changed).toBe(false);
  });

  it("leaves out the empty parts around a break", async () => {
    expect(
      (await rewrite(`<w:p>${pageBreak}</w:p><w:p>${run("b")}</w:p>`))
        .paragraphs,
    ).toEqual(["|", "b"]);
    expect(
      (await rewrite(`<w:p>${run("a")}${pageBreak}</w:p>`)).paragraphs,
    ).toEqual(["a", "|"]);
  });

  it("keeps line breaks and pictures as content", async () => {
    expect(
      (await rewrite(`<w:p><w:r><w:br/></w:r>${pageBreak}</w:p>`)).paragraphs,
    ).toEqual(["", "|"]);
  });

  it("marks a paragraph's own page break before", async () => {
    expect(
      (
        await rewrite(
          `<w:p>${run("a")}</w:p><w:p><w:pPr><w:pageBreakBefore/></w:pPr>${run("b")}</w:p>` +
            `<w:p><w:pPr><w:pageBreakBefore w:val="0"/></w:pPr>${run("c")}</w:p>`,
        )
      ).paragraphs,
    ).toEqual(["a", "|", "b", "c"]);
  });

  it("marks the end of a section that starts a new page", async () => {
    const section = (type?: string) =>
      `<w:p><w:pPr><w:sectPr>${type ? `<w:type w:val="${type}"/>` : ""}</w:sectPr></w:pPr>${run("end")}</w:p>`;
    expect(
      (await rewrite(`${section()}<w:p>${run("next")}</w:p>`)).paragraphs,
    ).toEqual(["end", "|", "next"]);
    expect(
      (await rewrite(`${section("oddPage")}<w:p>${run("next")}</w:p>`))
        .paragraphs,
    ).toEqual(["end", "|", "next"]);
    expect(
      (await rewrite(`${section("continuous")}<w:p>${run("next")}</w:p>`))
        .paragraphs,
    ).toEqual(["end", "next"]);
  });

  it("reads nothing from a document without document.xml", async () => {
    expect(await markPageBreaks(new JSZip())).toBe(false);
  });
});
