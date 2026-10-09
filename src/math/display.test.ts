import { history } from "prosemirror-history";
import { NodeSelection, TextSelection } from "prosemirror-state";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { flatten } from "../engine/flatten";
import { blockTools } from "../editor/plugins/blockTools";
import { sourceBlocks, sourceBlocksKey } from "../editor/plugins/sourceBlocks";
import { forgetRendered } from "../sources/store";
import { createState, createTestView, doc, p, pressKey } from "../test/editor";
import { noSizes } from "../test/engine";
import { displayMath } from "../test/math";
import { alignmentAt, alignText } from "../editor/commands/align";
import { mathSettingsAttrs } from "../editor/commands/contentBlocks";
import { registerMath } from "./register";

// display math is a source block: opened by Enter, closed by Esc, and while
// open the pages show its source over the formula

describe("display math in the editor", () => {
  let unregister: () => void;
  beforeEach(() => {
    unregister = registerMath();
  });
  afterEach(() => {
    unregister();
    forgetRendered();
  });

  const setup = () => {
    const blocks = sourceBlocks();
    const tools = blockTools();
    const node = doc(p("before"), displayMath("x^2"), p("after"));
    const state = createState(node, { plugins: [history(), blocks, tools] });
    const view = createTestView(
      state.apply(state.tr.setSelection(NodeSelection.create(state.doc, 8))),
    );
    return { view, blocks, tools };
  };

  it("opens on Enter and closes on Esc", () => {
    const { view, blocks, tools } = setup();
    expect(pressKey(view, tools, "Enter")).toBe(true);
    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection.$head.parent.type.name).toBe(
      "math_display_source",
    );
    expect(sourceBlocksKey.getState(view.state)?.open).toBe(8);
    expect(pressKey(view, blocks, "Escape")).toBe(true);
    expect(view.state.selection).toBeInstanceOf(NodeSelection);
  });

  it("shows its source over the formula while it's open", () => {
    const node = doc(p("before"), displayMath("x^2"), p("after"));
    const closed = flatten(node, noSizes).map((record) => record.build());
    expect(closed[1]).toMatchObject({ kind: "math", pos: 8, latex: "x^2" });
    const open = flatten(node, noSizes, null, { open: 8 }).map((record) =>
      record.build(),
    );
    expect(open[1]).toMatchObject({ kind: "text", text: "x^2", style: "code" });
    expect(open[2]).toMatchObject({ kind: "math", preview: true });
    // exports show it closed
    const exported = flatten(node, noSizes, null, { open: 8, export: true });
    expect(exported.map((record) => record.build())[1]).toMatchObject({
      kind: "math",
    });
  });
});

describe("display math's settings", () => {
  const selected = (node = doc(p("a"), displayMath("x"), p("b"))) => {
    const state = createState(node);
    return createTestView(
      state.apply(state.tr.setSelection(NodeSelection.create(state.doc, 3))),
    );
  };

  it("numbers it with an id the document doesn't have", () => {
    const state = createState(
      doc(displayMath("x"), displayMath("y", { label: "eq-1" })),
    );
    const math = state.doc.child(0);
    expect(mathSettingsAttrs(math, { numbered: true }, state).label).toBe(
      "eq-2",
    );
    // a number keeps its id, and no number has none
    const numbered = state.doc.child(1);
    expect(mathSettingsAttrs(numbered, { numbered: true }, state).label).toBe(
      "eq-1",
    );
    expect(
      mathSettingsAttrs(numbered, { numbered: false }, state).label,
    ).toBeNull();
  });

  it("is centered unless aligned, and aligns right", () => {
    const view = selected();
    expect(alignmentAt(view.state)).toBe("center");
    alignText("right")(view.state, view.dispatch);
    expect(view.state.doc.child(1).attrs.align).toBe("right");
    expect(alignmentAt(view.state)).toBe("right");
    alignText("right")(view.state, view.dispatch);
    expect(view.state.doc.child(1).attrs.align).toBeNull();
    expect(alignmentAt(view.state)).toBe("center");
  });
});
