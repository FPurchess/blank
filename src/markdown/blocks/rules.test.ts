import { describe, expect, it } from "vitest";
import type { Node } from "prosemirror-model";

import { doc, p } from "../../test/editor";
import { parseMarkdown, schema, serializeMarkdown } from "../index";

const unknown = (raw: string) => schema.node("unknown_block", { raw });

const types = (node: Node) => {
  const names: string[] = [];
  node.forEach((child) => names.push(child.type.name));
  return names;
};

describe("content blocks Blank can't show", () => {
  it("keeps a block of a newer Blank exactly as it was written", () => {
    const markdown = [
      "# Recipes",
      '<!-- blank:toc@9 depth="3" title="Contents" -->',
      '<!-- blank:form@1 template="blank/recipe@2" def="9f3c1a2b" -->',
      "",
      '<!-- blank:field name="title" -->',
      "# Pancakes",
      '<!-- blank:field name="steps" -->',
      "Mix *everything*  ",
      "",
      "```",
      "<!-- /blank:form -->",
      "```",
      "<!-- /blank:form -->",
      "Done",
    ].join("\n");
    const parsed = parseMarkdown(markdown);
    expect(types(parsed)).toEqual([
      "heading",
      "unknown_block",
      "unknown_block",
      "paragraph",
    ]);
    // the code block in a field can't end the form early
    expect(parsed.child(2).attrs.raw).toBe(
      markdown.split("\n").slice(2, 13).join("\n"),
    );
    expect(serializeMarkdown(parsed)).toBe(
      [
        "# Recipes",
        '<!-- blank:toc@9 depth="3" title="Contents" -->',
        markdown.split("\n").slice(2, 13).join("\n"),
        "Done",
      ].join("\n\n"),
    );
  });

  it.each([
    ["a paragraph", "text"],
    ["a list item", "- item"],
    ["a quote", "> quote"],
    ["a table", "| a |\n| - |\n| 1 |"],
  ])("reads a marker right after %s", (_, before) => {
    const parsed = parseMarkdown(`${before}\n<!-- blank:toc@9 -->`);
    expect(parsed.lastChild?.type.name).toBe("unknown_block");
    expect(parsed.lastChild?.attrs.raw).toBe("<!-- blank:toc@9 -->");
  });

  it("doesn't read a marker over a rule as a heading", () => {
    expect(types(parseMarkdown("<!-- blank:toc@9 -->\n---"))).toEqual([
      "unknown_block",
      "horizontal_rule",
    ]);
  });

  it.each([
    ["in a quote", "> <!-- blank:toc@9 -->"],
    ["in a list", "- <!-- blank:toc@9 -->"],
    ["indented", "   <!-- blank:toc@9 -->"],
    ["in code", "```\n<!-- blank:toc@9 -->\n```"],
    ["in a line of text", "see <!-- blank:toc@9 --> here"],
  ])("leaves a marker %s alone", (_, markdown) => {
    let found = false;
    parseMarkdown(markdown).descendants((node) => {
      if (node.type.name === "unknown_block") found = true;
    });
    expect(found).toBe(false);
  });

  it.each([
    ["a closing marker alone", "<!-- /blank:form -->"],
    ["an opening marker that is never closed", '<!-- blank:form@1 a="1" -->'],
    ["a marker Blank can't read", "<!-- blank:toc@1 depth=3 -->"],
  ])("keeps %s", (_, line) => {
    const parsed = parseMarkdown(`a\n\n${line}\n\nb`);
    expect(parsed.eq(doc(p("a"), unknown(line), p("b")))).toBe(true);
    expect(serializeMarkdown(parsed)).toBe(`a\n\n${line}\n\nb`);
  });

  it("leaves a table of contents alone before a closing marker of its name", () => {
    const markdown = [
      '<!-- blank:toc@1 depth="3" title="Contents" -->',
      "hello",
      "<!-- /blank:toc -->",
    ].join("\n\n");
    const parsed = parseMarkdown(markdown);
    expect(types(parsed)).toEqual(["toc", "paragraph", "unknown_block"]);
    expect(serializeMarkdown(parsed)).toBe(markdown);
  });

  it("reads a note that starts with blank: as text", () => {
    expect(types(parseMarkdown("<!-- blank: fill in later -->"))).toEqual([
      "paragraph",
    ]);
  });

  it("pairs nested blocks of the same name", () => {
    const markdown = [
      "<!-- blank:box@1 -->",
      "<!-- blank:box@1 -->",
      "<!-- /blank:box -->",
      "<!-- /blank:box -->",
    ].join("\n");
    expect(parseMarkdown(markdown).eq(doc(unknown(markdown)))).toBe(true);
  });

  it("keeps a marker typed as text, text", () => {
    const typed = doc(p('<!-- blank:toc@1 depth="3" -->'));
    expect(parseMarkdown(serializeMarkdown(typed)).eq(typed)).toBe(true);
  });
});

describe("tables of contents", () => {
  const toc = (attrs: Record<string, unknown> = {}) =>
    schema.node("toc", attrs);

  it("reads one with its depth and title", () => {
    const parsed = parseMarkdown(
      'a\n\n<!-- blank:toc@1 depth="2" title="In this report" -->\n\nb',
    );
    expect(
      parsed.eq(
        doc(p("a"), toc({ depth: 2, title: "In this report" }), p("b")),
      ),
    ).toBe(true);
  });

  it("writes the depth and title it has, the defaults too", () => {
    expect(serializeMarkdown(doc(toc(), p("a")))).toBe(
      '<!-- blank:toc@1 depth="3" title="Contents" -->\n\na',
    );
    expect(parseMarkdown("<!-- blank:toc@1 -->").firstChild?.attrs).toEqual({
      depth: 3,
      title: "Contents",
      extra: {},
    });
  });

  it("keeps arguments of a newer Blank, after its own", () => {
    const markdown = '<!-- blank:toc@1 numbered="yes" depth="2" -->';
    const parsed = parseMarkdown(markdown);
    expect(parsed.firstChild?.attrs.extra).toEqual({ numbered: "yes" });
    expect(serializeMarkdown(parsed)).toBe(
      '<!-- blank:toc@1 depth="2" title="Contents" numbered="yes" -->',
    );
  });

  it.each([
    ["a newer format", '<!-- blank:toc@2 depth="2" -->'],
    ["a depth it can't use", '<!-- blank:toc@1 depth="7" -->'],
    ["a format missing", "<!-- blank:toc -->"],
  ])("keeps one of %s as it is", (_, markdown) => {
    const parsed = parseMarkdown(markdown);
    expect(parsed.firstChild?.type.name).toBe("unknown_block");
    expect(serializeMarkdown(parsed)).toBe(markdown);
  });

  it("writes a title with quotes and dashes, and reads it back", () => {
    const title = 'The "best" -- parts -->';
    const written = serializeMarkdown(doc(toc({ title })));
    // inside the comment
    expect(written.slice("<!--".length, -"-->".length)).not.toContain("--");
    expect(parseMarkdown(written).firstChild?.attrs.title).toBe(title);
  });
});
