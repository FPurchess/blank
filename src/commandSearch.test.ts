import { describe, expect, it } from "vitest";

import { CommandIdentifier as C, config } from "./config";
import { matchCommands, rankCommands, SEARCH_LIMIT } from "./commandSearch";

const ids = (found: { info: { id: C } }[]) => found.map(({ info }) => info.id);

describe("matchCommands", () => {
  it("lists every command for nothing, the unbound ones too", () => {
    const listed = matchCommands("").map((info) => info.id);
    expect(new Set(listed)).toEqual(new Set(Object.keys(config.value.keymap)));
  });

  it("finds commands by label, group and alias, every word", () => {
    expect(matchCommands("save").map((info) => info.id)).toContain(C.FILE_SAVE);
    expect(matchCommands("preferences").map((info) => info.id)).toEqual([
      C.APP_SETTINGS,
    ]);
    expect(
      matchCommands("tools spell").every((info) => info.group === "Tools"),
    ).toBe(true);
  });
});

describe("rankCommands", () => {
  it("finds nothing for nothing", () => {
    expect(rankCommands("  ", [])).toEqual([]);
  });

  it("ranks a label's start, then a word's, then the inside, then the rest", () => {
    // "Export as PDF…" starts with it, "Pages / page ends" has a word that
    // does, and the PDF export has "pdf" as a word
    const found = ids(rankCommands("pdf", []));
    expect(found[0]).toBe(C.EXPORT_PDF);

    const pages = rankCommands("page", []);
    // the labels that start with it come first
    expect(pages[0].info.label.toLowerCase().startsWith("page")).toBe(true);
    // a match only in the aliases has no part of the label to mark
    const alias = rankCommands("preferences", []);
    expect(alias).toEqual([
      { info: expect.objectContaining({ id: C.APP_SETTINGS }), match: null },
    ]);
  });

  it("marks the part of the label that matched", () => {
    const [first] = rankCommands("exp", []);
    expect(first.match).toEqual([0, 3]);
    const word = rankCommands("ends", []).find(
      ({ info }) => info.id === C.VIEW_PAGES,
    )!;
    expect(word.info.label.slice(...word.match!)).toBe("ends");
  });

  it("puts the commands used last first within a rank", () => {
    const plain = ids(rankCommands("export", []));
    expect(plain.slice(0, 2)).toEqual([C.EXPORT_PDF, C.EXPORT_DOCX]);
    const recent = ids(rankCommands("export", [C.EXPORT_DOCX]));
    expect(recent.slice(0, 2)).toEqual([C.EXPORT_DOCX, C.EXPORT_PDF]);
  });

  it("leaves out what it's told to, and shows SEARCH_LIMIT at most", () => {
    expect(
      ids(rankCommands("export", [], new Set([C.EXPORT_PDF]))),
    ).not.toContain(C.EXPORT_PDF);
    expect(rankCommands("e", []).length).toBe(SEARCH_LIMIT);
  });
});
