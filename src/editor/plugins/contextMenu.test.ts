import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { history } from "prosemirror-history";
import { schema } from "../../markdown";

import { doc, p, table, td, th, tr } from "../../test/editor";
import { cursorAt } from "../../test/tables";
import { deferred } from "../../test/async";
import {
  contextMenu,
  type MenuItem,
  spellcheck,
  spellchecker,
  spellcheckStatus,
} from "../../state";
import type { Spellchecker } from "../../spellcheck/types";
import { caretBox } from "../../engine/geometry";
import {
  nativePointer,
  PAGE_MENU,
  PAGE_PRESS,
  sendPagePointer,
} from "../pagePointer";
import { forgetEngineFailure, useFallbackEditor } from "../../engine/engine";
import { spellcheck as spellcheckPlugin } from "./spellcheck";
import {
  contextMenuPlugin,
  openContextMenu,
  openTableMenu,
  prefetch,
  SUGGESTION_WAIT,
} from "./contextMenu";

vi.mock("../../engine/geometry", () => ({ caretBox: vi.fn() }));

const checker = (overrides: Partial<Spellchecker> = {}): Spellchecker => ({
  tag: "en",
  isCorrect: (word) => word !== "wrng",
  check: vi.fn(async () => {}),
  suggest: vi.fn(async () => ["wrong"]),
  userEntry: (word) => (word === "blank" ? "blank" : undefined),
  addWord: vi.fn(),
  removeWord: vi.fn(),
  replaceWord: vi.fn(),
  ...overrides,
});

let view: EditorView;

/**
 * setup renders "blank wrng text" with a flagged "wrng" at 7..11. Clicks on
 * the pages land at the doc position given, and the caret at a position is
 * 10 px per position from the left.
 */
const setup = async (spell = checker(), native = false) => {
  spellchecker.value = spell;
  view = new EditorView(
    document.body.appendChild(document.createElement("div")),
    {
      state: EditorState.create({
        schema,
        doc: doc(p("blank wrng text")),
        plugins: [
          history(),
          ...(native ? [nativePointer()] : []),
          contextMenuPlugin(),
          spellcheckPlugin(),
        ],
      }),
    },
  );
  vi.mocked(caretBox).mockImplementation((pos) => ({
    left: pos * 10,
    right: pos * 10,
    top: 20,
    bottom: 40,
  }));
  await vi.runAllTimersAsync();
  return view;
};

const ids = () =>
  contextMenu.value?.items.map((item: MenuItem) =>
    item === "separator" ? "-" : item.id,
  );

const fire = (type: string, init: MouseEventInit) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  view.dom.dispatchEvent(event);
  return event;
};

// what the page view sends for a press or right click at `pos`, -1 for off
// the text
const pointer = (pos: number, button = 2) => ({
  pos: pos < 0 ? null : pos,
  link: null,
  x: pos,
  y: 5,
  button,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
});

const rightClick = (pos: number) =>
  sendPagePointer(view, PAGE_MENU, pointer(pos));

