import { describe, expect, it } from "vitest";
import { Fragment } from "prosemirror-model";

import { doc, p, table, th, tr } from "../test/editor";
import { parseMarkdown, schema, serializeMarkdown } from "./index";
import { withoutLinkUnderline } from "./marks";

const { underline, strong, code, link } = schema.marks;

const marksOf = (text: string) => {
  const found: string[][] = [];
  parseMarkdown(text).descendants((node) => {
    if (node.isText) {
      found.push([node.text!, ...node.marks.map((mark) => mark.type.name)]);
    }
  });
  return found;
};

describe("underline in markdown", () => {
  it("reads <u> and <ins>, with markdown inside", () => {
    expect(marksOf("a <u>under **bold**</u> <ins>in</ins>")).toEqual([
      ["a "],
      ["under ", "underline"],
      ["bold", "strong", "underline"],
      [" "],
      ["in", "underline"],
    ]);
  });

  it("reads pandoc's underlined spans", () => {
    expect(marksOf("[one]{.underline} [two]{.ul}")).toEqual([
      ["one", "underline"],
      [" "],
      ["two", "underline"],
    ]);
  });

  it("keeps a tag without its closing tag, or in code, as text", () => {
    expect(marksOf("<u>open")).toEqual([["<u>open"]]);
    expect(marksOf("`<u>`x`</u>`")).toEqual([
      ["<u>", "code"],
      ["x"],
      ["</u>", "code"],
    ]);
  });

  it("writes <u> around underlined text, code and links, which reopen the same", () => {
    const written = doc(
      p(),
      schema.node("paragraph", null, [
        schema.text("a "),
        schema.text("under", [underline.create(), strong.create()]),
        schema.text(" "),
        schema.text("code", [underline.create(), code.create()]),
        schema.text(" "),
        schema.text("link", [
          link.create({ href: "https://example.org" }),
          underline.create(),
        ]),
      ]),
    );
    const markdown = serializeMarkdown(written);
    expect(markdown).toBe(
      "a **<u>under</u>** <u>`code`</u> [<u>link</u>](https://example.org)",
    );
    expect(parseMarkdown(markdown).lastChild!.eq(written.lastChild!)).toBe(
      true,
    );
  });

  it("writes it in a pipe table's cell", () => {
    const written = doc(
      table(
        tr(th("a")),
        tr(
          schema.nodes.table_cell.create(null, [
            schema.node("paragraph", null, [
              schema.text("u", [underline.create()]),
            ]),
          ]),
        ),
      ),
    );
    expect(serializeMarkdown(written)).toContain("| <u>u</u> |");
  });
});

describe("withoutLinkUnderline", () => {
  it("drops the underline of links only", () => {
    const linked = [
      link.create({ href: "https://example.org" }),
      underline.create(),
    ];
    const fragment = Fragment.from(
      schema.node("paragraph", null, [
        schema.text("link", linked),
        schema.text("under", [underline.create()]),
      ]),
    );
    const cleaned = withoutLinkUnderline(fragment).firstChild!;
    expect(cleaned.child(0).marks.map((mark) => mark.type.name)).toEqual([
      "link",
    ]);
    expect(cleaned.child(1).marks.map((mark) => mark.type.name)).toEqual([
      "underline",
    ]);
    // the same fragment when there's nothing to drop
    const plain = Fragment.from(p("x"));
    expect(withoutLinkUnderline(plain)).toBe(plain);
  });
});
