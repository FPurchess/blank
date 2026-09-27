import { describe, expect, it, vi } from "vitest";
import type { Node } from "prosemirror-model";

import { markdownParser as parser, markdownSerializer as serializer } from ".";
import { schema } from "./schema";
import { displayWidth, gfmBlocker } from "./tables";
import {
  blockquote,
  captioned,
  codeBlock,
  doc,
  li,
  p,
  table,
  td,
  th,
  tr,
  ul,
} from "../test/editor";

const md = (...lines: string[]) => lines.join("\n") + "\n";
const roundTrip = (text: string) => serializer.serialize(parser.parse(text));
const serialize = (...blocks: Node[]) => serializer.serialize(doc(...blocks));
const hardBreak = () => schema.nodes.hard_break.create();

describe("pipe tables", () => {
  it("parses a pipe table with its alignment", () => {
    const parsed = parser.parse(
      md("| Name | Qty | Note |", "| :-- | --: | :-: |", "| Apples | 3 | ok |"),
    );

    expect(
      parsed.eq(
        doc(
          table(
            tr(
              th("Name", { align: "left" }),
              th("Qty", { align: "right" }),
              th("Note", { align: "center" }),
            ),
            tr(
              td("Apples", { align: "left" }),
              td("3", { align: "right" }),
              td("ok", { align: "center" }),
            ),
          ),
        ),
      ),
    ).toBe(true);
  });

  it("writes a pipe table padded so its columns line up", () => {
    const text = serialize(
      table(
        tr(th("Name"), th("Qty", { align: "right" })),
        tr(td("Apples"), td("12", { align: "right" })),
        tr(td("Kiwis"), td("3", { align: "right" })),
      ),
    );

    expect(text).toBe(
      md(
        "| Name   | Qty |",
        "| ------ | --: |",
        "| Apples |  12 |",
        "| Kiwis  |   3 |",
      ).trimEnd(),
    );
  });

  it("centers text in a centered column", () => {
    const text = serialize(
      table(
        tr(th("Title", { align: "center" })),
        tr(td("a", { align: "center" })),
      ),
    );

    expect(text.split("\n")).toEqual(["| Title |", "| :---: |", "|   a   |"]);
  });

  it("keeps formatting, links and images in cells", () => {
    const text = md(
      "| A | B |",
      "| --- | --- |",
      "| **bold** *em* `code` | [link](https://example.com) ![alt](a.png) |",
    );

    expect(roundTrip(text)).toBe(
      md(
        "| A                    | B                                         |",
        "| -------------------- | ----------------------------------------- |",
        "| **bold** *em* `code` | [link](https://example.com) ![alt](a.png) |",
      ).trimEnd(),
    );
  });

  it("escapes pipes in text and in code", () => {
    const node = table(
      tr(th("a|b")),
      tr(
        td(
          schema.nodes.paragraph.create(null, [
            schema.text("x|y", [schema.marks.code.create()]),
          ]),
        ),
      ),
    );
    const text = serialize(node);

    expect(text).toContain("a\\|b");
    expect(text).toContain("`x\\|y`");
    expect(parser.parse(text).eq(doc(node))).toBe(true);
  });

  it("keeps a backslash before a pipe", () => {
    const node = table(tr(th("a\\|b")), tr(td("c")));

    expect(parser.parse(serialize(node)).eq(doc(node))).toBe(true);
  });

  it("writes line breaks as <br> and reads them back", () => {
    const node = table(
      tr(th("Notes")),
      tr(
        td([
          schema.nodes.paragraph.create(null, [
            schema.text("red"),
            hardBreak(),
            schema.text("green"),
          ]),
        ]),
      ),
    );
    const text = serialize(node);

    expect(text).toContain("| red<br>green |");
    expect(parser.parse(text).eq(doc(node))).toBe(true);
  });

  it("keeps empty cells", () => {
    const node = table(tr(th("a"), th()), tr(td(), td("b")));

    expect(parser.parse(serialize(node)).eq(doc(node))).toBe(true);
  });

  it("lines up CJK text and emoji by their display width", () => {
    const text = serialize(
      table(tr(th("漢字"), th("x")), tr(td("ab"), td("🎉"))),
    );

    expect(text.split("\n")).toEqual([
      "| 漢字 | x   |",
      "| ---- | --- |",
      "| ab   | 🎉  |",
    ]);
  });

  it("writes a table in a list and in a quote", () => {
    const small = () => table(tr(th("x")), tr(td("1")));
    const inList = doc(ul(li(p("item"), small())));
    const inQuote = doc(blockquote(small()));

    expect(parser.parse(serializer.serialize(inList)).eq(inList)).toBe(true);
    expect(serializer.serialize(inQuote)).toBe(
      md("> | x   |", "> | --- |", "> | 1   |").trimEnd(),
    );
    expect(parser.parse(serializer.serialize(inQuote)).eq(inQuote)).toBe(true);
  });

  it("parses a header without rows", () => {
    expect(
      parser
        .parse(md("| a | b |", "| - | - |"))
        .eq(doc(table(tr(th("a"), th("b"))))),
    ).toBe(true);
  });
});

