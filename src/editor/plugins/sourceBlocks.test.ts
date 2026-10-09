import { baseKeymap } from "prosemirror-commands";
import { history, undo } from "prosemirror-history";
import { NodeSelection, TextSelection } from "prosemirror-state";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createState,
  createTestView,
  doc,
  p,
  pressKey,
  typeText,
} from "../../test/editor";
import { diagram, registerBoxes } from "../../test/sources";
import {
  forgetRendered,
  requestRender,
  sourceKeyOf,
} from "../../sources/store";
import { blockTools } from "./blockTools";
import { PAGE_PRESS } from "../pagePointer";
import { diagramPopover } from "../../state/dialogs";
import { pagePointer } from "../../test/pagePointer";
import { sourceBlocks, sourceBlocksKey } from "./sourceBlocks";

const setup = () => {
  const blocks = sourceBlocks();
  const tools = blockTools();
  const node = doc(p("before"), diagram("A --> B"), p("after"));
  const state = createState(node, { plugins: [history(), blocks, tools] });
  const view = createTestView(
    state.apply(state.tr.setSelection(NodeSelection.create(state.doc, 8))),
  );
  return { view, blocks, tools };
};

describe("source blocks in the editor", () => {
  let unregister: () => void;
  beforeEach(() => {
    unregister = registerBoxes();
  });
  afterEach(() => {
    unregister();
    forgetRendered();
  });

  it("opens a selected one on Enter, and closes it on Esc", () => {
    const { view, blocks, tools } = setup();
    expect(sourceBlocksKey.getState(view.state)?.open).toBeNull();
    expect(pressKey(view, tools, "Enter")).toBe(true);
    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection.$head.parent.type.name).toBe("diagram_source");
    expect(view.state.selection.$head.parentOffset).toBe("A --> B".length);
    expect(sourceBlocksKey.getState(view.state)?.open).toBe(8);
    expect(pressKey(view, blocks, "Escape")).toBe(true);
    expect(view.state.selection).toBeInstanceOf(NodeSelection);
    expect(view.state.selection.from).toBe(8);
    expect(sourceBlocksKey.getState(view.state)?.open).toBeNull();
  });

  it("opens a closed one when it's clicked", () => {
    const { view, blocks } = setup();
    // the caret elsewhere, as after clicking away
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)),
    );
    const press = blocks.props.handleDOMEvents![PAGE_PRESS]!;
    const click = (pos: number, extra = {}) => {
      const event = new CustomEvent(PAGE_PRESS, {
        detail: { ...pagePointer(pos), ...extra },
        cancelable: true,
      });
      return { handled: press.call(blocks, view, event), event };
    };
    // with a modifier, or elsewhere, it's the page view's
    expect(click(8, { shiftKey: true }).handled).toBe(false);
    expect(click(1).handled).toBe(false);
    expect(sourceBlocksKey.getState(view.state)?.open).toBeNull();
    // on it: opened at the end of its source, and the page view leaves the
    // selection alone
    const { handled, event } = click(8);
    expect(handled).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(sourceBlocksKey.getState(view.state)?.open).toBe(8);
    expect(view.state.selection.$head.parentOffset).toBe("A --> B".length);
    // a press in it while it's open is the page view's, which places the
    // caret
    expect(click(10).handled).toBe(false);
  });

  it("leaves Enter in an open one to the source, without its settings", () => {
    const { view, tools } = setup();
    pressKey(view, tools, "Enter");
    expect(view.state.selection.$head.parent.type.name).toBe("diagram_source");
    // the code's own Enter, a new line, comes after the block tools
    expect(pressKey(view, tools, "Enter")).toBe(false);
    expect(diagramPopover.value).toBeNull();
  });

  it("opens a selected one on typing, which goes on at the end", () => {
    const { view, tools } = setup();
    typeText(view, tools, "C");
    expect(view.state.doc.child(1).textContent).toBe("A --> BC");
    expect(view.state.selection.$head.parent.type.name).toBe("diagram_source");
    undo(view.state, view.dispatch);
    expect(view.state.doc.child(1).textContent).toBe("A --> B");
  });

  it("keeps what it made last while what is typed can't be drawn", () => {
    const { view, tools } = setup();
    requestRender(view.state.doc.child(1));
    pressKey(view, tools, "Enter");
    const good = sourceKeyOf(view.state.doc.child(1));
    expect(sourceBlocksKey.getState(view.state)?.preview).toBe(good);
    typeText(view, tools, " error");
    requestRender(view.state.doc.child(1));
    view.dispatch(view.state.tr.insertText("!"));
    expect(sourceBlocksKey.getState(view.state)?.preview).toBe(good);
  });

  it("selects it on Backspace after it, and never joins text into it", () => {
    const { view } = setup();
    const after = 8 + view.state.doc.child(1).nodeSize + 1;
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, after)),
    );
    baseKeymap.Backspace(view.state, view.dispatch);
    expect(view.state.selection).toBeInstanceOf(NodeSelection);
    expect(view.state.doc.child(1).textContent).toBe("A --> B");
    expect(view.state.doc.child(2).textContent).toBe("after");
  });
});
