import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { schema } from "../markdown";
import { pageDropCaret } from "../state";
import { doc, p } from "../test/editor";
import { pageMove } from "./pageMove";

// "hello world" with "world" selected
const selected = () => {
  const state = EditorState.create({ schema, doc: doc(p("hello world")) });
  return state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, 7, 12)),
  );
};

// a pointer event of the page view, at `x` in px; jsdom has no PointerEvent
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
const mouse = (detail: number) => ({ detail }) as MouseEvent;

describe("moving the selected text on the pages", () => {
  let view: EditorView;
  // positions by x: the pointer at x hits position x
  const press = vi.fn();
  const moveOn = () =>
    pageMove({
      view,
      posAt: (event) => event.clientX,
      press,
    });

  beforeEach(() => {
    view = new EditorView(document.createElement("div"), {
      state: selected(),
    });
    press.mockReset();
  });
  afterEach(() => {
    view.destroy();
    pageDropCaret.value = null;
  });

  it("moves it where the pointer lets go", () => {
    const move = moveOn();
    move.down(pointer(9));
    expect(move.mouseDown(mouse(1), false)).toBe(true);
    move.move(pointer(4));
    move.up(pointer(3));
    expect(view.state.doc.textContent).toBe("heworldllo ");
    expect(press).not.toHaveBeenCalled();
  });

  it("places the caret where a press without a move was", () => {
    const move = moveOn();
    move.down(pointer(9));
    move.mouseDown(mouse(1), false);
    move.move(pointer(10));
    move.up(pointer(10));
    expect(press).toHaveBeenCalledWith(9, 10);
    expect(view.state.doc.textContent).toBe("hello world");
  });

  it("leaves the second and third click of a triple click to the page view", () => {
    const move = moveOn();
    // a PointerEvent's detail is 0 in WebKit; the mouse's has the count
    move.down(pointer(9));
    expect(move.mouseDown(mouse(3), false)).toBe(false);
    move.up(pointer(9));
    expect(press).not.toHaveBeenCalled();
  });

  it("starts only in the selected text, with the first button, without Shift", () => {
    const move = moveOn();
    for (const event of [
      pointer(2),
      pointer(9, { button: 2 }),
      pointer(9, { shiftKey: true }),
    ]) {
      move.down(event);
      expect(move.mouseDown(mouse(1), false)).toBe(false);
    }
  });

  it("forgets a move that's cancelled", () => {
    const move = moveOn();
    move.down(pointer(9));
    move.move(pointer(2));
    move.cancel();
    move.up(pointer(2));
    expect(view.state.doc.textContent).toBe("hello world");
    expect(pageDropCaret.value).toBeNull();
  });
});
