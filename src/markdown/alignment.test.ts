import { describe, expect, it } from "vitest";

import {
  aligned,
  blockquote,
  doc,
  h,
  li,
  p,
  table,
  td,
  tr,
  ul,
} from "../test/editor";
import {
  alignOf,
  nestedAlignments,
  textAlignment,
  withoutNestedAlignment,
} from "./alignment";
import { parseMarkdown, schema, serializeMarkdown } from "./index";

const aligns = (text: string) =>
  parseMarkdown(text).content.content.map((node) => [
    node.type.name,
    node.attrs.align ?? null,
  ]);

describe("textAlignment", () => {
  it("names the alignments it stores, and left as none", () => {
    expect(textAlignment(" Center ")).toBe("center");
    expect(textAlignment("right")).toBe("right");
    expect(textAlignment("justify")).toBe("justify");
    expect(textAlignment("left")).toBeNull();
    expect(textAlignment("middle")).toBeNull();
    expect(textAlignment(null)).toBeNull();
  });
});

describe("alignOf", () => {
  it("is how a block is aligned, and left for an empty paragraph", () => {
    expect(alignOf(aligned("center", p("a")))).toBe("center");
    expect(alignOf(aligned("right", h(2, "a")))).toBe("right");
    expect(alignOf(aligned("center", p()))).toBeNull();
    expect(alignOf(p("a"))).toBeNull();
    expect(alignOf(null)).toBeNull();
  });

  it("refuses what isn't an alignment, left included", () => {
    expect(() => aligned("left", p("a")).check()).toThrow();
    expect(() => aligned("middle", p("a")).check()).toThrow();
  });
});

describe("nested alignment", () => {
  const nested = doc(
    aligned("center", p("top")),
    ul(li(aligned("right", p("item")))),
    blockquote(aligned("justify", p("quote"))),
    table(tr(td(aligned("center", p("cell"))))),
  );

  it("finds the aligned blocks that aren't at the top", () => {
    expect(nestedAlignments(nested)).toHaveLength(3);
  });

  it("drops their alignment and keeps the one at the top", () => {
    const cleared = withoutNestedAlignment(nested);
    expect(cleared.firstChild!.attrs.align).toBe("center");
    expect(nestedAlignments(cleared)).toEqual([]);
    // the same document when there's nothing to drop
    expect(withoutNestedAlignment(cleared)).toBe(cleared);
  });
});

