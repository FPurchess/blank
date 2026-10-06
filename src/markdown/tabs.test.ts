import { describe, expect, it } from "vitest";
import type { Node } from "prosemirror-model";

import { parseMarkdown, schema, serializeMarkdown } from ".";
import {
  blockquote,
  codeBlock,
  doc,
  h,
  li,
  p,
  table,
  td,
  th,
  tr,
  ul,
} from "../test/editor";

const roundTrip = (node: Node) => parseMarkdown(serializeMarkdown(node));

// a paragraph of text nodes and hard breaks ("\n")
const lines = (...parts: (string | Node)[]) =>
  schema.nodes.paragraph.create(
    null,
    parts.map((part) =>
      typeof part !== "string"
        ? part
        : part === "\n"
          ? schema.nodes.hard_break.create()
          : schema.text(part),
    ),
  );

describe("tabs in markdown", () => {
  it("writes a tab in the middle of a line as it is", () => {
    const node = doc(p("one\ttwo"));
    expect(serializeMarkdown(node)).toBe("one\ttwo");
    expect(roundTrip(node).eq(node)).toBe(true);
  });

  it("writes the tabs at the start and the end of a line as entities", () => {
    const node = doc(p("\t\tone\t"));
    expect(serializeMarkdown(node)).toBe("&#9;&#9;one&#9;");
    expect(roundTrip(node).eq(node)).toBe(true);
  });

  it.each([
    ["a heading", doc(h(2, "\ttitle\t"))],
    ["a quote", doc(blockquote(p("\tquoted")))],
    ["a list item", doc(ul(li(p("\titem")), li(p("next"))))],
    ["a cell", doc(table(tr(th("\ta")), tr(td("b\t"))))],
    ["the lines after line breaks", doc(lines("one\t", "\n", "\ttwo"))],
  ])("keeps the tabs at the ends of %s", (_, node) => {
    expect(roundTrip(node).toJSON()).toEqual(node.toJSON());
  });

  it("keeps a tab at the start of marked text in the mark", () => {
    const em = schema.marks.em.create();
    const node = doc(lines(schema.text("\tsaid", [em]), " it"));
    expect(serializeMarkdown(node)).toBe("*&#9;said* it");
    expect(roundTrip(node).eq(node)).toBe(true);
  });

  it("leaves tabs in code alone", () => {
    const code = schema.marks.code.create();
    const node = doc(
      codeBlock("\tindented"),
      lines(schema.text("\tx", [code])),
    );
    expect(serializeMarkdown(node)).toBe("```\n\tindented\n```\n\n`\tx`");
  });
});
