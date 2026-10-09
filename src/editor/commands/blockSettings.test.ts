import { NodeSelection, TextSelection } from "prosemirror-state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createState, createTestView, doc, p } from "../../test/editor";
import { diagram, registerBoxes } from "../../test/sources";
import { diagramPopover } from "../../state";
import { sourceBlocks } from "../plugins/sourceBlocks";
import { editDiagram } from "./contentBlocks";

vi.mock("../plugins/followLayout", () => ({
  boxOnCaretPage: vi.fn(() => ({ left: 10, top: 20, bottom: 60, right: 110 })),
  followLayout: vi.fn(() => () => {}),
}));

const setup = () => {
  const node = doc(p("a"), diagram("A --> B"), p("b"), diagram("C --> D"));
  return createTestView(createState(node, { plugins: [sourceBlocks()] }));
};
const posOf = (view: ReturnType<typeof setup>, index: number) => {
  let pos = 0;
  for (let at = 0; at < index; at++) pos += view.state.doc.child(at).nodeSize;
  return pos;
};

describe("a block's settings", () => {
  let unregister = () => {};
  beforeEach(() => {
    unregister = registerBoxes();
  });
  afterEach(() => {
    unregister();
    diagramPopover.value = null;
  });

  it("close on the key again, and open another block's in their place", () => {
    const view = setup();
    const select = (index: number) =>
      view.dispatch(
        view.state.tr.setSelection(
          NodeSelection.create(view.state.doc, posOf(view, index)),
        ),
      );
    select(1);
    editDiagram()(view.state, view.dispatch, view);
    const first = diagramPopover.value!;
    expect(first.label).toBe("Flowchart");
    select(3);
    editDiagram()(view.state, view.dispatch, view);
    expect(diagramPopover.value).not.toBe(first);
    expect(diagramPopover.value).not.toBeNull();
    editDiagram()(view.state, view.dispatch, view);
    expect(diagramPopover.value).toBeNull();
  });

  it("change a diagram being typed and leave it open", () => {
    const view = setup();
    const inSource = posOf(view, 1) + 3;
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.create(view.state.doc, inSource),
      ),
    );
    expect(editDiagram()(view.state, view.dispatch, view)).toBe(true);
    diagramPopover.value!.apply({ width: "50%", caption: "Plan", alt: "" });
    expect(view.state.doc.child(1).attrs).toMatchObject({
      width: "50%",
      caption: "Plan",
    });
    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection.from).toBe(inSource);
  });
});
