import { describe, expect, it } from "vitest";
import JSZip from "jszip";

import { DEFAULT_PAGE, allMargins } from "../../layout/settings";
import { pageChanges, readWordLayout } from "./layout";
import { W } from "./xml";
import { cm } from "../../test/layout";

// the section properties as Word writes them, in twentieths of a point
const sectPr = ({
  w = 11906,
  h = 16838,
  orient = "",
  top = 1417,
  right = 1417,
  bottom = 1417,
  left = 1417,
  gutter = 0,
} = {}) =>
  `<w:sectPr><w:pgSz w:w="${w}" w:h="${h}"${orient ? ` w:orient="${orient}"` : ""}/>` +
  `<w:pgMar w:top="${top}" w:right="${right}" w:bottom="${bottom}" w:left="${left}" w:header="708" w:footer="708" w:gutter="${gutter}"/></w:sectPr>`;

const docx = (body: string, settings?: string) => {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`,
  );
  if (settings) {
    zip.file(
      "word/settings.xml",
      `<w:settings xmlns:w="${W}">${settings}</w:settings>`,
    );
  }
  return zip;
};

describe("importers.docx.readWordLayout", () => {
  it("reads A4 with Word's rounding", async () => {
    expect(await readWordLayout(docx(`<w:p/>${sectPr()}`))).toEqual({
      page: {
        size: "a4",
        orientation: "portrait",
        margins: allMargins(1417 / 20),
      },
      warnings: [],
    });
  });

  it("reads landscape pages, marked or only wider than high", async () => {
    for (const body of [
      sectPr({ w: 15840, h: 12240, orient: "landscape" }),
      sectPr({ w: 15840, h: 12240 }),
    ]) {
      const { page } = await readWordLayout(docx(body));
      expect(page).toMatchObject({ size: "letter", orientation: "landscape" });
    }
  });

  it("reads a custom size, portrait", async () => {
    const { page } = await readWordLayout(docx(sectPr({ w: 9000, h: 12000 })));
    expect(page?.size).toEqual({ width: 450, height: 600 });
  });

  it("reads the margins, also negative ones", async () => {
    const { page } = await readWordLayout(
      docx(sectPr({ top: -720, right: 1080, bottom: 1440, left: 1800 })),
    );
    expect(page?.margins).toEqual({ top: 36, right: 54, bottom: 72, left: 90 });
  });

  it("uses the first section and warns about others", async () => {
    const landscape = sectPr({ w: 16838, h: 11906, orient: "landscape" });
    const { page, warnings } = await readWordLayout(
      docx(`<w:p><w:pPr>${sectPr()}</w:pPr></w:p><w:p/>${landscape}`),
    );
    expect(page?.orientation).toBe("portrait");
    expect(warnings).toEqual([
      "the document has 2 sections with different page setups, Blank used the first one",
    ]);
  });

  it("doesn't warn about sections with the same page setup", async () => {
    const { warnings } = await readWordLayout(
      docx(`<w:p><w:pPr>${sectPr()}</w:pPr></w:p>${sectPr()}`),
    );
    expect(warnings).toEqual([]);
  });

  it("warns about binding and mirrored margins", async () => {
    const { warnings } = await readWordLayout(
      docx(sectPr({ gutter: 567 }), "<w:mirrorMargins/>"),
    );
    expect(warnings).toEqual([
      "the binding margin was left out",
      "mirrored margins became the same on every page",
    ]);
  });

  it("ignores mirrored margins that are turned off", async () => {
    const { warnings } = await readWordLayout(
      docx(sectPr(), '<w:mirrorMargins w:val="0"/>'),
    );
    expect(warnings).toEqual([]);
  });

  it.each([
    ["no section properties", "<w:p/>"],
    ["no page size", "<w:sectPr/>"],
  ])("reads nothing from %s", async (_, body) => {
    expect((await readWordLayout(docx(body))).page).toBeUndefined();
  });

  it("reads nothing from a document without document.xml", async () => {
    expect(await readWordLayout(new JSZip())).toEqual({ warnings: [] });
  });
});

describe("importers.docx.pageChanges", () => {
  const a4 = {
    size: "a4" as const,
    orientation: "portrait" as const,
    margins: allMargins(cm(2.5)),
  };
  const onA4 = { ...DEFAULT_PAGE, size: "a4" as const };

  it("writes nothing for the page the frontmatter and defaults give", () => {
    expect(pageChanges(null, a4, onA4)).toEqual({});
    expect(
      pageChanges(
        "page:\n  orientation: landscape",
        { ...a4, orientation: "landscape" },
        onA4,
      ),
    ).toEqual({});
  });

  it("writes what differs", () => {
    expect(
      pageChanges(
        null,
        { size: "letter", orientation: "landscape", margins: allMargins(72) },
        onA4,
      ),
    ).toEqual({
      size: "letter",
      orientation: "landscape",
      margins: allMargins(72),
    });
  });

  it("compares a custom size by its dimensions", () => {
    expect(
      pageChanges(null, { ...a4, size: { width: 595.3, height: 841.9 } }, onA4),
    ).toEqual({});
  });
});
