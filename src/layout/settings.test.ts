import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";

import {
  allMargins,
  DEFAULT_PAGE,
  NO_SLOTS,
  type PageChanges,
  readPageSettings,
  writePageSettings,
} from "./settings";
import { type Unit } from "./units";
import { cm, mm } from "../test/layout";

const read = (raw: unknown) => {
  const problems: string[] = [];
  const settings = readPageSettings(raw, DEFAULT_PAGE, problems);
  return { settings, problems };
};

describe("readPageSettings", () => {
  it("keeps the base for no settings", () => {
    expect(read(undefined)).toEqual({ settings: DEFAULT_PAGE, problems: [] });
    expect(read(null)).toEqual({ settings: DEFAULT_PAGE, problems: [] });
  });

  it("reads paper, orientation and margins", () => {
    expect(
      read({ size: "Letter", orientation: "landscape", margins: "1in" })
        .settings,
    ).toEqual({
      ...DEFAULT_PAGE,
      size: "letter",
      orientation: "landscape",
      margins: allMargins(72),
    });
  });

  it("reads a custom size as portrait, in any order and unit", () => {
    const { settings } = read({ size: "250mm × 17.6cm" });
    expect(settings.size).toEqual({ width: cm(17.6), height: mm(250) });
  });

  it("reads single margins over the base", () => {
    expect(
      read({ margins: { top: "3cm", left: "20mm" } }).settings.margins,
    ).toEqual({ ...DEFAULT_PAGE.margins, top: cm(3), left: mm(20) });
  });

  it("reads the headings that start a new page, as a level or a list", () => {
    expect(read({ "new-page-before": 1 }).settings.newPageBefore).toEqual([1]);
    expect(
      read({ "new-page-before": [3, 1, 1] }).settings.newPageBefore,
    ).toEqual([1, 3]);
    expect(read({ "new-page-before": [] }).settings.newPageBefore).toEqual([]);
  });

  it("reads the header, footer, first page and start number", () => {
    expect(
      read({
        header: { left: "{title}", right: 3 },
        footer: { center: "Page {page}" },
        "first-page": "plain",
        "start-number": 0,
      }).settings,
    ).toEqual({
      ...DEFAULT_PAGE,
      header: { ...NO_SLOTS, left: "{title}", right: "3" },
      footer: { ...NO_SLOTS, center: "Page {page}" },
      firstPage: "plain",
      startNumber: 0,
    });
  });

  it("reads a first page and even pages of their own, and roman numerals", () => {
    expect(
      read({
        "first-page": { header: { left: "ACME" } },
        "even-pages": { footer: { left: "{page}" } },
        "number-style": "i",
      }).settings,
    ).toEqual({
      ...DEFAULT_PAGE,
      firstPage: {
        header: { ...NO_SLOTS, left: "ACME" },
        footer: NO_SLOTS,
      },
      evenPages: { header: NO_SLOTS, footer: { ...NO_SLOTS, left: "{page}" } },
      numberStyle: "i",
    });
  });

  it("reads even pages like the others, and 1 as a number", () => {
    expect(read({ "even-pages": "same", "number-style": 1 }).settings).toEqual(
      DEFAULT_PAGE,
    );
  });

  it("skips keys it doesn't know", () => {
    expect(read({ columns: 2 })).toEqual({
      settings: DEFAULT_PAGE,
      problems: [],
    });
  });

  it.each([
    [{ size: "a2" }, "page.size"],
    [{ size: "210 x 297" }, "page.size"],
    [{ size: 4 }, "page.size"],
    [{ orientation: "sideways" }, "page.orientation"],
    [{ margins: "wide" }, "page.margins"],
    [{ margins: { top: "2cm", inside: "3cm" } }, "page.margins"],
    [{ margins: { top: 2 } }, "page.margins"],
    [{ margins: ["2cm"] }, "page.margins"],
    [{ "new-page-before": 7 }, "page.new-page-before"],
    [{ "new-page-before": ["1"] }, "page.new-page-before"],
    [{ header: "{title}" }, "page.header"],
    [{ header: { top: "x" } }, "page.header"],
    [{ footer: { center: "two\nlines" } }, "page.footer"],
    [{ footer: { center: ["x"] } }, "page.footer"],
    [{ "first-page": "none" }, "page.first-page"],
    [{ "first-page": { title: { left: "x" } } }, "page.first-page"],
    [{ "first-page": { header: "x" } }, "page.first-page"],
    [{ "even-pages": "plain" }, "page.even-pages"],
    [{ "even-pages": { footer: { left: "a\nb" } } }, "page.even-pages"],
    [{ "number-style": "a" }, "page.number-style"],
    [{ "number-style": 2 }, "page.number-style"],
    [{ "start-number": -1 }, "page.start-number"],
    [{ "start-number": 1.5 }, "page.start-number"],
    ["a4", "page"],
    [["a4"], "page"],
  ])("reports %j and keeps the base", (raw, problem) => {
    expect(read(raw)).toEqual({ settings: DEFAULT_PAGE, problems: [problem] });
  });
});

