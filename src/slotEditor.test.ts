import { afterEach, describe, expect, it, vi } from "vitest";
import { TextSelection } from "prosemirror-state";

import { CommandIdentifier, config } from "./config";
import {
  chip,
  createSlotEditor,
  type SlotEditor,
  slotText,
} from "./slotEditor";

let editor: SlotEditor | undefined;

const keys = () => ({
  next: vi.fn(() => true),
  previous: vi.fn(() => true),
  done: vi.fn(() => true),
});

const mount = (text: string, handlers = keys()) => {
  const place = document.createElement("div");
  document.body.append(place);
  editor = createSlotEditor(place, text, handlers, "Footer, left");
  return { editor, place, handlers };
};

const press = (key: string, shiftKey = false) =>
  editor!.view.someProp("handleKeyDown", (f) =>
    f(editor!.view, new KeyboardEvent("keydown", { key, shiftKey })),
  );

const atEnd = () =>
  editor!.view.dispatch(
    editor!.view.state.tr.setSelection(
      TextSelection.atEnd(editor!.view.state.doc),
    ),
  );

describe("slot editor", () => {
  afterEach(() => {
    editor?.destroy();
    editor = undefined;
    document.body.innerHTML = "";
  });

  it("shows placeholders as chips and writes them back", () => {
    const { place } = mount("Page {page} of {pages}, {{x}");

    expect(
      [...place.querySelectorAll(".chip")].map((c) => c.textContent),
    ).toEqual(["Page", "Pages"]);
    expect(editor!.text()).toBe("Page {page} of {pages}, {{x}");
  });

  it("is a text box named for screen readers", () => {
    mount("");
    expect(editor!.view.dom.getAttribute("role")).toBe("textbox");
    expect(editor!.view.dom.getAttribute("aria-label")).toBe("Footer, left");
  });

  it("marks an empty slot for its placeholder", () => {
    const { place } = mount("");
    expect(place.dataset.empty).toBe("true");

    editor!.view.dispatch(editor!.view.state.tr.insertText("x"));
    expect(place.dataset.empty).toBe("false");
  });

  it("inserts a chip at the cursor, with a space after a word", () => {
    mount("draft");
    atEnd();

    editor!.insert("Page {page}");

    expect(editor!.text()).toBe("draft Page {page}");
  });

  it("inserts into an empty slot as it is", () => {
    mount("");
    editor!.insert("{title}");
    expect(editor!.text()).toBe("{title}");
  });

  it("keeps a pasted text on one line", () => {
    mount("");
    const clipboardData = { getData: () => "one\n  two\nthree" };
    const event = Object.assign(new Event("paste", { cancelable: true }), {
      clipboardData,
    });

    editor!.view.someProp("handlePaste", (f) =>
      f(
        editor!.view,
        event as unknown as ClipboardEvent,
        editor!.view.state.doc.slice(0),
      ),
    );

    expect(editor!.text()).toBe("one two three");
  });

  it("hands Tab, Shift+Tab, Enter and Escape to the strip", () => {
    const { handlers } = mount("x");

    press("Tab");
    press("Tab", true);
    press("Enter");
    press("Escape");

    expect(handlers.next).toHaveBeenCalledTimes(1);
    expect(handlers.previous).toHaveBeenCalledTimes(1);
    expect(handlers.done).toHaveBeenCalledTimes(2);
  });

  it("undoes what was typed", () => {
    mount("a");
    atEnd();
    editor!.view.dispatch(editor!.view.state.tr.insertText("b"));

    press("z");
    editor!.view.someProp("handleKeyDown", (f) =>
      f(
        editor!.view,
        new KeyboardEvent("keydown", { key: "z", ctrlKey: true }),
      ),
    );

    expect(editor!.text()).toBe("a");
  });
});

describe("undo and redo in a slot", () => {
  const original = config.value;
  afterEach(() => {
    config.value = original;
    editor?.destroy();
    editor = undefined;
    document.body.innerHTML = "";
  });

  const ctrl = (key: string, shiftKey = false) =>
    editor!.view.someProp("handleKeyDown", (f) =>
      f(
        editor!.view,
        new KeyboardEvent("keydown", { key, ctrlKey: true, shiftKey }),
      ),
    );

  it("follow the keys the keymap gives them, also once it changed", () => {
    mount("a");
    atEnd();
    editor!.view.dispatch(editor!.view.state.tr.insertText("b"));
    config.value = {
      ...original,
      keymap: {
        ...original.keymap,
        [CommandIdentifier.UNDO]: "Mod-u",
        [CommandIdentifier.REDO]: "Mod-r",
      },
    };

    // the old key does nothing any more
    ctrl("z");
    expect(editor!.text()).toBe("ab");
    ctrl("u");
    expect(editor!.text()).toBe("a");
    ctrl("r");
    expect(editor!.text()).toBe("ab");
  });
});

describe("slotText", () => {
  it("trims the text", () => {
    mount("  x  ");
    expect(slotText(editor!.view.state.doc)).toBe("x");
  });
});

describe("chip", () => {
  it("shows a placeholder's name and reads as its longer one", () => {
    const page = chip("page");
    expect(page.textContent).toBe("Page");
    expect(page.dataset.field).toBe("page");
    expect(page.getAttribute("role")).toBe("img");
    expect(page.getAttribute("aria-label")).toBe("Page number");
    expect(page.hasAttribute("title")).toBe(false);
    expect(chip("title").textContent).toBe("Title");
    expect(chip("file").getAttribute("aria-label")).toBe("File name");
  });
});
