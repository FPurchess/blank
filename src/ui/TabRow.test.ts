import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import * as commands from "../editor/commands";
import * as contentBlocks from "../editor/commands/contentBlocks";
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
    const close = spy("closeTab");

    tabElement("b").querySelector<HTMLElement>(".tab-label")!.click();
    tabElement("c").querySelector<HTMLElement>(".tab-close")!.click();

    expect(select).toHaveBeenCalledWith("b");
    expect(close).toHaveBeenCalledWith("c");
  });

  it("closes a tab on a middle click let go on it", () => {
    const close = spy("closeTab");
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
    expect(close).toHaveBeenCalledWith("b");
  });

  it("opens a new tab with + and a double click on its empty part", () => {
    const create = spy("newFile");

    document.querySelector<HTMLElement>(".tab-row-new")!.click();
    document
      .querySelector(".tab-row-spare")!
      .dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    tabElement("a").dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true }),
    );

    expect(create).toHaveBeenCalledTimes(2);
  });

  it("follows the tabs as they change", async () => {
    tabs.value = [tab("a", { unsaved: true }), tab("d")];
    activeTabId.value = "d";
    await nextTick();

    expect(labels()).toEqual(["a", "d"]);
    expect(tabElement("a").classList).toContain("unsaved");
    expect(tabElement("d").getAttribute("aria-selected")).toBe("true");
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

  it("is where F6 goes from the text, and back", async () => {
    const focus = vi.spyOn(handle.view, "focus");

    cycleFocus(1, null, () => handle.focus());
    await nextTick();
    expect(document.activeElement).toBe(tabElement("a"));
    expect(tabRowFocused.value).toBe(true);

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

  it("closes with Delete, opens the menu with Shift+F10 and leaves with Esc", () => {
    const close = spy("closeTab");
    const focus = vi.spyOn(handle.view, "focus");
    tabElement("a").focus();

    press("a", "Delete");
    expect(close).toHaveBeenCalledWith("a");

    press("a", "F10", true);
    expect(contextMenu.value?.keyboard).toBe(true);
    contextMenu.value = null;

    press("a", "Escape");
    expect(focus).toHaveBeenCalled();
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
    const hide = vi
      .spyOn(contentBlocks, "hideBlocksPane")
      .mockImplementation(() => (blocksPaneOpen.value = false) as never);

    button().click();
    expect(blocksPaneOpen.value).toBe(true);
    await nextTick();
    expect(button().getAttribute("aria-pressed")).toBe("true");

    button().click();
    expect(hide).toHaveBeenCalled();
  });
});
