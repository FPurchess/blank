import { DOMParser, DOMSerializer } from "prosemirror-model";
import { describe, expect, it } from "vitest";

import { parseMarkdown, schema, serializeMarkdown } from "../index";
import { embedSrc } from "./embeds";

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><rect width="40" height="20" fill="#d33"/></svg>';

const embed = ({
  args = 'type="org.example/sketch@1" id="k3x9"',
  data = '````json\n{"shapes": [1, 2]}\n````',
  svg = `\`\`\`\`svg\n${SVG}\n\`\`\`\``,
} = {}) =>
  [`<!-- blank:embed@1 ${args} -->`, data, svg, "<!-- /blank:embed -->"]
    .filter(Boolean)
    .join("\n\n");

describe("embeds", () => {
  it("reads an embed with its data and drawing", () => {
    const doc = parseMarkdown(`Before\n\n${embed()}\n\nAfter`);
    const node = doc.child(1);
    expect(node.type.name).toBe("embed");
    expect(node.attrs).toMatchObject({
      type: "org.example/sketch@1",
      id: "k3x9",
      data: '{"shapes": [1, 2]}',
      lang: "json",
      svg: SVG,
    });
    expect(embedSrc(node)).toMatch(
      /^data:image\/svg\+xml;charset=utf-8,%3Csvg/,
    );
  });

  it.each([
    ["with its data", embed()],
    ["without data", embed({ data: "" })],
    [
      "with a width, an alt text and an argument of a newer Blank",
      embed({
        args: 'type="org.example/sketch@1" id="k3x9" width="80mm" alt="A sketch" layer="2"',
      }),
    ],
    [
      "with XML data holding backticks",
      embed({ data: "````xml\n<a>```</a>\n````" }),
    ],
  ])("round-trips %s", (_, markdown) => {
    expect(serializeMarkdown(parseMarkdown(markdown))).toBe(markdown);
  });

  it.each([
    ["without a drawing", embed({ svg: "" })],
    ["of no type", embed({ args: 'id="k3x9"' })],
    ["of a type that isn't namespaced", embed({ args: 'type="sketch"' })],
    [
      "with a width that isn't a length",
      embed({ args: 'type="a.b/c@1" width="wide"' }),
    ],
    ["with a drawing that isn't SVG", embed({ svg: "````svg\n<html/>\n````" })],
    ["with text in it", embed({ data: "Some text" })],
    ["of a newer format", embed().replace("embed@1", "embed@2")],
  ])("keeps an embed %s as a block it can't show", (_, markdown) => {
    const doc = parseMarkdown(markdown);
    expect(doc.child(0).type.name).toBe("unknown_block");
    expect(serializeMarkdown(doc)).toBe(markdown);
  });

  it("cleans its drawing", () => {
    const doc = parseMarkdown(
      embed({
        svg: `\`\`\`\`svg\n${SVG.replace("<rect", '<script>alert(1)</script><rect onclick="x()"')}\n\`\`\`\``,
      }),
    );
    expect(doc.child(0).attrs.svg).not.toMatch(/script|onclick/);
  });

  it("goes through the clipboard whole, and cleaned", () => {
    const node = parseMarkdown(embed()).child(0);
    const dom = DOMSerializer.fromSchema(schema).serializeNode(node);
    const pasted = DOMParser.fromSchema(schema).parse(
      Object.assign(document.createElement("div"), {
        innerHTML: (dom as HTMLElement).outerHTML,
      }),
    );
    expect(pasted.child(0).eq(node)).toBe(true);
    // a figure with a drawing that runs something
    const evil = document.createElement("div");
    const figure = document.createElement("figure");
    figure.setAttribute(
      "data-blank-embed",
      JSON.stringify({
        ...node.attrs,
        svg: SVG.replace("<rect", '<rect onload="x()"'),
      }),
    );
    evil.append(figure);
    const cleaned = DOMParser.fromSchema(schema).parse(evil).child(0);
    expect(cleaned.attrs.svg).not.toContain("onload");
  });
});
