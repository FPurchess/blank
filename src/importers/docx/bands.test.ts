import { describe, expect, it } from "vitest";
import JSZip from "jszip";

import { NO_SLOTS } from "../../layout/settings";
import { readBands } from "./bands";
import { W } from "./xml";

const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const run = (text: string) =>
  `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;
const tab = "<w:r><w:tab/></w:r>";
// a complex field, as Word writes PAGE and NUMPAGES
const field = (instruction: string, shown: string) =>
  `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> ${instruction} \\* MERGEFORMAT </w:instrText></w:r>` +
  `<w:r><w:fldChar w:fldCharType="separate"/></w:r>${run(shown)}<w:r><w:fldChar w:fldCharType="end"/></w:r>`;

/**
 * docx builds a document whose first section has the given header and
 * footer parts, like Word writes them
 */
const docx = (
  parts: { type?: string; band: "header" | "footer"; xml: string }[],
  sectPr = "",
  settings = "",
) => {
  const zip = new JSZip();
  const references = parts
    .map(
      ({ type = "default", band }, index) =>
        `<w:${band}Reference w:type="${type}" r:id="rId${index + 1}"/>`,
    )
    .join("");
  const section = `<w:sectPr xmlns:w="${W}" xmlns:r="${R}">${references}${sectPr}</w:sectPr>`;
  parts.forEach(({ band, xml }, index) => {
    const root = band === "header" ? "hdr" : "ftr";
    zip.file(
      `word/${band}${index + 1}.xml`,
      `<w:${root} xmlns:w="${W}">${xml}</w:${root}>`,
    );
  });
  zip.file(
    "word/_rels/document.xml.rels",
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${parts
      .map(
        ({ band }, index) =>
          `<Relationship Id="rId${index + 1}" Target="${band}${index + 1}.xml"/>`,
      )
      .join("")}</Relationships>`,
  );
  if (settings) {
    zip.file(
      "word/settings.xml",
      `<w:settings xmlns:w="${W}">${settings}</w:settings>`,
    );
  }
  const sectPrElement = new DOMParser().parseFromString(
    section,
    "application/xml",
  ).documentElement;
  return { zip, sectPr: sectPrElement };
};

const read = (...args: Parameters<typeof docx>) => {
  const { zip, sectPr } = docx(...args);
  return readBands(zip, sectPr);
};