describe("reading markdown", () => {
  it("aligns the blocks inside a <div align>", () => {
    expect(
      aligns(
        '<div align="center">\n\n# Title\n\nA **bold** one.\n\n</div>\n\nLeft.\n',
      ),
    ).toEqual([
      ["heading", "center"],
      ["paragraph", "center"],
      ["paragraph", null],
    ]);
  });

  it("reads a wrapper without blank lines inside", () => {
    expect(aligns('<div align="right">\n# T\nP\n</div>\n')).toEqual([
      ["heading", "right"],
      ["paragraph", "right"],
    ]);
  });

  it("reads a text-align style and the attributes in any order", () => {
    expect(
      aligns(
        "<div class=\"x\" style='color: red; text-align: justify'>\n\nP\n\n</div>\n",
      ),
    ).toEqual([["paragraph", "justify"]]);
  });

  it("leaves blocks in a left wrapper left, and reads what follows it", () => {
    expect(aligns('<div align="left">\n\nP\n\n</div>\n\nQ\n')).toEqual([
      ["paragraph", null],
      ["paragraph", null],
    ]);
  });

  it("runs an unclosed wrapper to the end of the file", () => {
    expect(aligns('<div align="center">\n\nA\n\nB\n')).toEqual([
      ["paragraph", "center"],
      ["paragraph", "center"],
    ]);
  });

  it("aligns no list or quote inside a wrapper", () => {
    expect(
      aligns('<div align="center">\n\n- item\n\n> quote\n\n</div>\n'),
    ).toEqual([
      ["bullet_list", null],
      ["blockquote", null],
    ]);
  });

  it("ends a list's lazy line at the closing tag", () => {
    expect(aligns('<div align="center">\n\n- item\n</div>\n\nP\n')).toEqual([
      ["bullet_list", null],
      ["paragraph", null],
    ]);
  });

  it("keeps a </div> without a <div> before it as text", () => {
    const parsed = parseMarkdown("</div>\n\ntext\n");
    expect(parsed.firstChild!.textContent).toBe("</div>");
    expect(serializeMarkdown(parsed)).toBe("\\</div>\n\ntext");
  });

  it("reads a paragraph or heading on one line, with its links checked", () => {
    const parsed = parseMarkdown(
      '<p align="center">one <b>x</b> <a href="javascript:alert(1)">l</a></p>\n\n<h2 style="text-align: right">Head</h2>\n',
    );
    expect(parsed.child(0).attrs.align).toBe("center");
    expect(parsed.child(0).textContent).toBe("one x l");
    let links = 0;
    parsed.descendants((node) => {
      if (node.marks.some((mark) => mark.type === schema.marks.link)) links++;
    });
    expect(links).toBe(0);
    expect(parsed.child(1).type.name).toBe("heading");
    expect(parsed.child(1).attrs).toMatchObject({ level: 2, align: "right" });
  });

  it("keeps HTML it doesn't read as text", () => {
    expect(aligns('<p class="x">plain</p>\n')).toEqual([["paragraph", null]]);
    expect(parseMarkdown('<p class="x">plain</p>\n').textContent).toBe(
      '<p class="x">plain</p>',
    );
  });

  it("aligns no field of a form inside a wrapper", () => {
    const parsed = parseMarkdown(
      '<div align="center">\n\n<!-- blank:form@1 of="blank/test" -->\n<!-- blank:field name="title" -->\nText\n<!-- /blank:form -->\n\n</div>\n',
    );
    expect(nestedAlignments(parsed)).toEqual([]);
  });
});

describe("writing markdown", () => {
  it("writes blocks aligned alike in one <div align>, with blank lines inside", () => {
    expect(
      serializeMarkdown(
        doc(
          aligned("center", h(1, "Title")),
          aligned("center", p("A **bold** one.")),
          p("Left."),
          aligned("right", p("Right.")),
        ),
      ),
    ).toBe(
      '<div align="center">\n\n# Title\n\nA \\*\\*bold\\*\\* one.\n\n</div>\n\nLeft.\n\n<div align="right">\n\nRight.\n\n</div>',
    );
  });

  it("splits the wrapper at a block that can't be aligned", () => {
    expect(
      serializeMarkdown(
        doc(
          aligned("center", p("a")),
          schema.node("page_break"),
          aligned("center", p("b")),
        ),
      ),
    ).toBe(
      '<div align="center">\n\na\n\n</div>\n\n<!-- pagebreak -->\n\n<div align="center">\n\nb\n\n</div>',
    );
  });

  it("writes no wrapper for an empty aligned paragraph", () => {
    expect(
      serializeMarkdown(
        doc(aligned("center", p("a")), aligned("center", p()), p("b")),
      ),
    ).toBe('<div align="center">\n\na\n\n</div>\n\nb');
  });

  it("reopens what it wrote", () => {
    const written = doc(
      aligned("justify", h(2, "Head")),
      aligned("justify", p("text")),
      p("left"),
    );
    expect(parseMarkdown(serializeMarkdown(written)).eq(written)).toBe(true);
  });

  it("escapes the tags it reads when they are typed", () => {
    const typed = doc(
      p('<div align="center">'),
      p("</div>"),
      p('<p align="right">x</p>'),
      p('<h2 align="right">x</h2>'),
      p("<u>under</u> and <ins>in</ins>"),
    );
    const written = serializeMarkdown(typed);
    expect(parseMarkdown(written).eq(typed)).toBe(true);
  });
});
