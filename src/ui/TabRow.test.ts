import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import * as commands from "../editor/commands";
import * as tabActions from "../editor/tabs";
import {
  activeTabId,
  blocksPaneOpen,
  contextMenu,
  cycleFocus,
  type Tab,
  tabRowFocused,
  tabs,
  unsavedDialog,
} from "../state";
import { createTestHandle } from "../test/editor";
import { bootApp } from "./mount";

const tab = (id: string, change: Partial<Tab> = {}): Tab => ({
  id,
  path: `/docs/${id}.md`,
  importedFrom: null,
  untitledNumber: null,
  unsaved: false,
  viewAnchor: null,
  ...change,
});

let dispose = () => {};
let handle: ReturnType<typeof createTestHandle>;

const tabElement = (id: string) =>
  document.querySelector<HTMLElement>(`#tab-${id}`)!;
const labels = () =>
  [...document.querySelectorAll(".tab-label")].map((label) =>
    label.textContent?.trim(),
  );

/**
 * spy replaces the command `name` with one that only notes what it was asked
 */
const closing = () => vi.spyOn(tabActions, "closeTabs").mockResolvedValue();

const spy = <K extends keyof typeof commands>(name: K) => {
  const run = vi.fn();
  vi.spyOn(commands, name).mockImplementation(((...args: unknown[]) => {
    return () => {
      run(...args);
      return true;
    };
  }) as never);
  return run;
};

beforeEach(async () => {
  document.body.innerHTML = "";
  tabs.value = [
    tab("a"),
    tab("b", { unsaved: true }),
    tab("c", { path: null, untitledNumber: 2 }),
  ];
  activeTabId.value = "a";
  handle = createTestHandle();
  dispose = bootApp(handle);
  await nextTick();
});

afterEach(() => {
  dispose();
  tabs.value = [];
  activeTabId.value = null;
  contextMenu.value = null;
  unsavedDialog.value = null;
  blocksPaneOpen.value = false;
});

describe("the tab row", () => {
  it("is a list of tabs named Documents, one selected", () => {
    const list = document.querySelector("[role=tablist]")!;
    expect(list.getAttribute("aria-label")).toBe("Documents");
    expect(labels()).toEqual(["a", "b", "Untitled 2"]);
    expect(tabElement("a").getAttribute("aria-selected")).toBe("true");
    expect(tabElement("b").getAttribute("aria-selected")).toBe("false");
  });

  it("puts only the selected tab in the tab order", () => {
    expect(tabElement("a").tabIndex).toBe(0);
    expect(tabElement("b").tabIndex).toBe(-1);
  });

  it("tells where each document is, and marks the unsaved ones", () => {
    expect(tabElement("a").dataset.tip).toBe("/docs/a.md");
    expect(tabElement("c").dataset.tip).toBe("Not saved yet");
    expect(tabElement("b").classList).toContain("unsaved");
    expect(
      tabElement("a").querySelector(".tab-close")!.getAttribute("aria-hidden"),
    ).toBe("true");
  });

  it("shows a tab on a click, and closes one on its ×", () => {
    const select = spy("selectTab");
    const close = closing();

    tabElement("b").querySelector<HTMLElement>(".tab-label")!.click();
    tabElement("c").querySelector<HTMLElement>(".tab-close")!.click();

    expect(select).toHaveBeenCalledWith("b");
    expect(close).toHaveBeenCalledWith(["c"]);
  });

  it("closes one tab for a quick double click on ×, and opens none", () => {
    const close = closing();
    const create = spy("newFile");
    const closeMark = tabElement("c").querySelector<HTMLElement>(".tab-close")!;

    closeMark.click();
    closeMark.click();
    document
      .querySelector(".tab-row-spare")!
      .dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

    expect(close).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
  });

  it("closes a tab on a middle click let go on it", () => {
    const close = closing();
    const middle = (type: string, id: string) =>
      tabElement(id).dispatchEvent(
        new MouseEvent(type, { button: 1, bubbles: true }),
      );
    const down = (id: string) =>
      tabElement(id).dispatchEvent(
        new PointerEvent("pointerdown", { button: 1, bubbles: true }),
      );

    down("a");
    middle("mouseup", "b");
    expect(close).not.toHaveBeenCalled();

    down("b");
    middle("mouseup", "b");
    expect(close).toHaveBeenCalledWith(["b"]);
  });

  it("opens a new tab with + and a double click on its empty part", () => {
    // + runs New document, the command, whose work is opening a tab
    const create = vi
      .spyOn(tabActions, "openNewTab")
      .mockResolvedValue(undefined as never);

    document.querySelector<HTMLElement>(".tab-row-new")!.click();
    document
      .querySelector(".tab-row-spare")!
      .dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    tabElement("a").dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true }),
    );

    expect(create).toHaveBeenCalledTimes(2);
  });

  it("shows a name with markup as text, and says a tab is unsaved", async () => {
    tabs.value = [tab("a", { path: "/tmp/<img src=x>.md", unsaved: true })];
    await nextTick();

    expect(labels()).toEqual(["<img src=x>"]);
    expect(tabElement("a").querySelector(".tab-label")!.children).toHaveLength(
      0,
    );
    expect(tabElement("a").textContent).toContain(", unsaved changes");
  });

  it("follows the tabs as they change", async () => {
    tabs.value = [tab("a", { unsaved: true }), tab("d")];
    activeTabId.value = "d";
    await nextTick();

    expect(labels()).toEqual(["a", "d"]);
    expect(tabElement("a").classList).toContain("unsaved");
    expect(tabElement("d").getAttribute("aria-selected")).toBe("true");
  });

  it("names the keys only in the shown tab's menu", () => {
    tabElement("b").dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
    );

    const items = contextMenu.value!.items.filter(
      (item) => item !== "separator",
    );
    expect(items.every((item) => item.shortcut === undefined)).toBe(true);
    expect(contextMenu.value?.owner).toBeUndefined();
  });

  it("opens a tab's menu on a right click", () => {
    tabElement("a").dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 30,
        clientY: 20,
      }),
    );

    expect(contextMenu.value?.anchor).toMatchObject({ left: 30, top: 20 });
    expect(contextMenu.value?.keyboard).toBe(false);
    expect(
      contextMenu.value?.items.map((item) =>
        item === "separator" ? "-" : item.label,
      ),
    ).toEqual([
      "Close",
      "Close others",
      "Close to the right",
      "-",
      "Save",
      "Save as…",
      "Print…",
      "-",
      "Copy path",
    ]);
  });
});

