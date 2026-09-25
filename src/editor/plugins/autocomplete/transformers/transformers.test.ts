import { describe, expect, it } from "vitest";
import { schema } from "prosemirror-markdown";
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
import blockquote from "./blockquote";
import bullet_list from "./bullet_list";
import heading from "./heading";
import type { BlockTransformer } from "../types";
import code_block from "./code_block";
import horizontal_rule from "./horizontal_rule";
import ordered_list from "./ordered_list";

/**
 * runTransformer places the cursor at the end of top-level block `index`
 * (or at the end of the doc for "end"), then activates and applies
 * `transformer` to `text` like the plugin does.
 */
const runTransformer = <T>(
  transformer: BlockTransformer<T>,
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
  it.each(["-", "*", "+"])("activates for exactly %j", (cmd) => {
    expect(bullet_list.activate(cmd)).toBe(true);
  });

  it("ignores anything else", () => {
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

// the transformers differ in their props type, the table only needs `unknown`
const withoutCursor: {
  name: string;
  transformer: BlockTransformer<unknown>;
  text: string;
}[] = [
  {
    name: "heading",
    transformer: heading as BlockTransformer<unknown>,
    text: "#",
  },
  {
    name: "blockquote",
    transformer: blockquote as BlockTransformer<unknown>,
    text: ">",
  },
  {
    name: "bullet_list",
    transformer: bullet_list as BlockTransformer<unknown>,
    text: "-",
  },
  {
    name: "ordered_list",
    transformer: ordered_list as BlockTransformer<unknown>,
    text: "1.",
  },
  {
    name: "horizontal_rule",
    transformer: horizontal_rule as BlockTransformer<unknown>,
    text: "---",
  },
  {
    name: "code_block",
    transformer: code_block as BlockTransformer<unknown>,
    text: "```",
  },
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

describe("transformer.ordered_list", () => {
  it.each([
    ["1.", 1],
    ["7.", 7],
    ["123456789.", 123456789],
  ])("activates %j with order %i", (text, order) => {
    expect(ordered_list.activate(text)).toEqual({ order });
  });

  it.each(["1", "a.", "1)", "1234567890.", "a 1."])("ignores %j", (text) => {
    expect(ordered_list.activate(text)).toBeUndefined();
  });

  it("turns the block into an ordered list starting at the number", () => {
    const { view, result } = runTransformer(
      ordered_list,
      doc(p("7.")),
      0,
      "7.",
    );

    expect(result).toBe(true);
    expect(view.state.doc.toJSON()).toEqual(
      doc(schema.node("ordered_list", { order: 7 }, [li(p())])).toJSON(),
    );
  });
});

describe("transformer.horizontal_rule", () => {
  it.each(["---", "***", "___"])("activates on Enter for %j", (text) => {
    expect(horizontal_rule.trigger).toBe("enter");
    expect(horizontal_rule.activate(text)).toBe(true);
  });

  it.each(["--", "----", "-*-", "a ---"])("ignores %j", (text) => {
    expect(horizontal_rule.activate(text)).toBeUndefined();
  });

  it.each(positions(p("---")))(
    "replaces the $position block with a rule and an empty paragraph",
    ({ node, index }) => {
      const { view, result } = runTransformer(
        horizontal_rule,
        node,
        index,
        "---",
      );

      expect(result).toBe(true);
      expect(view.state.doc.child(index).type.name).toBe("horizontal_rule");
      const next = view.state.doc.child(index + 1);
      expect(next.type.name).toBe("paragraph");
      expect(view.state.selection.$from.parent).toBe(next);
      expect(view.state.doc.childCount).toBe(node.childCount + 1);
    },
  );

  it("leaves a heading alone", () => {
    const node = doc(h(1, "---"));
    const { view, result } = runTransformer(horizontal_rule, node, 0, "---");

    expect(result).toBe(false);
    expect(view.state.doc).toBe(node);
  });
});

describe("transformer.code_block", () => {
  it.each([
    ["```", ""],
    ["```ts", "ts"],
    ["```c++", "c++"],
  ])("activates on Enter for %j", (text, params) => {
    expect(code_block.trigger).toBe("enter");
    expect(code_block.activate(text)).toEqual({ params });
  });

  it.each(["``", "```ts x", "````", "a ```"])("ignores %j", (text) => {
    expect(code_block.activate(text)).toBeUndefined();
  });

  it("turns the paragraph into a code block with the language", () => {
    const { view, result } = runTransformer(
      code_block,
      doc(p("before"), p("```ts")),
      1,
      "```ts",
    );

    expect(result).toBe(true);
    expect(view.state.doc.toJSON()).toEqual(
      doc(p("before"), schema.node("code_block", { params: "ts" })).toJSON(),
    );
    expect(view.state.selection.$from.parent.type.name).toBe("code_block");
  });

  it("leaves a heading alone", () => {
    const node = doc(h(1, "```"));
    const { view, result } = runTransformer(code_block, node, 0, "```");

    expect(result).toBe(false);
    expect(view.state.doc).toBe(node);
  });
});