describe("HTML tables", () => {
  it("writes a table with merged cells as HTML", () => {
    const text = serialize(
      table(tr(th("Q1", { colspan: 2 })), tr(td("Jan"), td("Feb"))),
    );

    expect(text).toBe(
      md(
        "<table>",
        "  <thead>",
        "    <tr>",
        '      <th scope="col" colspan="2">Q1</th>',
        "    </tr>",
        "  </thead>",
        "  <tbody>",
        "    <tr>",
        "      <td>Jan</td>",
        "      <td>Feb</td>",
        "    </tr>",
        "  </tbody>",
        "</table>",
      ).trimEnd(),
    );
  });

  it.each([
    ["merged cells", table(tr(th("a", { colspan: 2 })), tr(td("b"), td("c")))],
    ["a header column", table(tr(th("a"), th("b")), tr(th("c"), td("d")))],
    ["no header row", table(tr(td("a"), td("b")), tr(td("c"), td("d")))],
    [
      "a list in a cell",
      table(tr(th("a")), tr(td(ul(li(p("one")), li(p("two")))))),
    ],
    ["paragraphs in a cell", table(tr(th("a")), tr(td([p("one"), p("two")])))],
    [
      "a code block in a cell",
      table(tr(th("a")), tr(td(codeBlock("let a = 1\n\nlet b = 2")))),
    ],
    ["a caption", captioned('Fruit & <veg> "stock"', tr(th("a")), tr(td("b")))],
    [
      "mixed alignment in a column",
      table(tr(th("a", { align: "left" })), tr(td("b", { align: "right" }))),
    ],
    [
      "a rowspan",
      table(
        tr(th("a"), th("b")),
        tr(td("c", { rowspan: 2 }), td("d")),
        tr(td("e")),
      ),
    ],
  ])("round-trips a table with %s", (_, node) => {
    const text = serialize(p("before"), node, p("after"));

    expect(text).toContain("<table>");
    // a blank line would end the HTML block early
    expect(text.split("\n\n")).toHaveLength(3);
    expect(parser.parse(text).eq(doc(p("before"), node, p("after")))).toBe(
      true,
    );
  });

  it("writes a table as a pipe table again once it fits", () => {
    const merged = table(tr(th("a", { colspan: 2 })), tr(td("b"), td("c")));
    const split = table(tr(th("a"), th()), tr(td("b"), td("c")));

    expect(serialize(merged)).toContain("<table>");
    expect(serialize(split)).toBe(
      md("| a   |     |", "| --- | --- |", "| b   | c   |").trimEnd(),
    );
  });

  it("round-trips an HTML table in a list and in a quote", () => {
    const merged = () =>
      table(tr(th("a", { colspan: 2 })), tr(td("b"), td("c")));
    const inList = doc(ul(li(p("item"), merged())));
    const inQuote = doc(blockquote(merged()));

    expect(parser.parse(serializer.serialize(inList)).eq(inList)).toBe(true);
    expect(parser.parse(serializer.serialize(inQuote)).eq(inQuote)).toBe(true);
  });

  it("reads a caption without turning it into a row", () => {
    const parsed = parser.parse(
      md(
        "<table>",
        "<caption>Stock</caption>",
        "<tr><td>a</td></tr>",
        "</table>",
      ),
    );

    expect(parsed.eq(doc(captioned("Stock", tr(td("a")))))).toBe(true);
  });

  it("turns headings and rules in cells into what a cell can hold", () => {
    const parsed = parser.parse(
      md("<table><tr><td><h2>Title</h2><hr><p>text</p></td></tr></table>"),
    );
    const bold = schema.text("Title", [schema.marks.strong.create()]);

    expect(
      parsed.eq(
        doc(
          table(tr(td([schema.nodes.paragraph.create(null, bold), p("text")]))),
        ),
      ),
    ).toBe(true);
  });

  it("flattens a table nested in a cell", () => {
    const parsed = parser.parse(
      md(
        "<table><tr><td><table><tr><td>a</td><td>b</td></tr></table></td></tr></table>",
      ),
    );

    expect(parsed.eq(doc(table(tr(td("a | b")))))).toBe(true);
  });

  it("drops links and images markdown wouldn't allow", () => {
    const parsed = parser.parse(
      md(
        '<table><tr><td><a href="javascript:alert(1)">x</a>',
        '<img src="javascript:alert(1)"><a href="https://example.com">ok</a></td></tr></table>',
      ),
    );
    const cell = parsed.firstChild!.firstChild!.firstChild!;
    const links: string[] = [];
    cell.descendants((node) => {
      node.marks.forEach((mark) => links.push(mark.attrs.href));
      if (node.type === schema.nodes.image) links.push(node.attrs.src);
    });

    expect(links).toEqual(["https://example.com"]);
  });

  it("percent-encodes image paths like markdown does", () => {
    const parsed = parser.parse(
      md('<table><tr><td><img src="my pic.png"></td></tr></table>'),
    );
    let src = "";
    parsed.descendants((node) => {
      if (node.type === schema.nodes.image) src = node.attrs.src;
    });

    expect(src).toBe("my%20pic.png");
  });

  it("fills rows that are too short", () => {
    const parsed = parser.parse(
      md("<table><tr><th>a</th><th>b</th></tr><tr><td>c</td></tr></table>"),
    );

    expect(parsed.eq(doc(table(tr(th("a"), th("b")), tr(td("c"), td()))))).toBe(
      true,
    );
  });

  it("keeps an unclosed table as text", () => {
    const parsed = parser.parse(md("<table><tr><td>a", "", "next"));

    expect(parsed.eq(doc(p("<table><tr><td>a"), p("next")))).toBe(true);
  });

  it("keeps something that isn't a single table as text", () => {
    const parsed = parser.parse(md("<table></table><p>x</p>"));

    expect(parsed.eq(doc(p("<table></table><p>x</p>")))).toBe(true);
  });

  it("keeps text after a table on its last line", () => {
    const text = md("<table><tr><td>a</td></tr></table> and *more*");
    const emphasis = schema.text("more", [schema.marks.em.create()]);

    expect(
      parser
        .parse(text)
        .eq(
          doc(
            schema.nodes.paragraph.create(null, [
              schema.text("<table><tr><td>a</td></tr></table> and "),
              emphasis,
            ]),
          ),
        ),
    ).toBe(true);
  });

  it("keeps an HTML table as text where there's no DOM to read it", () => {
    vi.stubGlobal("DOMParser", undefined);
    const parsed = parser.parse(md("<table><tr><td>a</td></tr></table>"));
    vi.unstubAllGlobals();

    expect(parsed.firstChild?.type).toBe(schema.nodes.paragraph);
  });

  it("can interrupt a paragraph", () => {
    const parsed = parser.parse(
      md("text", "<table><tr><td>a</td></tr></table>"),
    );

    expect(parsed.eq(doc(p("text"), table(tr(td("a")))))).toBe(true);
  });
});

