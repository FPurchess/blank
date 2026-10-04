import { history, undo } from "prosemirror-history";
import { EditorState, TextSelection } from "prosemirror-state";
import { CellSelection } from "prosemirror-tables";
import { wrapInList } from "prosemirror-schema-list";
import { describe, expect, it } from "vitest";

import { schema } from "../../markdown";
import {
  aligned,
  blockquote,
  codeBlock,
  createState,
  createTestView,
  doc,
  h,
  li,
  p,
  table,
  td,
  tr,
  ul,
} from "../../test/editor";
import { alignmentGuard } from "../plugins/alignment";
import { keymap } from "../plugins/keymap";
import { pressKey } from "../../test/editor";
import { alignedBlocks, alignmentAt, alignText } from "./align";
import { setTextblock } from "./setTextblock";

const aligns = (state: EditorState) =>
  state.doc.content.content.map((node) => node.attrs.align ?? null);

const run = (state: EditorState, command: ReturnType<typeof alignText>) => {
  const view = createTestView(state);
  const done = command(view.state, view.dispatch, view);
  return { done, state: view.state };
};

describe("alignText", () => {
  it("aligns the paragraph at the cursor, and back to the left", () => {
    const state = createState(doc(p("one"), p("two")), { cursor: 2 });
    const centered = run(state, alignText("center"));
    expect(centered.done).toBe(true);
    expect(aligns(centered.state)).toEqual(["center", null]);
    expect(alignmentAt(centered.state)).toBe("center");
    // the same alignment again goes back to the left
    expect(aligns(run(centered.state, alignText("center")).state)).toEqual([
      null,
      null,
    ]);
    expect(aligns(run(centered.state, alignText("left")).state)).toEqual([
      null,
      null,
    ]);
  });

  it("aligns every paragraph and heading the selection touches", () => {
    const state = createState(doc(h(1, "Title"), p("one"), p("two")), {
      cursor: [3, 10],
    });
    const right = run(state, alignText("right")).state;
    expect(aligns(right)).toEqual(["right", "right", null]);
    expect(alignedBlocks(right)).toHaveLength(2);
  });

  it("tells mixed alignments apart from left", () => {
    const state = createState(doc(aligned("center", p("one")), p("two")), {
      cursor: [2, 8],
    });
    expect(alignmentAt(state)).toBeNull();
    expect(alignmentAt(createState(doc(p("x")), { cursor: 1 }))).toBe("left");
  });

  it("doesn't apply in lists, quotes and code", () => {
    for (const block of [
      ul(li(p("item"))),
      blockquote(p("quote")),
      codeBlock("code"),
    ]) {
      const state = createState(doc(block), { cursor: 3 });
      expect(alignText("center")(state)).toBe(false);
      expect(alignmentAt(state)).toBeNull();
    }
  });

  it("aligns a table's columns, which can't be justified", () => {
    const state = createState(doc(table(tr(td("a"), td("b")))), {
      cursor: 4,
    });
    expect(alignText("justify")(state)).toBe(false);
    const centered = run(state, alignText("center")).state;
    const cell = centered.doc.firstChild!.firstChild!.firstChild!;
    expect(cell.attrs.align).toBe("center");
    expect(alignmentAt(centered)).toBe("center");
    expect(alignmentAt(state)).toBe("left");
    expect(alignedBlocks(state)).toEqual([]);
  });

  it("names the columns' alignment null where they differ", () => {
    const start = createState(
      doc(table(tr(td("a", { align: "right" }), td("b")))),
    );
    const both = start.apply(
      start.tr.setSelection(CellSelection.create(start.doc, 2, 7)),
    );
    expect(alignmentAt(both)).toBeNull();
  });
});

describe("setTextblock", () => {
  it("keeps each block's alignment when its type changes", () => {
    const state = createState(
      doc(aligned("center", p("one")), aligned("right", p("two"))),
      { cursor: [2, 8] },
    );
    const headings = run(
      state,
      setTextblock(schema.nodes.heading, { level: 2 }),
    ).state;
    expect(headings.doc.child(0).type.name).toBe("heading");
    expect(aligns(headings)).toEqual(["center", "right"]);
    // and back to paragraphs, which a code block drops
    const back = run(headings, setTextblock(schema.nodes.paragraph)).state;
    expect(aligns(back)).toEqual(["center", "right"]);
    const code = run(back, setTextblock(schema.nodes.code_block)).state;
    expect(code.doc.child(0).type.name).toBe("code_block");
  });

  it("doesn't apply where the blocks are what it makes, whatever their alignment", () => {
    const state = createState(doc(aligned("center", h(2, "x"))), { cursor: 2 });
    expect(setTextblock(schema.nodes.heading, { level: 2 })(state)).toBe(false);
    expect(setTextblock(schema.nodes.heading, { level: 3 })(state)).toBe(true);
  });
});

describe("Enter after an aligned block", () => {
  const enter = (state: EditorState) => {
    const view = createTestView(state);
    pressKey(view, keymap(), "Enter");
    return view.state;
  };

  it("starts a paragraph aligned like it, after a heading too", () => {
    const state = createState(doc(aligned("center", h(1, "Title"))));
    const after = enter(state);
    expect(after.doc.child(1).type.name).toBe("paragraph");
    expect(aligns(after)).toEqual(["center", "center"]);
  });

  it("keeps the alignment on both halves of a split block", () => {
    const state = createState(doc(aligned("right", p("onetwo"))), {
      cursor: 4,
    });
    expect(aligns(enter(state))).toEqual(["right", "right"]);
  });

  it("starts a plain paragraph after a left one", () => {
    expect(aligns(enter(createState(doc(p("x")))))).toEqual([null, null]);
  });
});

describe("alignmentGuard", () => {
  const withGuard = (node: ReturnType<typeof doc>, cursor = 2) => {
    const state = EditorState.create({
      schema,
      doc: node,
      plugins: [history(), alignmentGuard()],
    });
    return state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, cursor)),
    );
  };

  it("drops the alignment of a paragraph made a list item, and undo brings it back", () => {
    const state = withGuard(doc(aligned("center", p("centered"))));
    const view = createTestView(state);
    wrapInList(schema.nodes.bullet_list)(view.state, view.dispatch);
    const listed = view.state.doc.firstChild!;
    expect(listed.type.name).toBe("bullet_list");
    expect(listed.firstChild!.firstChild!.attrs.align).toBeNull();

    undo(view.state, view.dispatch);
    expect(view.state.doc.firstChild!.type.name).toBe("paragraph");
    expect(view.state.doc.firstChild!.attrs.align).toBe("center");
  });

  it("leaves the alignment of blocks at the top alone", () => {
    const state = withGuard(doc(aligned("center", p("a")), p("b")));
    const typed = state.apply(state.tr.insertText("x", 2));
    expect(typed.doc.firstChild!.attrs.align).toBe("center");
  });
});
