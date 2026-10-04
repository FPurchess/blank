import { describe, expect, it } from "vitest";

import { testLayout } from "../test/layout";
import { fieldValues, NO_FIELDS } from "./bands";
import {
  chapterIn,
  emptyBandNotice,
  emptyFields,
  hasBand,
  pageBandParts,
  slotParts,
} from "./placeholders";

const fields = { ...NO_FIELDS, title: "Report", date: "1 October 2026" };
const values = fieldValues(testLayout(), 2, 5, fields);

describe("chapterIn", () => {
  it("reads the chapter out of the text the engine wrote", () => {
    expect(chapterIn("{chapter}", values, "Intro")).toBe("Intro");
    expect(chapterIn("{title}: {chapter}", values, "Report: Intro")).toBe(
      "Intro",
    );
    expect(chapterIn("{chapter} – {chapter}", values, "A – A")).toBe("A");
    expect(chapterIn("{chapter}", values, "")).toBe("");
    // signs of regular expressions in the text are only text
    expect(chapterIn("(x) {chapter}.", values, "(x) One.")).toBe("One");
  });

  it("can't tell without a chapter, or from another text", () => {
    expect(chapterIn("{title}", values, "Report")).toBeNull();
    expect(chapterIn("{title} {chapter}", values, "Other One")).toBeNull();
  });
});

describe("slotParts", () => {
  it("shows the engine's text where nothing comes out empty", () => {
    expect(slotParts("{title}", values, "Report")).toEqual([
      { text: "Report" },
    ]);
    expect(slotParts("Page {page}", values, "Page 2")).toEqual([
      { text: "Page 2" },
    ]);
    expect(slotParts("", values, "")).toEqual([]);
    expect(slotParts("{chapter}", values, "Intro")).toEqual([
      { text: "Intro" },
    ]);
  });

  it("names a placeholder that comes out empty", () => {
    expect(slotParts("{author}", values, "")).toEqual([{ field: "author" }]);
    expect(slotParts("{chapter}", values, "")).toEqual([{ field: "chapter" }]);
    // with the text around it
    expect(slotParts("by {author}", values, "by ")).toEqual([
      { text: "by " },
      { field: "author" },
    ]);
    expect(slotParts("{author} {chapter}", values, " ")).toEqual([
      { field: "author" },
      { text: " " },
      { field: "chapter" },
    ]);
    // and the chapter of the page where it has one
    expect(slotParts("{author}, {chapter}", values, ", Intro")).toEqual([
      { field: "author" },
      { text: ", Intro" },
    ]);
  });
});

describe("pageBandParts", () => {
  it("takes the header and footer of each page, the first's and the even ones'", () => {
    const layout = testLayout({
      header: { left: "{author}", center: "", right: "{title}" },
      footer: { left: "", center: "{page}", right: "" },
      firstPage: "plain",
      evenPages: {
        header: { left: "", center: "{chapter}", right: "" },
        footer: { left: "", center: "", right: "" },
      },
    });
    // the first page has none
    expect(
      pageBandParts(layout, 0, 3, fields, ["", "", "", "", "", ""]),
    ).toEqual([[], [], [], [], [], []]);
    // page 2 is even, before any chapter
    expect(
      pageBandParts(layout, 1, 3, fields, ["", "", "", "", "", ""]),
    ).toEqual([[], [{ field: "chapter" }], [], [], [], []]);
    // page 3 has no author
    const third = pageBandParts(layout, 2, 3, fields, [
      "",
      "",
      "Report",
      "",
      "3",
      "",
    ]);
    expect(third).toEqual([
      [{ field: "author" }],
      [],
      [{ text: "Report" }],
      [],
      [{ text: "3" }],
      [],
    ]);
    expect(emptyFields(third)).toEqual(["author"]);
  });
});

describe("emptyFields", () => {
  it("lists each placeholder once", () => {
    expect(
      emptyFields([
        [{ field: "author" }, { text: " " }, { field: "chapter" }],
        [{ field: "author" }],
        [{ text: "x" }],
      ]),
    ).toEqual(["author", "chapter"]);
    expect(emptyFields([[{ text: "x" }], []])).toEqual([]);
  });
});

describe("hasBand", () => {
  it("follows what is written, not what it comes out as", () => {
    const layout = testLayout({
      header: { left: "{author}", center: "", right: "" },
      firstPage: "plain",
    });
    expect(hasBand(layout, 1, "header")).toBe(false);
    expect(hasBand(layout, 2, "header")).toBe(true);
    expect(hasBand(layout, 2, "footer")).toBe(false);
  });
});

describe("emptyBandNotice", () => {
  it("names each placeholder that leaves the band empty, and how to set the author", () => {
    expect(
      emptyBandNotice(
        "header",
        [[{ field: "author" }, { text: " " }, { field: "chapter" }], [], []],
        false,
        "Ctrl+Alt+U",
      ),
    ).toBe(
      "The header is empty on this page: no author is set and the document has no chapter heading yet. Add an author under Edit as text in the page setup (Ctrl+Alt+U).",
    );
    expect(
      emptyBandNotice(
        "footer",
        [[{ field: "chapter" }], [{ field: "title" }], [{ field: "file" }]],
        true,
        "Ctrl+Alt+U",
      ),
    ).toBe(
      "The footer is empty on this page: no chapter heading comes before this page, the document has no title or heading yet, and the document isn't saved to a file yet.",
    );
  });

  it("tells nothing when the band shows something, or has nothing written", () => {
    const key = "Ctrl+Alt+U";
    expect(
      emptyBandNotice(
        "header",
        [[{ text: "by " }, { field: "author" }]],
        false,
        key,
      ),
    ).toBeNull();
    expect(
      emptyBandNotice(
        "header",
        [[{ field: "author" }], [{ text: "3" }]],
        false,
        key,
      ),
    ).toBeNull();
    expect(emptyBandNotice("header", [[], [], []], false, key)).toBeNull();
  });
});
