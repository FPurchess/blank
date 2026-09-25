import { describe, expect, it } from "vitest";
import type { Node } from "prosemirror-model";

import {
  createState,
  createTestView,
  doc,
  endOfBlock,
  h,
  li,
  p,
  ul,
} from "../../../../test/editor";
import arrows from "./arrows";
import blockquote from "./blockquote";
import bullet_list from "./bullet_list";
import heading from "./heading";
import type { Transformer } from "../types";

/**
 * runTransformer places the cursor at the end of top-level block `index`
 * (or at the end of the doc for "end"), then activates and applies
 * `transformer` to `text` like the plugin does.
 */
const runTransformer = <T>(
  transformer: Transformer<T>,
  node: Node,
  index: number | "end",
  text: string,
) => {
  const cursor = index === "end" ? index : endOfBlock(node, index);
  const view = createTestView(createState(node, { cursor }));
  const props = transformer.activate(text);
  expect(props).toBeDefined();
  const result = transformer.transform(view, text, props as T);
  return { view, result };
};

// the typed shortcut is the only block, the first, a middle or the last one
const positions = (block: Node) => [
  { position: "only", node: doc(block), index: 0 },
  { position: "first", node: doc(block, p("after")), index: 0 },
  { position: "middle", node: doc(p("before"), block, p("after")), index: 1 },
  { position: "last", node: doc(p("before"), block), index: 1 },
];

describe("transformer.heading", () => {
  describe("activate", () => {
    it.each([1, 2, 3, 4, 5, 6])("activates level %i", (level) => {
      expect(heading.activate("#".repeat(level))).toEqual({ level });
    });

    it.each(["#######", "#a", "a#", "# ", ""])("ignores %j", (text) => {
      expect(heading.activate(text)).toBeUndefined();
    });

    it("activates on every call, not only every other one", () => {
      expect(heading.activate("##")).toEqual({ level: 2 });
      expect(heading.activate("##")).toEqual({ level: 2 });
      expect(heading.activate("##")).toEqual({ level: 2 });
    });
  });

  describe("transform", () => {
    it.each(positions(p("##")))(
      "turns the $position block into an empty heading with the cursor inside",
      ({ node, index }) => {
        const { view, result } = runTransformer(heading, node, index, "##");

        expect(result).toBe(true);
        const block = view.state.doc.child(index);
        expect(block.type.name).toBe("heading");
        expect(block.attrs.level).toBe(2);
        expect(block.textContent).toBe("");
        expect(view.state.doc.childCount).toBe(node.childCount);
        expect(view.state.selection.$from.parent).toBe(block);
      },
    );

    it("works inside a list item", () => {
      const node = doc(ul(li(p("###"))));
      const { view, result } = runTransformer(heading, node, "end", "###");

      expect(result).toBe(true);
      expect(view.state.doc.toJSON()).toEqual(doc(ul(li(h(3)))).toJSON());
      expect(view.state.selection.$from.parent.type.name).toBe("heading");
    });
  });
});

describe("transformer.blockquote", () => {
  it("activates only for exactly '>'", () => {
    expect(blockquote.activate(">")).toBe(true);
    expect(blockquote.activate(">>")).toBeUndefined();
    expect(blockquote.activate("a >")).toBeUndefined();
  });

  it.each(positions(p(">")))(
    "wraps the $position block in a blockquote with the cursor inside",
    ({ node, index }) => {
      const { view, result } = runTransformer(blockquote, node, index, ">");

      expect(result).toBe(true);
      const block = view.state.doc.child(index);
      expect(block.toJSON()).toEqual({
        type: "blockquote",
        content: [{ type: "paragraph" }],
      });
      expect(view.state.selection.$from.parent).toBe(block.firstChild);
    },
  );
});

describe("transformer.bullet_list", () => {
  it("activates only for exactly '-'", () => {
    expect(bullet_list.activate("-")).toBe(true);
    expect(bullet_list.activate("--")).toBeUndefined();
    expect(bullet_list.activate("a -")).toBeUndefined();
  });

  it.each(positions(p("-")))(
    "turns the $position block into a bullet list with the cursor inside",
    ({ node, index }) => {
      const { view, result } = runTransformer(bullet_list, node, index, "-");

      expect(result).toBe(true);
      const block = view.state.doc.child(index);
      expect(block.type.name).toBe("bullet_list");
      expect(block.textContent).toBe("");
      expect(view.state.selection.$from.node(2).type.name).toBe("list_item");
    },
  );

  it("leaves the text alone when the block can't be wrapped", () => {
    const node = doc(ul(li(p("-"))));
    const { view, result } = runTransformer(bullet_list, node, "end", "-");

    expect(result).toBe(false);
    expect(view.state.doc.toJSON()).toEqual(node.toJSON());
  });
});

describe("transformer.arrows", () => {
  const cases = [
    ["-->", "→"],
    ["<--", "←"],
    ["==>", "⇒"],
    ["<==", "⇐"],
    ["<==>", "⇔"],
    ["--", "—"],
  ];

  describe("activate", () => {
    it.each(cases)("activates %j on its own", (key, value) => {
      expect(arrows.activate(key)).toEqual({ key, value });
    });

    it.each(cases)("activates %j after a word", (key, value) => {
      expect(arrows.activate(`word ${key}`)).toEqual({ key, value });
    });

    it("prefers the double arrow over its single halves", () => {
      expect(arrows.activate("a <==>")).toEqual({ key: "<==>", value: "⇔" });
    });

    it.each(["x-->", "--> x", "->", ""])("ignores %j", (text) => {
      expect(arrows.activate(text)).toBeUndefined();
    });
  });

  it.each(cases)("replaces %j with %j followed by a space", (key, value) => {
    const text = `a ${key}`;
    const { view, result } = runTransformer(arrows, doc(p(text)), 0, text);

    expect(result).toBe(true);
    expect(view.state.doc.textContent).toBe(`a ${value} `);
    expect(view.state.selection.from).toBe(endOfBlock(view.state.doc, 0));
  });
});

// the transformers differ in their props type, the table only needs `unknown`
const withoutCursor: {
  name: string;
  transformer: Transformer<unknown>;
  text: string;
}[] = [
  { name: "heading", transformer: heading as Transformer<unknown>, text: "#" },
  {
    name: "blockquote",
    transformer: blockquote as Transformer<unknown>,
    text: ">",
  },
  {
    name: "bullet_list",
    transformer: bullet_list as Transformer<unknown>,
    text: "-",
  },
  { name: "arrows", transformer: arrows as Transformer<unknown>, text: "-->" },
];

describe.each(withoutCursor)(
  "transformer.$name without a cursor",
  ({ transformer, text }) => {
    it("does nothing for a range selection", () => {
      const node = doc(p(text));
      const view = createTestView(
        createState(node, { cursor: [1, 1 + text.length] }),
      );

      const result = transformer.transform(
        view,
        text,
        transformer.activate(text),
      );

      expect(result).toBe(false);
      expect(view.state.doc.toJSON()).toEqual(node.toJSON());
    });
  },
);
