import { describe, expect, it } from "vitest";

import {
  closeMarker,
  fenceFor,
  formatArgs,
  formatMarker,
  looksLikeMarker,
  parseArgs,
  parseMarker,
} from "./args";

describe("parseMarker", () => {
  it("reads an opening marker with its format and arguments", () => {
    expect(
      parseMarker('<!-- blank:toc@1 depth="3" title="My contents" -->'),
    ).toEqual({
      close: false,
      name: "toc",
      format: 1,
      args: { depth: "3", title: "My contents" },
    });
  });

  it("reads a closing marker", () => {
    expect(parseMarker("<!-- /blank:form -->")).toEqual({
      close: true,
      name: "form",
      format: null,
      args: {},
    });
  });

  it("reads a marker without spaces in the comment and after it", () => {
    expect(parseMarker('<!--blank:field name="a"-->  ')?.args).toEqual({
      name: "a",
    });
  });

  it.each([
    ["no comment", 'blank:toc@1 depth="3"'],
    ["another comment", "<!-- pagebreak -->"],
    ["text after it", "<!-- blank:toc@1 --> and more"],
    ["a value without quotes", "<!-- blank:toc@1 depth=3 -->"],
    ["a key given twice", '<!-- blank:toc@1 a="1" a="2" -->'],
    ["a format that isn't a number", "<!-- blank:toc@x -->"],
    ["a closing marker with arguments", '<!-- /blank:form a="1" -->'],
    ["a closing marker with a format", "<!-- /blank:form@1 -->"],
  ])("reads nothing from %s", (_, line) => {
    expect(parseMarker(line)).toBeNull();
  });
});

describe("arguments", () => {
  it("keeps a value with line breaks on the marker's line", () => {
    const args = { title: "two\nlines\r\n" };
    const written = formatArgs(args);
    expect(written).not.toMatch(/[\n\r]/);
    expect(parseArgs(written)).toEqual(args);
  });

  it("writes and reads values with quotes, brackets and dashes", () => {
    const args = { title: 'A "quoted" <title> -- and --> & more' };
    const written = formatArgs(args);
    // a comment ends at the first `--`
    expect(written).not.toContain("--");
    expect(parseArgs(written)).toEqual(args);
  });

  it("writes the known keys in their order and keeps the others after them", () => {
    expect(formatArgs({ b: "2", extra: "x", a: "1" }, ["a", "b"])).toBe(
      ' a="1" b="2" extra="x"',
    );
  });

  it("round-trips a marker", () => {
    const marker = {
      name: "form",
      format: 1,
      args: { def: "blank/recipe@2#9f3c1a2b", note: "kept" },
    };
    const line = formatMarker(marker, ["def", "note"]);
    expect(line).toBe(
      '<!-- blank:form@1 def="blank/recipe@2#9f3c1a2b" note="kept" -->',
    );
    expect(parseMarker(line)).toEqual({ close: false, ...marker });
    expect(closeMarker("form")).toBe("<!-- /blank:form -->");
    expect(parseMarker(closeMarker("form"))?.close).toBe(true);
  });
});

describe("looksLikeMarker", () => {
  it("knows markers Blank can't read as markers", () => {
    expect(looksLikeMarker("<!-- blank:toc@x -->")).toBe(true);
    expect(looksLikeMarker("<!-- /blank:x -->")).toBe(true);
    expect(looksLikeMarker("<!-- pagebreak -->")).toBe(false);
    expect(looksLikeMarker("<!-- blank:toc")).toBe(false);
    // a note, not a block
    expect(looksLikeMarker("<!-- blank: fill in later -->")).toBe(false);
  });
});

describe("fenceFor", () => {
  it("uses more backticks than the content has in a row", () => {
    expect(fenceFor("a: 1")).toBe("````");
    expect(fenceFor("```\ncode\n`````")).toBe("``````");
  });
});
