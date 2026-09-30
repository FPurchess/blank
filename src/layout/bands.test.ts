import { describe, expect, it } from "vitest";

import { doc, docWithFrontmatter, h, p } from "../test/editor";
import { testLayout } from "../test/layout";
import {
  bandsOn,
  documentFields,
  fieldValues,
  fileName,
  formatDate,
  formatNumber,
  hasText,
  variantsOf,
} from "./bands";
import { DEFAULT_PAGE, NO_BANDS, NO_SLOTS } from "./settings";

const header = { ...NO_SLOTS, left: "{title}" };
const footer = { ...NO_SLOTS, center: "{page}" };
const letterhead = { header: { ...NO_SLOTS, left: "ACME" }, footer: NO_SLOTS };
const evenPages = { header: { ...NO_SLOTS, right: "{title}" }, footer };

describe("bandsOn", () => {
  it("gives every page the header and footer", () => {
    expect(bandsOn(testLayout({ header, footer }), 1)).toEqual({
      header,
      footer,
    });
  });

  it("leaves a plain first page without them", () => {
    const layout = testLayout({ header, footer, firstPage: "plain" });
    expect(bandsOn(layout, 1)).toEqual(NO_BANDS);
    expect(bandsOn(layout, 2)).toEqual({ header, footer });
  });

  it("gives the first page its own", () => {
    const layout = testLayout({ header, footer, firstPage: letterhead });
    expect(bandsOn(layout, 1)).toEqual(letterhead);
    expect(bandsOn(layout, 2)).toEqual({ header, footer });
  });

  it("gives even pages theirs, by the number they show", () => {
    const layout = testLayout({ header, footer, evenPages });
    expect(bandsOn(layout, 1)).toEqual({ header, footer });
    expect(bandsOn(layout, 2)).toEqual(evenPages);
    // numbered from 2, the first page is even
    expect(bandsOn({ ...layout, startNumber: 2 }, 1)).toEqual(evenPages);
  });

  it("puts the first page before the even ones", () => {
    const layout = testLayout({
      evenPages,
      firstPage: "plain",
      startNumber: 0,
    });
    expect(bandsOn(layout, 1)).toEqual(NO_BANDS);
  });
});

describe("variantsOf", () => {
  it("lists the bands of every page, the first page and even pages", () => {
    expect(variantsOf(DEFAULT_PAGE)).toEqual([NO_BANDS]);
    expect(
      variantsOf({ ...DEFAULT_PAGE, firstPage: letterhead, evenPages }),
    ).toEqual([NO_BANDS, letterhead, evenPages]);
    expect(variantsOf({ ...DEFAULT_PAGE, firstPage: "plain" })).toEqual([
      NO_BANDS,
    ]);
  });
});

describe("hasText", () => {
  it("tells slots with text from empty ones", () => {
    expect(hasText(NO_SLOTS)).toBe(false);
    expect(hasText(footer)).toBe(true);
  });
});

describe("formatNumber", () => {
  it("writes page numbers in arabic or roman numerals", () => {
    expect(formatNumber(14, "1")).toBe("14");
    expect(formatNumber(14, "i")).toBe("xiv");
    expect(formatNumber(1994, "I")).toBe("MCMXCIV");
    expect(formatNumber(4, "i")).toBe("iv");
  });

  it("keeps 0 as it is, which has no roman numeral", () => {
    expect(formatNumber(0, "i")).toBe("0");
  });
});

describe("formatDate", () => {
  it("writes the date the long way of the region", () => {
    const date = new Date(2026, 8, 27);
    expect(formatDate(date, "de-DE")).toBe("27. September 2026");
    expect(formatDate(date, "en-US")).toBe("September 27, 2026");
  });
});

describe("fileName", () => {
  it("leaves out the folder and the extension", () => {
    expect(fileName("/home/ada/notes/report.md")).toBe("report");
    expect(fileName("C:\\Users\\ada\\report.final.md")).toBe("report.final");
    expect(fileName("/home/ada/.notes")).toBe(".notes");
    expect(fileName(null)).toBe("");
  });
});

describe("documentFields", () => {
  const now = new Date(2026, 8, 27);

  it("takes the title and author from the frontmatter", () => {
    expect(
      documentFields(
        docWithFrontmatter("title: Hi\nauthor: Ada", h(1, "x")),
        "/notes/hi.md",
        { now, locale: "en-US" },
      ),
    ).toEqual({
      title: "Hi",
      author: "Ada",
      date: "September 27, 2026",
      file: "hi",
    });
  });

  it("takes the first heading as the title", () => {
    expect(documentFields(doc(p("a"), h(2, "Report")))).toMatchObject({
      title: "Report",
      author: "",
      file: "",
    });
  });
});

describe("fieldValues", () => {
  const fields = { title: "T", author: "A", date: "D", file: "F" };

  it("counts pages from the start number, and all pages like Word", () => {
    expect(
      fieldValues(testLayout({ startNumber: 3 }), 2, 10, fields, "C"),
    ).toEqual({
      page: "4",
      pages: "10",
      title: "T",
      author: "A",
      date: "D",
      file: "F",
      chapter: "C",
    });
  });

  it("writes the page number in its style, and the pages in arabic", () => {
    expect(
      fieldValues(testLayout({ numberStyle: "i" }), 4, 10, fields),
    ).toMatchObject({ page: "iv", pages: "10", chapter: "" });
  });
});
