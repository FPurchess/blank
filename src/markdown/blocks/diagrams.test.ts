import { DOMParser, DOMSerializer } from "prosemirror-model";
import { describe, expect, it } from "vitest";

import { parseMarkdown, schema, serializeMarkdown } from "../index";
import { sourceOf } from "./sourceBlock";

const FLOW = "flowchart LR\n  Idea --> Draft --> Done";
const fence = (source = FLOW, marks = "```") =>
  `${marks}mermaid\n${source}\n${marks}`;
// what Blank writes of a file, which ends without a line break
const roundTrip = (markdown: string) =>
  serializeMarkdown(parseMarkdown(markdown));
const written = (markdown: string) => markdown.replace(/\n$/, "");

describe("diagrams", () => {
  it("reads a mermaid fence at the top as a diagram, and writes it back", () => {
    const markdown = `Before\n\n${fence()}\n\nAfter\n`;
    const doc = parseMarkdown(markdown);
    const diagram = doc.child(1);
    expect(diagram.type.name).toBe("diagram");
    expect(diagram.child(0).type.name).toBe("diagram_source");
    expect(sourceOf(diagram)).toBe(FLOW);
    expect(diagram.attrs).toMatchObject({
      width: null,
      caption: "",
      alt: "",
      align: null,
    });
    expect(roundTrip(markdown)).toBe(written(markdown));
  });

  it("reads an empty one", () => {
    const doc = parseMarkdown("```mermaid\n```\n");
    expect(doc.child(0).type.name).toBe("diagram");
    expect(sourceOf(doc.child(0))).toBe("");
    expect(roundTrip("```mermaid\n```\n")).toBe(written("```mermaid\n```\n"));
  });

  it.each([
    ["tildes", fence(FLOW, "~~~")],
    ["four backticks", fence("A --> B", "````")],
  ])("keeps the fence it was read with: %s", (_, markdown) => {
    expect(roundTrip(`${markdown}\n`)).toBe(written(`${markdown}\n`));
  });

  it("writes a longer fence when the source would close it", () => {
    const doc = parseMarkdown(`${fence("A")}\n`);
    const diagram = doc.child(0);
    const changed = doc.replace(
      2,
      2 + diagram.child(0).content.size,
      schema
        .node("doc", null, [
          schema.nodes.diagram.create(
            null,
            schema.nodes.diagram_source.create(null, schema.text("A\n```\nB")),
          ),
        ])
        .slice(2, 2 + "A\n```\nB".length),
    );
    expect(serializeMarkdown(changed)).toBe("````mermaid\nA\n```\nB\n````");
  });

  it("reads its settings from a marker around it and writes them back", () => {
    const markdown = [
      '<!-- blank:diagram@1 width="50%" caption="The plan" alt="Three steps" future="kept" -->',
      fence(),
      "<!-- /blank:diagram -->",
    ].join("\n\n");
    const diagram = parseMarkdown(markdown).child(0);
    expect(diagram.attrs).toMatchObject({
      width: "50%",
      caption: "The plan",
      alt: "Three steps",
      extra: { future: "kept" },
    });
    expect(roundTrip(markdown)).toBe(written(`${markdown}\n`));
  });

  it("writes no marker without settings", () => {
    const markdown = [
      "<!-- blank:diagram@1 -->",
      fence(),
      "<!-- /blank:diagram -->",
    ].join("\n\n");
    expect(roundTrip(markdown)).toBe(written(`${fence()}\n`));
  });

  it.each([
    [
      "a width it can't read",
      [
        '<!-- blank:diagram@1 width="wide" -->',
        fence(),
        "<!-- /blank:diagram -->",
      ],
    ],
    [
      "two fences",
      ["<!-- blank:diagram@1 -->", fence(), fence(), "<!-- /blank:diagram -->"],
    ],
    [
      "another language",
      ["<!-- blank:diagram@1 -->", "```js\nx\n```", "<!-- /blank:diagram -->"],
    ],
  ])("keeps one with %s as a block Blank can't show", (_, lines) => {
    const markdown = lines.join("\n\n");
    const doc = parseMarkdown(markdown);
    expect(doc.child(0).type.name).toBe("unknown_block");
    expect(roundTrip(markdown)).toBe(written(`${markdown}\n`));
  });

  it.each([
    ["a list", `- item\n\n  ${fence().replaceAll("\n", "\n  ")}\n`],
    ["a quote", `> ${fence().replaceAll("\n", "\n> ")}\n`],
  ])("leaves a mermaid fence in %s a code block", (_, markdown) => {
    const doc = parseMarkdown(markdown);
    let types: string[] = [];
    doc.descendants((node) => void types.push(node.type.name));
    expect(types).toContain("code_block");
    expect(types).not.toContain("diagram");
    types = [];
  });

  it("leaves a mermaid fence in a form's field a code block", () => {
    const markdown = [
      '<!-- blank:form@1 def="blank/memo@1#00000000" -->',
      '<!-- blank:field name="body" -->',
      fence(),
      "<!-- /blank:form -->",
    ].join("\n\n");
    const doc = parseMarkdown(markdown);
    let diagrams = 0;
    doc.descendants(
      (node) => void (diagrams += node.type.name === "diagram" ? 1 : 0),
    );
    expect(diagrams).toBe(0);
  });

  it("reads and writes its alignment as the blocks around it have theirs", () => {
    const markdown = `<div align="center">\n\n${fence()}\n\n</div>\n`;
    const diagram = parseMarkdown(markdown).child(0);
    expect(diagram.attrs.align).toBe("center");
    expect(roundTrip(markdown)).toBe(written(markdown));
    const marked = [
      '<div align="right">',
      '<!-- blank:diagram@1 caption="Right" -->',
      fence(),
      "<!-- /blank:diagram -->",
      "</div>",
    ].join("\n\n");
    expect(parseMarkdown(marked).child(0).attrs).toMatchObject({
      align: "right",
      caption: "Right",
    });
    expect(roundTrip(marked)).toBe(written(`${marked}\n`));
  });

  it("goes through the clipboard's HTML whole, and checked", () => {
    const doc = parseMarkdown(
      `<!-- blank:diagram@1 width="75%" -->\n\n${fence()}\n\n<!-- /blank:diagram -->`,
    );
    const dom = DOMSerializer.fromSchema(schema).serializeFragment(doc.content);
    const div = document.createElement("div");
    div.appendChild(dom);
    const back = DOMParser.fromSchema(schema).parse(div);
    expect(back.child(0).type.name).toBe("diagram");
    expect(back.child(0).attrs.width).toBe("75%");
    expect(sourceOf(back.child(0))).toBe(FLOW);
    // a width that can't be one makes it no diagram
    const figure = div.querySelector("figure")!;
    figure.setAttribute(
      "data-blank-diagram",
      JSON.stringify({ width: "very" }),
    );
    expect(DOMParser.fromSchema(schema).parse(div).child(0).type.name).not.toBe(
      "diagram",
    );
  });

  it("keeps tabs in its source as they are", () => {
    const markdown = `${fence("flowchart LR\n\tA --> B\t")}\n`;
    expect(roundTrip(markdown)).toBe(written(markdown));
  });

  it("keeps a typed marker text", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, schema.text("<!-- blank:diagram@1 -->")),
    ]);
    expect(serializeMarkdown(doc)).toBe("\\<!-- blank:diagram@1 -->");
  });
});
