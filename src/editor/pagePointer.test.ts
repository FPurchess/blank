import { EditorState, Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { forgetEngineFailure, useFallbackEditor } from "../engine/engine";
import { schema } from "../markdown";
import { doc, p } from "../test/editor";
import { invoke } from "@tauri-apps/api/core";

import {
  hasPrimarySelection,
  nativePointer,
  pastePrimary,
  PAGE_MENU,
  PAGE_PRESS,
  type PagePointerEvent,
} from "./pagePointer";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

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

describe("pastePrimary", () => {
  let view: EditorView;
  const platform = (name: string) =>
    vi.spyOn(navigator, "platform", "get").mockReturnValue(name);

  beforeEach(() => {
    // what ProseMirror's paste makes, which jsdom lacks
    vi.stubGlobal("ClipboardEvent", class extends Event {});
    view = new EditorView(document.createElement("div"), {
      state: EditorState.create({ schema, doc: doc(p("hello world")) }),
    });
  });
  afterEach(() => view.destroy());

  it("pastes the primary selection where the middle click was, as plain text", async () => {
    platform("Linux x86_64");
    vi.mocked(invoke).mockResolvedValue("**bold** ");

    expect(await pastePrimary(view, 7)).toBe(true);

    expect(invoke).toHaveBeenCalledWith("read_primary");
    // as typed, not as markdown
    expect(view.state.doc.textContent).toBe("hello **bold** world");
  });

  it("moves the caret there without a primary selection", async () => {
    platform("Linux x86_64");
    vi.mocked(invoke).mockResolvedValue(null);
    await pastePrimary(view, 4);
    expect(view.state.selection.head).toBe(4);
    expect(view.state.doc.textContent).toBe("hello world");
  });

  it("goes on when the primary selection can't be read", async () => {
    platform("Linux x86_64");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(invoke).mockRejectedValue(new Error("no display"));
    expect(await pastePrimary(view, 4)).toBe(true);
    expect(view.state.doc.textContent).toBe("hello world");
  });

  it("does nothing where there's no primary selection, on macOS and Windows", async () => {
    for (const name of ["MacIntel", "Win32"]) {
      platform(name);
      expect(hasPrimarySelection()).toBe(false);
      expect(await pastePrimary(view, 4)).toBe(false);
    }
    expect(invoke).not.toHaveBeenCalled();
    expect(view.state.selection.head).not.toBe(4);
  });
});