describe("plugin.contextMenu", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    spellcheck.value = true;
    spellcheckStatus.value = { state: "ready", tag: "en" };
    contextMenu.value = null;
  });

  afterEach(() => {
    contextMenu.value = null;
    view?.destroy();
    spellchecker.value = null;
    spellcheck.value = false;
  });

  it("opens with the suggestions for a misspelled word", async () => {
    await setup();

    expect(rightClick(8)).toBe(true);
    expect(view.state.selection.from).toBe(8);
    // waits for the suggestions, so the items don't move once it's open
    expect(contextMenu.value).toBeNull();

    await vi.advanceTimersByTimeAsync(0);
    expect(contextMenu.value?.anchor).toEqual({ left: 8, top: 5, bottom: 5 });
    expect(contextMenu.value?.keyboard).toBe(false);
    expect(ids()?.slice(0, 2)).toEqual(["suggestion:wrong", "change-all"]);
  });

  it("shows slow suggestions as loading until they arrive", async () => {
    const suggestions = deferred<string[]>();
    await setup(checker({ suggest: vi.fn(() => suggestions.promise) }));

    rightClick(8);
    await vi.advanceTimersByTimeAsync(SUGGESTION_WAIT);
    expect(ids()?.[0]).toBe("loading");

    suggestions.resolve(["wrong"]);
    await vi.advanceTimersByTimeAsync(0);
    expect(ids()?.[0]).toBe("suggestion:wrong");
  });

  it("drops the suggestions of a menu opened before another one", async () => {
    const suggestions = deferred<string[]>();
    await setup(
      checker({
        suggest: vi
          .fn()
          .mockReturnValueOnce(suggestions.promise)
          .mockResolvedValue(["wrung"]),
      }),
    );

    rightClick(8);
    rightClick(9);
    await vi.advanceTimersByTimeAsync(0);
    suggestions.resolve(["wrong"]);
    await vi.runAllTimersAsync();

    expect(ids()?.[0]).toBe("suggestion:wrung");
  });

  it("offers to remove a word of the personal dictionary", async () => {
    await setup();

    rightClick(3);

    expect(ids()?.slice(0, 2)).toEqual(["remove", "edit"]);
  });

  it("offers editing only on other words", async () => {
    await setup();

    rightClick(14);

    expect(ids()?.[0]).toBe("undo");
  });

  it("offers editing only while spell check is off", async () => {
    await setup();
    spellchecker.value = null;

    rightClick(8);

    expect(ids()?.[0]).toBe("undo");
  });

  it("keeps a selection that is clicked into", async () => {
    await setup();
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6)),
    );

    rightClick(3);

    expect(view.state.selection.from).toBe(1);
    expect(view.state.selection.to).toBe(6);
  });

  it("leaves the webview's menu to Shift", async () => {
    await setup();

    const event = fire("contextmenu", { button: 0, shiftKey: true });

    expect(event.defaultPrevented).toBe(false);
    expect(contextMenu.value).toBeNull();
  });

  it("opens nowhere outside the text", async () => {
    await setup();

    expect(rightClick(-1)).toBe(true);
    expect(contextMenu.value).toBeNull();
  });

  it("opens at the cursor for the context menu key", async () => {
    await setup();
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 9)),
    );

    const key = new KeyboardEvent("keydown", {
      key: "ContextMenu",
      bubbles: true,
      cancelable: true,
    });
    view.dom.dispatchEvent(key);
    await vi.advanceTimersByTimeAsync(0);

    expect(key.defaultPrevented).toBe(true);
    expect(contextMenu.value?.keyboard).toBe(true);
    // below the misspelled word at the cursor
    expect(contextMenu.value?.anchor).toEqual({
      left: 70,
      top: 20,
      bottom: 40,
    });

    // the webview's own event for the same key press is ignored
    const first = contextMenu.value;
    fire("contextmenu", { button: 0, clientX: 0, clientY: 0 });
    expect(contextMenu.value).toBe(first);
  });

  it("opens at the cursor for a contextmenu event without a position", async () => {
    await setup();
    vi.setSystemTime(Date.now() + 1000);

    fire("contextmenu", { button: 0, clientX: 0, clientY: 0 });

    expect(contextMenu.value?.keyboard).toBe(true);
  });

  it("prefetches the suggestions on right mouse down", async () => {
    const spell = checker();
    await setup(spell);

    sendPagePointer(view, PAGE_PRESS, pointer(8, 0));
    expect(spell.suggest).not.toHaveBeenCalled();

    sendPagePointer(view, PAGE_PRESS, pointer(8));
    expect(spell.suggest).toHaveBeenCalledWith("wrng");

    sendPagePointer(view, PAGE_PRESS, pointer(-1));
    prefetch(view.state, 3);
    expect(spell.suggest).toHaveBeenCalledTimes(1);
  });

  it("shows no suggestions if looking them up fails", async () => {
    await setup(checker({ suggest: vi.fn(async () => Promise.reject()) }));

    rightClick(8);
    await vi.runAllTimersAsync();

    expect(ids()?.[0]).toBe("none");
  });

  it("stays closed if the suggestions arrive after closing", async () => {
    const suggestions = deferred<string[]>();
    await setup(checker({ suggest: vi.fn(() => suggestions.promise) }));
    const focus = vi.spyOn(view, "focus");

    rightClick(8);
    await vi.advanceTimersByTimeAsync(SUGGESTION_WAIT);
    contextMenu.value!.close();
    suggestions.resolve(["wrong"]);
    await vi.runAllTimersAsync();

    expect(contextMenu.value).toBeNull();
    expect(focus).toHaveBeenCalled();
  });

  it("falls back to the top left corner without coordinates", async () => {
    await setup();
    vi.mocked(caretBox).mockReturnValue(null);

    openContextMenu(view, 3, { keyboard: true });

    expect(contextMenu.value?.anchor).toEqual({ left: 0, top: 0, bottom: 0 });
  });
});

describe("openTableMenu", () => {
  afterEach(() => {
    contextMenu.value = null;
  });

  it("opens the table actions below the anchor, and returns the focus", () => {
    const tableView = new EditorView(document.createElement("div"), {
      state: cursorAt(doc(table(tr(th("a")), tr(td("b"))), p()), "b"),
    });
    const focus = vi.spyOn(tableView, "focus");
    openTableMenu(tableView, { left: 10, top: 20, bottom: 30 });

    const menu = contextMenu.value!;
    expect(menu.anchor).toEqual({ left: 10, top: 20, bottom: 30 });
    expect(menu.keyboard).toBe(false);
    expect(menu.items).toContainEqual(
      expect.objectContaining({ id: "table-row-below" }),
    );

    menu.close();
    expect(contextMenu.value).toBeNull();
    expect(focus).toHaveBeenCalled();
    tableView.destroy();
  });
});

describe("the context menu without the engine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    contextMenu.value = null;
    useFallbackEditor("unavailable");
  });
  afterEach(() => {
    contextMenu.value = null;
    view?.destroy();
    forgetEngineFailure();
  });

  it("moves the selection to a right click and opens there", async () => {
    await setup(checker(), true);
    vi.spyOn(view, "posAtCoords").mockReturnValue({ pos: 13, inside: -1 });

    fire("mousedown", { button: 2, clientX: 130, clientY: 25 });
    fire("contextmenu", { button: 2, clientX: 130, clientY: 25 });

    expect(view.state.selection.head).toBe(13);
    expect(contextMenu.value?.keyboard).toBe(false);
    expect(contextMenu.value?.anchor).toEqual({
      left: 130,
      top: 25,
      bottom: 25,
    });
  });

  it("leaves the ContextMenu key's event to the menu, at the cursor", async () => {
    await setup(checker(), true);

    fire("contextmenu", { button: 0, clientX: 0, clientY: 0 });

    expect(contextMenu.value?.keyboard).toBe(true);
  });

  it("leaves the webview's menu to Shift", async () => {
    await setup(checker(), true);

    const event = fire("contextmenu", {
      button: 2,
      clientX: 130,
      clientY: 25,
      shiftKey: true,
    });

    expect(event.defaultPrevented).toBe(false);
    expect(contextMenu.value).toBeNull();
  });
});