describe("text that looks like a table", () => {
  it("keeps <br> and <table> typed as text", () => {
    const node = doc(p("a <br> and <table> stay"));

    expect(parser.parse(serializer.serialize(node)).eq(node)).toBe(true);
  });

  it("keeps a paragraph with pipes and line breaks a paragraph", () => {
    const node = doc(
      schema.nodes.paragraph.create(null, [
        schema.text("a | b"),
        hardBreak(),
        schema.text("--- | ---"),
      ]),
    );

    expect(parser.parse(serializer.serialize(node)).eq(node)).toBe(true);
  });

  it("reads <br> in text as a line break", () => {
    expect(
      parser
        .parse("a<br>b")
        .eq(
          doc(
            schema.nodes.paragraph.create(null, [
              schema.text("a"),
              hardBreak(),
              schema.text("b"),
            ]),
          ),
        ),
    ).toBe(true);
  });
});

describe("gfmBlocker", () => {
  it("returns null for a table a pipe table can hold", () => {
    expect(gfmBlocker(table(tr(th("a")), tr(td("b"))))).toBeNull();
  });

  it("names the first thing that keeps a table from being a pipe table", () => {
    expect(gfmBlocker(table(tr(td("a"))))).toBe("noHeader");
    expect(gfmBlocker(captioned("c", tr(th("a"))))).toBe("caption");
    expect(
      gfmBlocker(captioned("c", tr(th("a", { colspan: 2 })), tr(td(), td()))),
    ).toBe("merged");
  });
});

describe("displayWidth", () => {
  it("counts wide characters and emoji as two columns", () => {
    expect(displayWidth("abc")).toBe(3);
    expect(displayWidth("日本")).toBe(4);
    expect(displayWidth("👍🏽")).toBe(2);
    expect(displayWidth("❤️")).toBe(2);
    expect(displayWidth("é")).toBe(1);
  });
});

describe("the paragraphs Blank keeps next to tables", () => {
  it("don't add blank lines to the file", () => {
    const small = table(tr(th("a")), tr(td("b")));

    expect(serializer.serialize(doc(p(), small, p()))).toBe(
      "| a   |\n| --- |\n| b   |",
    );
  });
});
