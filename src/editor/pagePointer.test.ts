import { EditorState, Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { forgetEngineFailure, useFallbackEditor } from "../engine/engine";
import { schema } from "../markdown";
import { doc, p } from "../test/editor";
import {
  nativePointer,
  PAGE_MENU,
  PAGE_PRESS,
  type PagePointerEvent,
} from "./pagePointer";

describe("nativePointer", () => {
  let view: EditorView;
  const presses: PagePointerEvent["detail"][] = [];
  let take = false;

  // a plugin that listens to the page view's events, and takes a press
  // when `take` is set
  const listener = new Plugin({
    props: {
      handleDOMEvents: {
        [PAGE_PRESS]: (_view, event: PagePointerEvent) => {
          presses.push(event.detail);
          if (take) event.preventDefault();
          return take;
        },
        [PAGE_MENU]: (_view, event: PagePointerEvent) => {
          presses.push({ ...event.detail, button: -1 });
          return true;
        },
      },
    },
  });

  const fire = (type: string, init: MouseEventInit) => {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      ...init,
    });
    view.dom.dispatchEvent(event);
    return event;
  };

  beforeEach(() => {
    presses.length = 0;
    take = false;
    view = new EditorView(document.createElement("div"), {
      state: EditorState.create({
        schema,
        doc: doc(p("hello")),
        plugins: [nativePointer(), listener],
      }),
    });
    vi.spyOn(view, "posAtCoords").mockReturnValue({ pos: 3, inside: -1 });
  });
  afterEach(() => {
    view.destroy();
    forgetEngineFailure();
  });

  it("does nothing while the engine shows the pages", () => {
    fire("mousedown", { button: 0, clientX: 5, clientY: 6 });
    expect(presses).toEqual([]);
  });

  it("hands a press on the editor's own text to the plugins", () => {
    useFallbackEditor("unavailable");
    const event = fire("mousedown", { button: 0, clientX: 5, clientY: 6 });
    expect(presses).toEqual([
      expect.objectContaining({ pos: 3, link: null, x: 5, y: 6, button: 0 }),
    ]);
    // nobody took it, so ProseMirror places the caret
    expect(event.defaultPrevented).toBe(false);
  });

  it("keeps ProseMirror from a press a plugin took", () => {
    useFallbackEditor("failed");
    take = true;
    expect(fire("mousedown", { button: 0 }).defaultPrevented).toBe(true);
  });

  it("hands a right click to the menu, but not the ContextMenu key", () => {
    useFallbackEditor("off");
    const click = fire("contextmenu", { button: 2, clientX: 5, clientY: 6 });
    expect(click.defaultPrevented).toBe(true);
    expect(presses).toEqual([expect.objectContaining({ pos: 3, button: -1 })]);

    presses.length = 0;
    fire("contextmenu", { button: 0, clientX: 0, clientY: 0 });
    expect(presses).toEqual([]);
  });
});
