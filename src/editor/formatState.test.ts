import { describe, expect, it } from "vitest";
import type { EditorState } from "prosemirror-state";

import { schema } from "../markdown";
import {
  blockquote,
  codeBlock,
  createState,
  doc,
  h,
  li,
  ol,
  p,
  ul,
} from "../test/editor";
import { blockStyleAt, listTypeAt, markActive } from "./formatState";

const { strong } = schema.marks;

const partlyBold = doc(
  schema.node("paragraph", null, [
    schema.text("bold", [strong.create()]),
    schema.text(" plain"),
  ]),
);

describe("markActive", () => {
  it("tells the caret's marks, stored ones first", () => {
    expect(markActive(createState(partlyBold, { cursor: 3 }), strong)).toBe(
      true,
    );
    expect(markActive(createState(partlyBold, { cursor: 8 }), strong)).toBe(
      false,
    );
    const at = createState(partlyBold, { cursor: 8 });
    const stored: EditorState = at.apply(at.tr.addStoredMark(strong.create()));
    expect(markActive(stored, strong)).toBe(true);
  });

  it("tells whether the whole selection has it", () => {
    expect(
      markActive(createState(partlyBold, { cursor: [1, 5] }), strong),
    ).toBe(true);
    expect(
      markActive(createState(partlyBold, { cursor: [1, 11] }), strong),
    ).toBe(false);
  });

  it("is false for a selection without text", () => {
    const empty = doc(p(), p());
    expect(markActive(createState(empty, { cursor: [1, 3] }), strong)).toBe(
      false,
    );
  });
});

describe("listTypeAt", () => {
  it("names the innermost list around the selection", () => {
    expect(listTypeAt(createState(doc(ul(li(p("a"))))))).toBe("bullet_list");
    expect(listTypeAt(createState(doc(ul(li(p("a"), ol(li(p("b"))))))))).toBe(
      "ordered_list",
    );
    expect(listTypeAt(createState(doc(p("a"))))).toBeNull();
  });
});

describe("blockStyleAt", () => {
  it.each([
    [doc(p("a")), "paragraph"],
    [doc(h(3, "a")), "heading3"],
    [doc(blockquote(p("a"))), "quote"],
    [doc(blockquote(ul(li(p("a"))))), "quote"],
    [doc(codeBlock("a")), "code_block"],
    // a paragraph in a list is text
    [doc(ul(li(p("a")))), "paragraph"],
  ])("names the style of %#", (node, style) => {
    expect(blockStyleAt(createState(node))).toBe(style);
  });

  it("is null where the selected blocks differ", () => {
    const mixed = createState(doc(h(1, "a"), p("b")), { cursor: [2, 5] });
    expect(blockStyleAt(mixed)).toBeNull();
  });
});
