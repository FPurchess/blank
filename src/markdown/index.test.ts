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
