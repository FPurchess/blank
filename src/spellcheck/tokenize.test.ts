import { describe, expect, it, vi } from "vitest";
import { schema } from "prosemirror-markdown";
import type { Node } from "prosemirror-model";

import { blockquote, codeBlock, doc, li, p, ul } from "../test/editor";
import { blockText, words } from "./tokenize";

const config = { ignoreUppercase: true, ignoreWordsWithNumbers: true };

/**
 * wordsOf returns the words of the first textblock in `node` with the text at
 * their positions, which proves the positions are right
 */
const wordsOf = (node: Node, cfg = config, lang = "en") => {
  let result: { text: string; at: string; parts?: string[] }[] = [];
  node.descendants((block, pos) => {
    if (!block.isTextblock) return true;
    result = result.concat(
      words(block, pos + 1, lang, cfg).map((word) => ({
        text: word.text,
        at: node.textBetween(word.from, word.to),
        ...(word.parts ? { parts: word.parts.map((part) => part.text) } : {}),
      })),
    );
    return false;
  });
  return result;
};

const texts = (node: Node, cfg = config, lang = "en") =>
  wordsOf(node, cfg, lang).map((word) => word.text);

describe("tokenize", () => {
  it("finds the words of a paragraph at their positions", () => {
    const found = wordsOf(doc(p("Hello, wrold!")));

    expect(found).toEqual([
      { text: "Hello", at: "Hello" },
      { text: "wrold", at: "wrold" },
    ]);
  });

  it("finds words across marks", () => {
    const bold = schema.marks.strong.create();
    const node = doc(
      schema.node("paragraph", null, [
        schema.text("Hel"),
        schema.text("lo", [bold]),
        schema.text(" there"),
      ]),
    );

    expect(wordsOf(node)).toEqual([
      { text: "Hello", at: "Hello" },
      { text: "there", at: "there" },
    ]);
  });

  it("skips inline code and code blocks", () => {
    const code = schema.marks.code.create();
    const node = doc(
      schema.node("paragraph", null, [
        schema.text("call "),
        schema.text("fooBar", [code]),
        schema.text(" now"),
      ]),
      codeBlock("const wrold = 1"),
    );

    expect(texts(node)).toEqual(["call", "now"]);
  });

  it("keeps positions after leaf nodes", () => {
    const node = doc(
      schema.node("paragraph", null, [
        schema.text("one"),
        schema.node("hard_break"),
        schema.text("two"),
      ]),
    );

    expect(blockText(node.child(0))).toBe("one￼two");
    expect(wordsOf(node).map((word) => word.at)).toEqual(["one", "two"]);
  });

  it("keeps contractions and elisions in one word", () => {
    expect(texts(doc(p("don't l’homme rock’n’roll")), config, "fr")).toEqual([
      "don't",
      "l’homme",
      "rock’n’roll",
    ]);
  });

  it("checks hyphenated words whole and by part", () => {
    expect(wordsOf(doc(p("a well-known N'est-ce")), config, "fr")).toEqual([
      { text: "a", at: "a" },
      { text: "well-known", at: "well-known", parts: ["well", "known"] },
      { text: "N'est-ce", at: "N'est-ce", parts: ["N'est", "ce"] },
    ]);
  });

  it("skips URLs and email addresses", () => {
    expect(
      texts(
        doc(p("see https://exmaple.com/pth or www.foo.bar and me@hoem.de")),
      ),
    ).toEqual(["see", "or", "and"]);
  });

  it("skips words with digits unless configured otherwise", () => {
    const node = doc(p("mp3 b2b 42 files"));

    expect(texts(node)).toEqual(["files"]);
    expect(texts(node, { ...config, ignoreWordsWithNumbers: false })).toEqual([
      "mp3",
      "b2b",
      "files",
    ]);
  });

  it("skips words in capitals unless configured otherwise", () => {
    const node = doc(p("NASA and I"));

    expect(texts(node)).toEqual(["and", "I"]);
    expect(texts(node, { ...config, ignoreUppercase: false })).toEqual([
      "NASA",
      "and",
      "I",
    ]);
  });

  it("finds words in nested blocks", () => {
    const node = doc(blockquote(ul(li(p("first")), li(p("secnd")))));

    expect(wordsOf(node).map((word) => word.at)).toEqual(["first", "secnd"]);
  });

  it("falls back to letters and digits without Intl.Segmenter", async () => {
    vi.stubGlobal("Intl", { ...Intl, Segmenter: undefined });
    vi.resetModules();
    const { words: fallbackWords } = await import("./tokenize");
    const node = doc(p("It's a well-known tést"));

    expect(
      fallbackWords(node.child(0), 1, "en", config).map((word) => word.text),
    ).toEqual(["It's", "a", "well-known", "tést"]);
  });

  it("falls back to the default locale for an unknown tag", () => {
    expect(texts(doc(p("fine words")), config, "not a tag")).toEqual([
      "fine",
      "words",
    ]);
  });
});
