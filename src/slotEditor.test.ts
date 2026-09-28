import { afterEach, describe, expect, it, vi } from "vitest";
import { TextSelection } from "prosemirror-state";

import {
  chip,
  createSlotEditor,
  renderSlot,
  type SlotEditor,
  slotText,
} from "./slotEditor";

const fields = {
  title: "The Lighthouse",
  author: "",
  date: "27 September 2026",
  file: "",
};

let editor: SlotEditor | undefined;

const keys = () => ({
  next: vi.fn(() => true),
  previous: vi.fn(() => true),
  done: vi.fn(() => true),
});

const mount = (text: string, handlers = keys()) => {
  const place = document.createElement("div");
  document.body.append(place);
  editor = createSlotEditor(place, text, fields, handlers);
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
    ).toEqual(["page", "pages"]);
    expect(editor!.text()).toBe("Page {page} of {pages}, {{x}");
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

describe("slotText", () => {
  it("trims the text", () => {
    mount("  x  ");
    expect(slotText(editor!.view.state.doc)).toBe("x");
  });
});

describe("renderSlot and chip", () => {
  it("writes the title and author as text, the page numbers as chips", () => {
    const element = document.createElement("span");
    renderSlot(element, "{title} {author}· {page}", fields);

    expect(element.textContent).toBe("The Lighthouse · page");
    expect(element.querySelectorAll(".chip")).toHaveLength(1);
  });

  it("writes the date and file as text, the chapter as a chip", () => {
    const element = document.createElement("span");
    renderSlot(element, "{date}, {file}, {chapter}", fields);

    expect(element.textContent).toBe("27 September 2026, , chapter");
    expect(element.querySelectorAll(".chip")).toHaveLength(1);
  });

  it("names chips and falls back to their name without a value", () => {
    expect(chip("author", fields).textContent).toBe("Author");
    expect(chip("pages", fields).title).toBe("Number of pages");
  });
});