const write = (yaml: string, changes: PageChanges, unit: Unit = "cm") => {
  const document = parseDocument(yaml);
  const changed = writePageSettings(document, changes, unit);
  return { changed, yaml: document.toString({ flowCollectionPadding: false }) };
};

describe("writePageSettings", () => {
  it("adds the page key after the others", () => {
    expect(write("title: Hi\n", { orientation: "landscape" })).toEqual({
      changed: true,
      yaml: "title: Hi\npage:\n  orientation: landscape\n",
    });
  });

  it("writes lengths in the unit, and all four margins as one", () => {
    expect(
      write("", { size: "letter", margins: allMargins(72) }, "in").yaml,
    ).toBe("page:\n  size: letter\n  margins: 1in\n");
    expect(
      write("", { margins: { ...allMargins(cm(2)), top: cm(3) } }).yaml,
    ).toBe(
      "page:\n  margins:\n    top: 3cm\n    right: 2cm\n    bottom: 2cm\n    left: 2cm\n",
    );
  });

  it("writes a custom size in millimetres or inches", () => {
    const size = { width: mm(176), height: mm(250) };
    expect(write("", { size }).yaml).toBe("page:\n  size: 176mm x 250mm\n");
    expect(write("", { size: { width: 432, height: 648 } }, "in").yaml).toBe(
      "page:\n  size: 6in x 9in\n",
    );
  });

  it("keeps what already means the change, as it was written", () => {
    const yaml = "page:\n  size: A4 # mine\n  margins: 25mm\n";
    expect(write(yaml, { size: "a4", margins: allMargins(cm(2.5)) })).toEqual({
      changed: false,
      yaml,
    });
  });

  it("removes keys, and the page key once it is empty", () => {
    expect(
      write("title: Hi\npage:\n  size: a5\n  orientation: landscape\n", {
        size: null,
      }).yaml,
    ).toBe("title: Hi\npage:\n  orientation: landscape\n");
    expect(
      write("title: Hi\npage:\n  orientation: landscape\n", {
        orientation: null,
        margins: null,
      }).yaml,
    ).toBe("title: Hi\n");
  });

  it("writes one heading level as a number, several on one line", () => {
    expect(write("", { newPageBefore: [1] }).yaml).toBe(
      "page:\n  new-page-before: 1\n",
    );
    expect(write("", { newPageBefore: [1, 2] }).yaml).toBe(
      "page:\n  new-page-before: [1, 2]\n",
    );
    expect(
      write("page:\n  new-page-before: [1]\n", { newPageBefore: [1] }).changed,
    ).toBe(false);
  });

  it("writes the slots with text on one line, and the rest as they are", () => {
    expect(
      write("", {
        header: { ...NO_SLOTS, left: "{title}", right: "Page {page}" },
        firstPage: "plain",
        startNumber: 3,
      }).yaml,
    ).toBe(
      'page:\n  header: {left: "{title}", right: "Page {page}"}\n  first-page: plain\n  start-number: 3\n',
    );
  });

  it("writes the bands of the first and even pages one per line", () => {
    expect(
      write("", {
        firstPage: {
          header: { ...NO_SLOTS, left: "ACME" },
          footer: NO_SLOTS,
        },
        evenPages: {
          header: { ...NO_SLOTS, left: "{page}", right: "{chapter}" },
          footer: NO_SLOTS,
        },
        numberStyle: "i",
      }).yaml,
    ).toBe(
      'page:\n  first-page:\n    header: {left: ACME}\n  even-pages:\n    header: {left: "{page}", right: "{chapter}"}\n  number-style: i\n',
    );
  });

  it("writes even pages without a header and footer as {}", () => {
    expect(
      write("", {
        evenPages: { header: NO_SLOTS, footer: NO_SLOTS },
        numberStyle: "1",
      }).yaml,
    ).toBe("page:\n  even-pages: {}\n  number-style: 1\n");
  });

  it("changes nothing to remove what isn't there", () => {
    expect(write("title: Hi\n", { size: null }).changed).toBe(false);
  });

  it("leaves a page key it can't read alone", () => {
    expect(write("page: a4\n", { orientation: "landscape" })).toEqual({
      changed: false,
      yaml: "page: a4\n",
    });
  });
});
