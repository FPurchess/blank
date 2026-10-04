import { afterEach, describe, expect, it } from "vitest";

import { type PageLayoutState, pageLayoutState, textContent } from "./state";
import { createState, doc, p } from "./test/editor";
import {
  countWords,
  formatCount,
  readingMinutes,
  wordCountOf,
  wordCountRows,
  wordCountSummary,
} from "./wordCount";

describe("countWords", () => {
  it("counts the runs between whitespace, none in an empty text", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
    expect(countWords("one")).toBe(1);
    expect(countWords(" one\ntwo\tthree ")).toBe(3);
  });
});

describe("formatCount", () => {
  it("separates thousands", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(1498)).toBe("1,498");
  });
});

describe("readingMinutes", () => {
  it("reads 230 words a minute, at least a minute", () => {
    expect(readingMinutes(0)).toBe(1);
    expect(readingMinutes(348)).toBe(2);
    expect(readingMinutes(2300)).toBe(10);
  });
});

describe("wordCountOf", () => {
  afterEach(() => {
    textContent.value = "";
    pageLayoutState.value = null;
  });

  it("counts the text, the pages and the words selected", () => {
    textContent.value = "one two three";
    const state = createState(doc(p("one two three")), { cursor: [5, 14] });
    expect(wordCountOf(state)).toEqual({
      words: 3,
      characters: 13,
      pages: null,
      selected: 2,
    });

    pageLayoutState.value = { pages: 2 } as PageLayoutState;
    expect(wordCountOf(createState(doc(p("x")))).pages).toBe(2);
  });
});

describe("wordCountRows", () => {
  it("shows the numbers, and how long they take to read", () => {
    expect(
      wordCountRows({ words: 348, characters: 1498, pages: 2, selected: 2 }),
    ).toEqual([
      ["Words", "348"],
      ["Characters", "1,498"],
      ["Pages", "2"],
      ["Reading time", "2 min"],
      ["Selection", "2 words"],
    ]);
  });

  it("shows a dash without pages or a selection", () => {
    const rows = wordCountRows({
      words: 1,
      characters: 3,
      pages: null,
      selected: 0,
    });
    expect(rows[2]).toEqual(["Pages", "—"]);
    expect(rows[4]).toEqual(["Selection", "—"]);
  });
});

describe("wordCountSummary", () => {
  it("says the numbers in one sentence", () => {
    expect(
      wordCountSummary({ words: 2, characters: 7, pages: 1, selected: 1 }),
    ).toBe("2 words, 7 characters, 1 pages, 1 min to read, 1 selected");
  });

  it("leaves out the pages and the selection when there are none", () => {
    expect(
      wordCountSummary({ words: 0, characters: 0, pages: null, selected: 0 }),
    ).toBe("0 words, 0 characters, 1 min to read");
  });
});
