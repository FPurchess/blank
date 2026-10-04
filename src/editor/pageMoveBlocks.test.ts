import { EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { gapAt } from "../engine/geometry";
import { schema } from "../markdown";
import { pageDropGap } from "../state";
import { doc, p } from "../test/editor";
import { box } from "../test/embeds";
import { pageMove } from "./pageMove";
import { moveCandidate, movesBlock } from "./pagePointer";

// where a block drops is the place between two blocks the geometry finds
vi.mock("../engine/geometry", async (original) => ({
  ...(await original<typeof import("../engine/geometry")>()),
  gapAt: vi.fn(),
}));

const toc = () => schema.node("toc");

// "a", a table of contents (at 3), "b" (at 4) and "c" (at 7)
const withToc = () => {
  const state = EditorState.create({
    schema,
    doc: doc(p("a"), toc(), p("b"), p("c")),
  });
  return state.apply(state.tr.setSelection(NodeSelection.create(state.doc, 3)));
};

// a pointer event of the page view at `x`; jsdom has no PointerEvent
const pointer = (x: number, init: Partial<PointerEvent> = {}): PointerEvent =>
  ({
    clientX: x,
    clientY: 10,
    button: 0,
    buttons: 1,
    detail: 0,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    pointerId: 1,
    ...init,
  }) as PointerEvent;

describe("moving a selected block on the pages", () => {
  let view: EditorView;
  const press = vi.fn();
  // the pointer at x hits position x, and the view spans x 0 to 100
  const moveOn = () =>
    pageMove({
      view,
      posAt: (event) => event.clientX,
      inView: (event) => event.clientX >= 0 && event.clientX <= 100,
      press,
    });

  beforeEach(() => {
    view = new EditorView(document.createElement("div"), { state: withToc() });
    // the gap after "c" for a point right of 50, else the one after "a"
    vi.mocked(gapAt).mockImplementation((_doc, x) => (x > 50 ? 10 : 3));
    press.mockReset();
  });
  afterEach(() => {
    view.destroy();
    pageDropGap.value = null;
  });

  it("starts on the selected block at the top of the document", () => {
    expect(movesBlock(view.state)).toBe(true);
    expect(moveCandidate(view.state, 3)).toBe(true);
    expect(moveCandidate(view.state, 5)).toBe(false);
    // not on a selected node inside a block, e.g. an image
    const text = view.state.apply(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)),
    );
    expect(movesBlock(text)).toBe(false);
  });

  it("shows where it drops, and moves it there, still selected", () => {
    const move = moveOn();
    move.down(pointer(3));
    move.move(pointer(60));
    expect(pageDropGap.value).toBe(10);
    move.up(pointer(60));
    expect(pageDropGap.value).toBeNull();
    const names = [] as string[];
    view.state.doc.forEach((node) => names.push(node.type.name));
    expect(names).toEqual(["paragraph", "paragraph", "paragraph", "toc"]);
    expect(view.state.selection).toBeInstanceOf(NodeSelection);
    expect(press).not.toHaveBeenCalled();
  });

  it("stays where it is when dropped next to itself", () => {
    const move = moveOn();
    move.down(pointer(3));
    move.move(pointer(20));
    expect(pageDropGap.value).toBe(3);
    move.up(pointer(20));
    expect(view.state.doc.child(1).type.name).toBe("toc");
  });

  it("gives a copy of an embed an id of its own", () => {
    const embed = schema.nodes.embed.create({
      type: "org.blank.test/box@1",
      id: "k3x9",
      svg: box("red"),
    });
    const state = EditorState.create({
      schema,
      doc: doc(p("a"), embed, p("b"), p("c")),
    });
    view.updateState(
      state.apply(state.tr.setSelection(NodeSelection.create(state.doc, 3))),
    );
    const move = moveOn();
    move.down(pointer(3));
    move.move(pointer(60));
    move.up(pointer(60, { ctrlKey: true }));
    const ids: string[] = [];
    view.state.doc.forEach((node) => {
      if (node.type.name === "embed") ids.push(node.attrs.id as string);
    });
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe("k3x9");
    expect(ids[1]).not.toBe("k3x9");
  });

  it("is cancelled off the pages and by Esc", () => {
    const move = moveOn();
    move.down(pointer(3));
    move.move(pointer(60));
    move.move(pointer(500));
    expect(pageDropGap.value).toBeNull();
    move.up(pointer(500));
    expect(view.state.doc.child(1).type.name).toBe("toc");
    move.down(pointer(3));
    move.move(pointer(60));
    move.cancel();
    expect(pageDropGap.value).toBeNull();
    move.up(pointer(60));
    expect(view.state.doc.child(1).type.name).toBe("toc");
  });
});