describe("the tab row's keys", () => {
  const press = (id: string, key: string, shiftKey = false) =>
    tabElement(id).dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        shiftKey,
        bubbles: true,
        cancelable: true,
      }),
    );

  it("is where F6 goes from the text, then the toolbar, and back", async () => {
    const focus = vi.spyOn(handle.view, "focus");

    cycleFocus(1, null, () => handle.focus());
    await nextTick();
    expect(document.activeElement).toBe(tabElement("a"));
    expect(tabRowFocused.value).toBe(true);

    cycleFocus(1, document.activeElement, () => handle.focus());
    expect(
      document
        .querySelector("#format-toolbar")!
        .contains(document.activeElement),
    ).toBe(true);
    expect(tabRowFocused.value).toBe(false);

    cycleFocus(1, document.activeElement, () => handle.focus());
    expect(focus).toHaveBeenCalled();
  });

  it("moves the focus with the arrows, and shows the tab with Enter", async () => {
    const select = spy("selectTab");
    tabElement("a").focus();

    press("a", "ArrowRight");
    await nextTick();
    expect(document.activeElement).toBe(tabElement("b"));
    expect(tabElement("b").tabIndex).toBe(0);

    press("b", "Enter");
    expect(select).toHaveBeenCalledWith("b");
  });

  it("closes with Delete, opens the menu with Shift+F10 and leaves with Esc", async () => {
    const close = closing();
    const focus = vi.spyOn(handle.view, "focus");
    tabElement("a").focus();

    press("a", "Delete");
    expect(close).toHaveBeenCalledWith(["a"]);

    press("a", "F10", true);
    expect(contextMenu.value?.keyboard).toBe(true);
    // closed, a menu opened from the keyboard gives its tab the focus back
    focus.mockClear();
    contextMenu.value!.close();
    await nextTick();
    expect(document.activeElement).toBe(tabElement("a"));
    expect(focus).not.toHaveBeenCalled();

    press("a", "Escape");
    expect(focus).toHaveBeenCalled();
  });

  it("keeps the focus in the row after Delete closed the focused tab", async () => {
    vi.spyOn(tabActions, "closeTabs").mockImplementation(async () => {
      tabs.value = tabs.value.slice(1);
      activeTabId.value = "b";
    });
    tabElement("a").focus();

    press("a", "Delete");
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(tabElement("b")),
    );
  });

  it("leaves arrows with Ctrl to the window's commands", () => {
    tabElement("a").focus();
    const event = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });

    tabElement("a").dispatchEvent(event);

    expect(document.activeElement).toBe(tabElement("a"));
  });

  it("reorders the tabs by dragging one", () => {
    const move = vi.spyOn(tabActions, "moveTab").mockResolvedValue();
    const box = (left: number) =>
      ({ left, right: left + 100, top: 0, bottom: 30 }) as DOMRect;
    ["a", "b", "c"].forEach((id, i) =>
      vi
        .spyOn(tabElement(id), "getBoundingClientRect")
        .mockReturnValue(box(i * 100)),
    );
    const pointer = (type: string, clientX: number, buttons = 1) =>
      tabElement("a").dispatchEvent(
        new PointerEvent(type, { clientX, buttons, button: 0, bubbles: true }),
      );

    pointer("pointerdown", 50);
    pointer("pointermove", 180);
    pointer("pointerup", 180, 0);
    tabElement("a").click();

    expect(move).toHaveBeenCalledWith("a", 1);
  });

  it("runs the window's commands while the focus is in it", () => {
    const create = vi.spyOn(tabActions, "openNewTab").mockResolvedValue();
    tabElement("a").focus();

    tabElement("a").dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "n",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(create).toHaveBeenCalled();
  });
});

describe("the Blocks button", () => {
  const button = () =>
    document.querySelector<HTMLButtonElement>(".tab-row-blocks")!;

  it("is named Blocks, its tooltip the command's", () => {
    expect(button().getAttribute("aria-label")).toBe("Blocks");
    expect(button().dataset.tip).toBe("Insert a block");
    expect(button().getAttribute("aria-pressed")).toBe("false");
    expect(button().textContent?.trim()).toBe("Blocks");
  });

  it("opens the pane, and hides it again", async () => {
    button().click();
    expect(blocksPaneOpen.value).toBe(true);
    await nextTick();
    expect(button().getAttribute("aria-pressed")).toBe("true");

    button().click();
    expect(blocksPaneOpen.value).toBe(false);
  });
});
