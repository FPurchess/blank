import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import type { EditorHandle } from "../editor/handle";
import { schema } from "../markdown";
import {
  type MenuItem,
  contextMenu,
  cycleFocus,
  focusStop,
  tablePicker,
  toolbarFocused,
  uiTakesFocus,
} from "../state";
import { createState, createTestHandle, doc, h, p } from "../test/editor";
import { bootApp } from "./mount";

// The formatting toolbar in the top area, FormatToolbar.vue

let dispose = () => {};
let editor: EditorHandle;

const toolbar = () => document.querySelector<HTMLElement>("#format-toolbar")!;
const button = (id: string) =>
  toolbar().querySelector<HTMLButtonElement>(`[data-id="${id}"]`)!;
const menuButton = (label: string) =>
  [...toolbar().querySelectorAll<HTMLButtonElement>("[aria-haspopup]")].find(
    (element) => element.dataset.tip === label,
  )!;
const press = (element: HTMLElement) => {
  const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
  element.dispatchEvent(down);
  element.click();
  return down.defaultPrevented;
};
const key = (name: string) => {
  const event = new KeyboardEvent("keydown", {
    key: name,
    bubbles: true,
    cancelable: true,
  });
  (document.activeElement ?? document.body).dispatchEvent(event);
  return event;
};

const mount = async (
  node = doc(p("some text")),
  cursor: [number, number] = [1, 5],
) => {
  editor = createTestHandle(createState(node, { cursor }));
  dispose = bootApp(editor);
  await nextTick();
};

describe("the formatting toolbar", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });
  afterEach(() => {
    dispose();
    contextMenu.value = null;
    tablePicker.value = null;
    toolbarFocused.value = false;
  });

  it("is a toolbar of the formatting buttons, with tooltips naming their keys", async () => {
    await mount();
    expect(toolbar().getAttribute("role")).toBe("toolbar");
    expect(toolbar().getAttribute("aria-label")).toBe("Formatting");
    const bold = button("format.bold");
    expect(bold.dataset.tip).toBe("Bold");
    expect(bold.dataset.tipKey).toBe("Ctrl+B");
    expect(bold.getAttribute("aria-keyshortcuts")).toBe("Control+B");
    expect(bold.getAttribute("aria-pressed")).toBe("false");
    // undo has nothing to undo
    expect(button("undo").getAttribute("aria-disabled")).toBe("true");
  });

  it("formats the selection on a click, which leaves the selection and the focus", async () => {
    await mount();
    const focus = vi.spyOn(editor.view, "focus");
    const selection = editor.view.state.selection;
    expect(press(button("format.bold"))).toBe(true);
    const text = editor.view.state.doc.firstChild!.firstChild!;
    expect(schema.marks.strong.isInSet(text.marks)).toBeTruthy();
    expect(editor.view.state.selection.eq(selection)).toBe(true);
    expect(focus).toHaveBeenCalled();
    // as the editor's sync plugin does after a transaction
    (editor.state as { value: unknown }).value = editor.view.state;
    await nextTick();
    expect(button("format.bold").getAttribute("aria-pressed")).toBe("true");
  });

  it("shows the style of the selection, and opens its menu", async () => {
    await mount(doc(h(2, "Title")), [2, 4]);
    const style = menuButton("Text style");
    expect(style.textContent?.trim()).toBe("Heading 2");
    press(style);
    expect(contextMenu.value?.items.length).toBe(10);
    expect(contextMenu.value?.keyboard).toBe(false);
    await nextTick();
    expect(style.getAttribute("aria-expanded")).toBe("true");
  });

  it("takes the focus from Alt-F10, moves with the arrows and gives it back on Escape", async () => {
    await mount();
    const focus = vi.spyOn(editor.view, "focus");
    focusStop("toolbar");
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(button("undo"));
    expect(toolbarFocused.value).toBe(true);
    expect(uiTakesFocus.value).toBe(true);

    key("ArrowRight");
    expect(document.activeElement).toBe(button("redo"));
    key("ArrowRight");
    expect(document.activeElement).toBe(menuButton("Text style"));
    // one tab stop: the focused control
    await nextTick();
    expect([...toolbar().querySelectorAll('[tabindex="0"]')]).toEqual([
      menuButton("Text style"),
    ]);

    // a button pressed from the keyboard keeps the toolbar's focus
    key("ArrowRight");
    button("format.bold").focus();
    focus.mockClear();
    button("format.bold").click();
    expect(focus).not.toHaveBeenCalled();

    key("Escape");
    expect(focus).toHaveBeenCalled();
  });

  it("is the stop F6 comes to after the tab row", async () => {
    await mount();
    // backwards from the text, the last part of the window
    cycleFocus(-1, null, () => {});
    await nextTick();
    expect(toolbar().contains(document.activeElement)).toBe(true);
  });

  it("opens Insert from the keyboard, whose table picker opens below it with the focus in the text", async () => {
    await mount(doc(p("text")), [5, 5]);
    const focus = vi.spyOn(editor.view, "focus");
    const insert = menuButton("Insert");
    insert.focus();
    key("ArrowDown");
    expect(contextMenu.value?.keyboard).toBe(true);
    const table = contextMenu.value!.items.find(
      (item) => item !== "separator" && item.id === "insert.table",
    ) as Exclude<MenuItem, "separator">;
    contextMenu.value!.close();
    table.run!();
    expect(tablePicker.value).not.toBeNull();
    expect(tablePicker.value!.anchor.top).toBe(
      insert.getBoundingClientRect().bottom,
    );
    expect(focus).toHaveBeenCalled();
  });
});
