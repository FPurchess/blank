import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import {
  tableToolbar,
  type TableToolbarItem,
  type TableToolbarState,
} from "../state";
import { createTestHandle } from "../test/editor";
import { bootApp } from "./mount";
import { itemLabel } from "./tableToolbarModel";

vi.mock("./tableToolbarModel", async (original) => {
  const module = await original<typeof import("./tableToolbarModel")>();
  return { ...module, itemLabel: vi.fn(module.itemLabel) };
});

const item = (
  id: string,
  extra: Partial<TableToolbarItem> = {},
): TableToolbarItem => ({
  id,
  label: `Label ${id}`,
  icon: "sort",
  key: id.toUpperCase(),
  group: "a",
  enabled: true,
  run: vi.fn(),
  ...extra,
});

/**
 * show publishes a toolbar state, as the table tools plugin does, and waits
 * until Vue has rendered it
 */
const show = async (
  extra: Partial<TableToolbarState> = {},
): Promise<TableToolbarState> => {
  const state: TableToolbarState = {
    anchor: { left: 100, top: 300, bottom: 500, right: 600 },
    items: [
      item("x"),
      item("y", { checked: true }),
      item("z", { group: "b", enabled: false }),
    ],
    keys: false,
    caption: null,
    ...extra,
  };
  tableToolbar.value = state;
  await nextTick();
  return state;
};

const toolbar = () => document.getElementById("table-toolbar")!;
const button = (id: string) =>
  toolbar().querySelector<HTMLButtonElement>(`button[data-id="${id}"]`)!;

