import { describe, expect, it } from "vitest";

import { parseMarkdown, schema, serializeMarkdown } from "./index";

const imageOf = (markdown: string) => {
  let found: import("prosemirror-model").Node | null = null;
  parseMarkdown(markdown).descendants((node) => {
    if (node.type.name === "image") found ??= node;
  });
  return found as import("prosemirror-model").Node | null;
};

describe("images with a width", () => {
  it("reads <img> with its width and writes it back", () => {
    const markdown = '<img src="cat.png" alt="A cat" width="50%">';
    expect(imageOf(markdown)?.attrs).toMatchObject({
      src: "cat.png",
      alt: "A cat",
      width: "50%",
    });
    expect(serializeMarkdown(parseMarkdown(markdown))).toBe(markdown);
  });

  it.each([
    [
      "in another order, single-quoted",
      "<img width='75%' alt='A cat' src='cat.png'/>",
    ],
    [
      "with a title and in pixels",
      '<img src="cat.png" title="Tom" width="300" alt="">',
    ],
  ])("reads one %s", (_, markdown) => {
    const image = imageOf(markdown);
    expect(image?.attrs.src).toBe("cat.png");
    expect(image?.attrs.width).toMatch(/^(75%|300)$/);
  });

  it("writes an image without a width as markdown", () => {
    const markdown = "![A cat](cat.png)";
    expect(imageOf(markdown)?.attrs.width).toBeNull();
    expect(serializeMarkdown(parseMarkdown(markdown))).toBe(markdown);
  });

  it("keeps an <img> with a width it can't lay out as text", () => {
    expect(imageOf('<img src="cat.png" width="wide">')).toBeNull();
  });

  it.each([
    ['Logo <img src="logo.png" height="80" alt="L">'],
    ['<img src="a.png" width="300" style="float:right">'],
  ])("keeps %s as text, which it would lose otherwise", (markdown) => {
    expect(imageOf(markdown)).toBeNull();
    expect(serializeMarkdown(parseMarkdown(markdown))).toBe(markdown);
  });

  it("keeps an <img> with a src it doesn't allow as text", () => {
    const markdown = '<img src="javascript:alert(1)" width="50%">';
    expect(imageOf(markdown)).toBeNull();
  });

  it("escapes what it writes in an attribute", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.nodes.image.create({
          src: "cat.png",
          alt: 'A "big" <cat> & co',
          width: "50%",
        }),
      ]),
    ]);
    const markdown = serializeMarkdown(doc);
    expect(markdown).toBe(
      '<img src="cat.png" alt="A &quot;big&quot; &lt;cat&gt; &amp; co" width="50%">',
    );
    expect(imageOf(markdown)?.attrs.alt).toBe('A "big" <cat> & co');
  });

  it("keeps a typed <img> text", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, schema.text('<img src="x.png">')),
    ]);
    const markdown = serializeMarkdown(doc);
    expect(markdown).toBe('\\<img src="x.png">');
    expect(imageOf(markdown)).toBeNull();
  });

  it("writes one with a width in a pipe table's cell", () => {
    const markdown = [
      "| A | B |",
      "| --- | --- |",
      '| <img src="cat.png" alt="" width="50%"> | x |',
    ].join("\n");
    expect(serializeMarkdown(parseMarkdown(markdown))).toContain(
      '| <img src="cat.png" alt="" width="50%"> |',
    );
  });
});
