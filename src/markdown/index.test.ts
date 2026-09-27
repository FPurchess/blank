import { describe, expect, it } from "vitest";

import { doc, docWithFrontmatter, h, p } from "../test/editor";
import {
  firstHeading,
  parseMarkdown,
  schema,
  serializeMarkdown,
} from "./index";

const rule = () => schema.node("horizontal_rule");

describe("parseMarkdown", () => {
  it("keeps the frontmatter in the doc's attributes", () => {
    const parsed = parseMarkdown("---\ntitle: Hi\n---\n\n# Hi\n");
    expect(parsed.attrs.frontmatter).toBe("title: Hi");
    expect(parsed.content.eq(doc(h(1, "Hi")).content)).toBe(true);
  });

  it("parses a file without frontmatter", () => {
    const parsed = parseMarkdown("---\n\ntext");
    expect(parsed.attrs.frontmatter).toBeNull();
    expect(parsed.content.eq(doc(rule(), p("text")).content)).toBe(true);
  });
});

describe("serializeMarkdown", () => {
  it("writes the frontmatter exactly as it was read", () => {
    const text = "---\n# draft\ntags: [a, b]\ntitle:   Hi\n---\n\n# Hi";
    expect(serializeMarkdown(parseMarkdown(text))).toBe(text);
  });

  it("writes a rule on top of a file without frontmatter as ***", () => {
    const written = serializeMarkdown(doc(rule(), p("a: b"), rule()));
    expect(written).toBe("***\n\na: b\n\n---");
    // which reopens as the same document instead of frontmatter
    expect(parseMarkdown(written).attrs.frontmatter).toBeNull();
    expect(parseMarkdown(written).childCount).toBe(3);
  });

  it("keeps the rule on top of a file with frontmatter", () => {
    expect(serializeMarkdown(docWithFrontmatter("a: 1", rule(), p("x")))).toBe(
      "---\na: 1\n---\n\n---\n\nx",
    );
  });

  it("round-trips a document with frontmatter and rules", () => {
    const original = docWithFrontmatter("a: 1", rule(), p("b: 2"), rule());
    const reopened = parseMarkdown(serializeMarkdown(original));
    expect(reopened.eq(original)).toBe(true);
  });
});

describe("frontmatter and tables", () => {
  it("round-trips frontmatter above a pipe table", () => {
    const text =
      "---\ntitle: Hi\n---\n\n| a   | b   |\n| --- | --- |\n| 1   | 2   |";
    const parsed = parseMarkdown(text);
    expect(parsed.attrs.frontmatter).toBe("title: Hi");
    expect(parsed.firstChild?.type.name).toBe("table");
    expect(serializeMarkdown(parsed)).toBe(text);
  });

  it("leaves out the empty paragraph before a table on top", () => {
    const table = parseMarkdown("| a |\n| - |\n| 1 |").firstChild!;
    const written = serializeMarkdown(docWithFrontmatter("a: 1", p(), table));
    expect(written).toBe("---\na: 1\n---\n\n| a   |\n| --- |\n| 1   |");
  });
});

describe("firstHeading", () => {
  it("returns the text of the first heading", () => {
    expect(firstHeading(doc(p("intro"), h(2, "First"), h(1, "Second")))).toBe(
      "First",
    );
  });

  it("returns an empty string without headings", () => {
    expect(firstHeading(doc(p("text")))).toBe("");
  });
});

describe("page breaks", () => {
  const pageBreak = () => schema.node("page_break");

  it("reads a page break on a line of its own", () => {
    for (const markdown of [
      "a\n\n<!-- pagebreak -->\n\nb",
      "a\n\n<!--pagebreak-->\n\nb",
      "a\n\n<!-- PageBreak -->  \n\nb",
      // pandoc's
      "a\n\n\\newpage\n\nb",
      "a\n\n\\pagebreak\n\nb",
      // ending the paragraph above it
      "a\n<!-- pagebreak -->\nb",
    ]) {
      expect(
        parseMarkdown(markdown).content.eq(
          doc(p("a"), pageBreak(), p("b")).content,
        ),
      ).toBe(true);
    }
  });

  it("reads page breaks in quotes and lists", () => {
    const parsed = parseMarkdown("> a\n>\n> <!-- pagebreak -->");
    expect(parsed.firstChild?.lastChild?.type.name).toBe("page_break");
  });

  it.each([
    ["other comments", "<!-- a note -->"],
    ["text around it", "see <!-- pagebreak --> here"],
    ["code", "    <!-- pagebreak -->"],
  ])("leaves %s alone", (_, markdown) => {
    let found = false;
    parseMarkdown(markdown).descendants((node) => {
      if (node.type.name === "page_break") found = true;
    });
    expect(found).toBe(false);
  });

  it("writes a page break as a comment other apps don't show", () => {
    expect(
      serializeMarkdown(doc(p("a"), pageBreak(), pageBreak(), p("b"))),
    ).toBe("a\n\n<!-- pagebreak -->\n\n<!-- pagebreak -->\n\nb");
    expect(serializeMarkdown(parseMarkdown("a\n\n\\newpage\n\nb"))).toBe(
      "a\n\n<!-- pagebreak -->\n\nb",
    );
  });

  it("keeps the text of a page break typed as text", () => {
    for (const text of ["<!-- pagebreak -->", "\\newpage", "<!-- a note -->"]) {
      const written = serializeMarkdown(doc(p(text)));
      expect(parseMarkdown(written).content.eq(doc(p(text)).content)).toBe(
        true,
      );
    }
  });
});