describe("table toolbar", () => {
  let dispose = () => {};

  beforeEach(() => {
    dispose = bootApp(createTestHandle());
  });

  afterEach(() => {
    tableToolbar.value = null;
    dispose();
  });

  it("shows a labelled button with an icon for each item, in groups", async () => {
    await show();

    expect(toolbar().getAttribute("role")).toBe("toolbar");
    expect(toolbar().getAttribute("aria-label")).toBe("Table");
    expect(
      [...toolbar().querySelectorAll(".buttons > *")].map((e) => e.tagName),
    ).toEqual(["BUTTON", "BUTTON", "SPAN", "BUTTON"]);
    expect(toolbar().querySelector(".separator")!.getAttribute("role")).toBe(
      "separator",
    );
    expect(button("x").getAttribute("aria-label")).toBe("Label x");
    // the shared tooltip names it (src/ui/tooltipModel.ts)
    expect(button("x").dataset.tip).toBe("Label x");
    expect(button("x").hasAttribute("title")).toBe(false);
    expect(button("x").type).toBe("button");
    expect(
      button("x").querySelector("svg.icon path")!.getAttribute("d"),
    ).not.toBe("");
    expect(button("y").getAttribute("aria-pressed")).toBe("true");
    expect(button("x").hasAttribute("aria-pressed")).toBe(false);
    expect(button("x").getAttribute("aria-disabled")).toBe("false");
    expect(button("z").getAttribute("aria-disabled")).toBe("true");
  });

  it("never takes the focus from the editor", async () => {
    await show();
    const down = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    button("x").dispatchEvent(down);
    const onHint = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    toolbar().querySelector(".hint")!.dispatchEvent(onHint);

    expect(button("x").tabIndex).toBe(-1);
    expect(down.defaultPrevented).toBe(true);
    expect(onHint.defaultPrevented).toBe(true);
  });

  it("runs an enabled item when its button is clicked", async () => {
    const state = await show();
    button("x").click();
    button("z").click();

    expect(state.items[0].run).toHaveBeenCalledOnce();
    expect(state.items[2].run).not.toHaveBeenCalled();
  });

  it("can be closed by the item its button runs", async () => {
    await show({
      items: [
        item("delete", {
          run: () => {
            tableToolbar.value = null;
          },
        }),
      ],
    });
    button("delete").click();
    await nextTick();

    expect(document.getElementById("table-toolbar")).toBeNull();
  });

  it("updates in place instead of rendering again", async () => {
    await show();
    const first = toolbar();
    const x = button("x");
    await show({
      items: [
        item("x", { enabled: false }),
        item("y"),
        item("z", { group: "b" }),
      ],
    });

    expect(toolbar()).toBe(first);
    expect(button("x")).toBe(x);
    expect(x.getAttribute("aria-disabled")).toBe("true");
    expect(button("y").hasAttribute("aria-pressed")).toBe(false);
  });

  it("doesn't update its buttons when only the position changes", async () => {
    const state = await show();
    vi.mocked(itemLabel).mockClear();
    await show({ items: state.items, anchor: { ...state.anchor, top: 200 } });

    expect(toolbar().style.top).toBe("190px");
    expect(itemLabel).not.toHaveBeenCalled();
  });

  it("shows the keys and a hint in table mode", async () => {
    await show({ keys: true });

    expect(toolbar().classList.contains("keys")).toBe(true);
    expect(toolbar().classList.contains("table-toolbar")).toBe(true);
    expect(button("x").querySelector("kbd")!.textContent).toBe("X");
    expect(button("x").getAttribute("aria-label")).toBe("Label x (X)");
    // its tooltip shows the key too, which only table mode has
    expect(button("x").dataset.tipKey).toBe("X");
    expect(toolbar().querySelector(".hint")!.textContent).toBe(
      "Shift+arrows move rows and columns · Esc or Ctrl+T: done",
    );

    await show({ keys: false });
    expect(toolbar().classList.contains("keys")).toBe(false);
    expect(button("x").hasAttribute("data-tip-key")).toBe(false);
  });

  it("sits above the table and hides while the table is out of view", async () => {
    await show();
    // at the table's right end: jsdom measures the toolbar 0 wide
    expect(toolbar().style.left).toBe("600px");
    expect(toolbar().style.top).toBe(`${300 - 10}px`);
    expect(toolbar().hidden).toBe(false);

    await show({ anchor: { left: 100, top: -500, bottom: 10, right: 600 } });
    expect(toolbar().hidden).toBe(true);

    await show();
    expect(toolbar().hidden).toBe(false);
  });

  it("places itself after table mode has changed its width", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const width = this.classList.contains("keys") ? 300 : 100;
        return { width, height: 20 } as DOMRect;
      },
    );
    await show();
    expect(toolbar().style.left).toBe("500px");

    await show({ keys: true });
    expect(toolbar().style.left).toBe("300px");
  });

  it("opens the caption field, which submits with Enter and cancels with Esc", async () => {
    const submit = vi.fn();
    const cancel = vi.fn();
    await show({ caption: { value: "Old", submit, cancel } });
    const input = toolbar().querySelector<HTMLInputElement>(".caption input")!;

    expect(input.value).toBe("Old");
    expect(input.getAttribute("aria-label")).toBe("Caption of the table");
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(3);
    // a press in the field places its cursor as usual
    const down = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(false);
    input.value = "New";
    input.form!.requestSubmit();
    expect(submit).toHaveBeenCalledWith("New");

    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      cancelable: true,
    });
    input.dispatchEvent(escape);
    expect(cancel).toHaveBeenCalled();
    expect(escape.defaultPrevented).toBe(true);

    await show();
    expect(toolbar().querySelector(".caption")).toBeNull();
  });

  it("keeps what was typed into the caption field while the toolbar updates", async () => {
    const caption = { value: "Old", submit: vi.fn(), cancel: vi.fn() };
    await show({ caption });
    const input = toolbar().querySelector<HTMLInputElement>(".caption input")!;
    input.value = "Typed";

    // e.g. scrolling publishes the toolbar again
    await show({ caption: { ...caption } });

    expect(toolbar().querySelector(".caption input")).toBe(input);
    expect(input.value).toBe("Typed");
    expect(document.activeElement).toBe(input);
  });

  it("is removed when the cursor leaves the table", async () => {
    await show();
    tableToolbar.value = null;
    await nextTick();

    expect(document.getElementById("table-toolbar")).toBeNull();
  });

  it("stops rendering once disposed", async () => {
    await show();
    const element = toolbar();
    dispose();
    dispose = () => {};
    await show({ keys: true });

    expect(element.classList.contains("keys")).toBe(false);
    expect(document.getElementById("table-toolbar")).toBeNull();
  });

  it("goes away with the app once disposed", async () => {
    await show();
    dispose();
    dispose = () => {};

    expect(document.getElementById("table-toolbar")).toBeNull();
    expect(document.getElementById("ui-app")).toBeNull();
  });
});