describe("importers.docx.readBands", () => {
  it("reads nothing without headers and footers", async () => {
    expect(await read([])).toEqual({
      header: NO_SLOTS,
      footer: NO_SLOTS,
      firstPage: "same",
      evenPages: null,
      numberStyle: "1",
      startNumber: 1,
      warnings: [],
    });
  });

  it("puts text between tabs on the left, in the center and on the right", async () => {
    const { header } = await read([
      {
        band: "header",
        xml: `<w:p>${run("Report")}${tab}${tab}${run("Draft")}</w:p>`,
      },
    ]);
    expect(header).toEqual({ left: "Report", center: "", right: "Draft" });
  });

  it("turns Word's fields into placeholders", async () => {
    const { footer } = await read([
      {
        band: "footer",
        xml: `<w:p>${tab}${run("Page ")}${field("PAGE", "3")}${run(" of ")}${field("NUMPAGES", "12")}</w:p>`,
      },
      {
        band: "header",
        xml: `<w:p><w:fldSimple w:instr=" TITLE "><w:r><w:t>Old title</w:t></w:r></w:fldSimple>${tab}<w:fldSimple w:instr="DATE"><w:r><w:t>today</w:t></w:r></w:fldSimple></w:p>`,
      },
    ]);
    expect(footer).toEqual({ ...NO_SLOTS, center: "Page {page} of {pages}" });
  });

  it("keeps the text Word showed for other fields", async () => {
    const { header } = await read([
      {
        band: "header",
        xml: `<w:p><w:fldSimple w:instr=" TITLE "><w:r><w:t>Old title</w:t></w:r></w:fldSimple>${tab}${field("TIME", "27.9.2026")}${run(" {x}")}</w:p>`,
      },
    ]);
    expect(header).toEqual({
      ...NO_SLOTS,
      left: "{title}",
      center: "27.9.2026 {{x}",
    });
  });

  it("places a single part by its alignment", async () => {
    const aligned = (jc: string) =>
      read([
        {
          band: "footer",
          xml: `<w:p><w:pPr><w:jc w:val="${jc}"/></w:pPr>${run("x")}</w:p>`,
        },
      ]);
    expect((await aligned("center")).footer.center).toBe("x");
    expect((await aligned("right")).footer.right).toBe("x");
    expect((await aligned("left")).footer.left).toBe("x");
  });

  it("reads Word's gallery headers, with absolute tabs and content controls", async () => {
    const ptab = (alignment: string) =>
      `<w:r><w:ptab w:relativeTo="margin" w:alignment="${alignment}" w:leader="none"/></w:r>`;
    const { header, footer } = await read([
      {
        band: "header",
        xml: `<w:p>${run("draft")}${ptab("right")}${run("v2")}</w:p>`,
      },
      {
        band: "footer",
        xml: `<w:sdt><w:sdtContent><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:sdt><w:sdtContent>${field("PAGE", "1")}</w:sdtContent></w:sdt></w:p></w:sdtContent></w:sdt>`,
      },
    ]);

    expect(header).toEqual({ ...NO_SLOTS, left: "draft", right: "v2" });
    expect(footer).toEqual({ ...NO_SLOTS, center: "{page}" });
  });

  it("follows the paragraph's own tab stops", async () => {
    const { footer } = await read([
      {
        band: "footer",
        xml: `<w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="9000"/></w:tabs></w:pPr>${run("a")}${tab}${run("b")}</w:p>`,
      },
    ]);
    expect(footer).toEqual({ left: "a", center: "", right: "b" });
  });

  it("joins several lines, and warns about them and pictures", async () => {
    const { header, warnings } = await read([
      {
        band: "header",
        xml: `<w:p>${run("one")}</w:p><w:p>${run("two")}</w:p><w:p><w:r><w:drawing/></w:r></w:p>`,
      },
    ]);
    expect(header.left).toBe("one two");
    expect(warnings).toEqual([
      "pictures in the header or footer were left out",
      "headers and footers of several lines became one line",
    ]);
  });

  it("reads an empty first page as plain", async () => {
    const { firstPage, warnings } = await read(
      [
        { band: "footer", xml: `<w:p>${run("1")}</w:p>` },
        { type: "first", band: "footer", xml: "<w:p/>" },
      ],
      "<w:titlePg/>",
    );
    expect(firstPage).toBe("plain");
    expect(warnings).toEqual([]);
  });

  it("reads a first page and even pages with their own text", async () => {
    const { firstPage, evenPages, warnings } = await read(
      [
        { band: "footer", xml: `<w:p>${run("1")}</w:p>` },
        {
          type: "first",
          band: "header",
          xml: `<w:p>${run("Title page")}</w:p>`,
        },
        { type: "even", band: "footer", xml: `<w:p>${run("even")}</w:p>` },
      ],
      "<w:titlePg/>",
      "<w:evenAndOddHeaders/>",
    );
    expect(firstPage).toEqual({
      header: { ...NO_SLOTS, left: "Title page" },
      footer: NO_SLOTS,
    });
    expect(evenPages).toEqual({
      header: NO_SLOTS,
      footer: { ...NO_SLOTS, left: "even" },
    });
    expect(warnings).toEqual([]);
  });

  it("leaves out even pages Word doesn't show", async () => {
    const { evenPages } = await read([
      { type: "even", band: "footer", xml: `<w:p>${run("even")}</w:p>` },
    ]);
    expect(evenPages).toBeNull();
  });

  it("reads the chapter, date and file name fields", async () => {
    const { header } = await read([
      {
        band: "header",
        xml: `<w:p>${field('STYLEREF "Heading 1"', "Tides")}${tab}<w:fldSimple w:instr=' DATE \\@ "d MMMM yyyy" '>${run("1 May")}</w:fldSimple>${tab}${field("FILENAME \\p", "notes.docx")}</w:p>`,
      },
    ]);
    expect(header).toEqual({
      left: "{chapter}",
      center: "{date}",
      right: "{file}",
    });
  });

  it("keeps the text of STYLEREF fields for other styles", async () => {
    const { header } = await read([
      {
        band: "header",
        xml: `<w:p>${field('STYLEREF "Heading 2"', "Section")}</w:p>`,
      },
    ]);
    expect(header.left).toBe("Section");
  });

  it("reads the start number and roman numerals, and warns about others", async () => {
    expect((await read([], '<w:pgNumType w:start="0"/>')).startNumber).toBe(0);
    const roman = await read([], '<w:pgNumType w:fmt="lowerRoman"/>');
    expect(roman).toMatchObject({ numberStyle: "i", startNumber: 1 });
    expect(roman.warnings).toEqual([]);
    expect(
      (await read([], '<w:pgNumType w:fmt="upperRoman"/>')).numberStyle,
    ).toBe("I");
    const letters = await read([], '<w:pgNumType w:fmt="lowerLetter"/>');
    expect(letters.numberStyle).toBe("1");
    expect(letters.warnings).toEqual(["page numbers became 1, 2, 3"]);
  });
});
