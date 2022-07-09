import { Schema, NodeSpec, MarkSpec, DOMOutputSpec } from "prosemirror-model";
import { addListNodes } from "prosemirror-schema-list";
import OrderedMap from "orderedmap";

const pDOM: DOMOutputSpec = ["p", 0],
  brDOM: DOMOutputSpec = ["br"];

/// [Specs](#model.NodeSpec) for the nodes defined in this schema.
export const nodes = {
  /// NodeSpec The top level document node.
  doc: {
    content: "block+",
  } as NodeSpec,

  /// A plain paragraph textblock. Represented in the DOM
  /// as a `<p>` element.
  paragraph: {
    content: "inline*",
    group: "block",
    parseDOM: [{ tag: "p" }],
    toDOM() {
      return pDOM;
    },
  } as NodeSpec,

  /// A horizontal rule (`<hr>`).
  horizontal_rule: {
    group: "block",
    parseDOM: [{ tag: "hr" }],
    toDOM() {
      return hrDOM;
    },
  } as NodeSpec,

  /// A heading textblock, with a `level` attribute that
  /// should hold the number 1 to 6. Parsed and serialized as `<h1>` to
  /// `<h6>` elements.
  heading: {
    attrs: { level: { default: 1 } },
    content: "inline*",
    group: "block",
    defining: true,
    parseDOM: [
      { tag: "h1", attrs: { level: 1 } },
      { tag: "h2", attrs: { level: 2 } },
      { tag: "h3", attrs: { level: 3 } },
      { tag: "h4", attrs: { level: 4 } },
      { tag: "h5", attrs: { level: 5 } },
      { tag: "h6", attrs: { level: 6 } },
    ],
    toDOM(node) {
      return ["h" + node.attrs.level, 0];
    },
  } as NodeSpec,

  /// The text node.
  text: {
    group: "inline",
  } as NodeSpec,

  /// A hard line break, represented in the DOM as `<br>`.
  hard_break: {
    inline: true,
    group: "inline",
    selectable: false,
    parseDOM: [{ tag: "br" }],
    toDOM() {
      return brDOM;
    },
  } as NodeSpec,
};

const emDOM: DOMOutputSpec = ["em", 0],
  uDOM: DOMOutputSpec = ["u", 0],
  strongDOM: DOMOutputSpec = ["strong", 0];

/// [Specs](#model.MarkSpec) for the marks in the schema.
export const marks = {
  u: {
    parseDOM: [{ tag: "u" }, { style: "text-decoration=underline" }],
    toDOM() {
      return uDOM;
    },
  } as MarkSpec,

  /// An emphasis mark. Rendered as an `<em>` element. Has parse rules
  /// that also match `<i>` and `font-style: italic`.
  em: {
    parseDOM: [{ tag: "i" }, { tag: "em" }, { style: "font-style=italic" }],
    toDOM() {
      return emDOM;
    },
  } as MarkSpec,

  /// A strong mark. Rendered as `<strong>`, parse rules also match
  /// `<b>` and `font-weight: bold`.
  strong: {
    parseDOM: [
      { tag: "strong" },
      // This works around a Google Docs misbehavior where
      // pasted content will be inexplicably wrapped in `<b>`
      // tags with a font-weight normal.
      {
        tag: "b",
        getAttrs: (node: HTMLElement) =>
          node.style.fontWeight != "normal" && null,
      },
      {
        style: "font-weight",
        getAttrs: (value: string) =>
          /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null,
      },
    ],
    toDOM() {
      return strongDOM;
    },
  } as MarkSpec,
};

export const schema = new Schema({
  nodes: addListNodes(OrderedMap.from(nodes), "paragraph block*", "block"),
  marks,
});
