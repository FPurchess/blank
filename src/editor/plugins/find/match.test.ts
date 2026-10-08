import { describe, expect, it } from "vitest";

import { schema } from "../../../markdown";
import { doc, h, p } from "../../../test/editor";
import type { FindOptions } from "../../../state";
import { compile, expand, matchIn, NO_OPTIONS } from "./match";

// a paragraph of these pieces: text, marked text or an inline node
const para = (...pieces: (string | [string, string] | "break")[]) =>
  schema.node(
    "paragraph",
    null,
    pieces.map((piece) =>
      piece === "break"
        ? schema.nodes.hard_break.create()
        : typeof piece === "string"
          ? schema.text(piece)
          : schema.text(piece[0], [schema.marks[piece[1]].create()]),
    ),
  );

const find = (
  node: ReturnType<typeof doc>,
  query: string,
  options: Partial<FindOptions> = {},
  limit = Infinity,
) => {
  const all = { ...NO_OPTIONS, ...options };
  const compiled = compile(query, all);
  if (!compiled || "error" in compiled) throw new Error("no pattern");
  const { matches, more } = matchIn(node, compiled.regex, all, "all", limit);
  return {
    texts: matches.map(({ from, to }) => node.textBetween(from, to)),
    matches,
    more,
  };
};

describe("compile", () => {
  it("finds nothing for nothing, and says why a pattern can't be read", () => {
    expect(compile("", NO_OPTIONS)).toBeNull();
    const broken = compile("(a", { ...NO_OPTIONS, regex: true });
    expect(broken).toMatchObject({ error: expect.any(String) });
    expect((broken as { error: string }).error).not.toContain("(a");
  });

  it("reads plain text as itself, also its regex characters", () => {
    expect(find(doc(p("a.b (c) a+b")), "(c)").texts).toEqual(["(c)"]);
    expect(find(doc(p("axb a.b")), "a.b").texts).toEqual(["a.b"]);
  });
});

describe("matchIn", () => {
  it("ignores case unless told, also beyond ASCII", () => {
    const node = doc(p("Straße STRASSE straße"), h(1, "Ärger ärger"));
    expect(find(node, "straße").texts).toEqual(["Straße", "straße"]);
    expect(find(node, "ärger").texts).toEqual(["Ärger", "ärger"]);
    expect(find(node, "Ärger", { matchCase: true }).texts).toEqual(["Ärger"]);
  });

  it("finds whole words only, by letters of any script", () => {
    const node = doc(p("the theme bathe the_end über the"));
    expect(find(node, "the", { wholeWord: true }).texts).toEqual([
      "the",
      "the",
    ]);
    expect(
      find(doc(p("überall über")), "über", { wholeWord: true }).matches,
    ).toHaveLength(1);
  });

  it("matches across marks but never across two blocks", () => {
    const node = doc(para("ab", ["cd", "strong"], ["ef", "em"]), p("gh"));
    expect(find(node, "bcde").texts).toEqual(["bcde"]);
    expect(find(node, "fg").texts).toEqual([]);
  });

  it("never matches across an inline node", () => {
    const node = doc(para("ab", "break", "cd"));
    expect(find(node, "bc").texts).toEqual([]);
    expect(find(node, "cd").texts).toEqual(["cd"]);
  });

  it("reads regular expressions, with their groups, skipping empty matches", () => {
    const { matches, texts } = find(doc(p("ann@x bob@y")), "(\\w+)@", {
      regex: true,
    });
    expect(texts).toEqual(["ann@", "bob@"]);
    expect(matches[0].groups?.numbered).toEqual(["ann"]);
    expect(find(doc(p("abc")), "x*", { regex: true }).texts).toEqual([]);
  });

  it("stops at the limit and says there are more", () => {
    const { matches, more } = find(doc(p("a a a a")), "a", {}, 2);
    expect(matches).toHaveLength(2);
    expect(more).toBe(true);
    expect(find(doc(p("a a")), "a", {}, 2).more).toBe(false);
  });

  it("looks only at the textblocks of the ranges given", () => {
    const node = doc(p("one"), p("one"));
    const compiled = compile("one", NO_OPTIONS) as { regex: RegExp };
    // where the second paragraph starts
    const second = node.child(0).nodeSize;
    expect(
      matchIn(node, compiled.regex, NO_OPTIONS, [[second + 1, second + 1]])
        .matches,
    ).toEqual([{ from: second + 1, to: second + 4 }]);
  });
});

describe("expand", () => {
  const match = {
    from: 0,
    to: 4,
    groups: { numbered: ["ann", ""], named: { user: "ann" } },
  };

  it("puts in the groups and the match in a regular expression", () => {
    expect(expand("$1 at", match, "ann@", true)).toBe("ann at");
    expect(expand("[$&] $$ $<user> $9", match, "ann@", true)).toBe(
      "[ann@] $ ann $9",
    );
    expect(expand("$10", match, "ann@", true)).toBe("ann0");
  });

  it("takes plain text as it is", () => {
    expect(expand("$1", match, "ann@", false)).toBe("$1");
  });
});
