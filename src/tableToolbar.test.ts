import { afterEach, describe, expect, it, vi } from "vitest";

import {
  tableToolbar,
  type TableToolbarItem,
  type TableToolbarState,
} from "./state";
import { bootTableToolbar } from "./tableToolbar";

const item = (id: string, extra: Partial<TableToolbarItem> = {}) => ({
  id,
  label: `Label ${id}`,
  icon: "sort",
  key: id.toUpperCase(),
  group: "a",
  enabled: true,
  run: vi.fn(),
  ...extra,
});

const show = (extra: Partial<TableToolbarState> = {}): TableToolbarState => {
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
  return state;
};

const toolbar = () => document.getElementById("table-toolbar")!;
const button = (id: string) =>
  toolbar().querySelector<HTMLButtonElement>(`button[data-id="${id}"]`)!;

describe("table toolbar", () => {
  let dispose = bootTableToolbar();

  afterEach(() => {
    tableToolbar.value = null;
  });

  it("removes the toolbar and stops rendering when disposed", () => {
    show();
    dispose();

    expect(document.getElementById("table-toolbar")).toBeNull();
    show();
    expect(document.getElementById("table-toolbar")).toBeNull();
    tableToolbar.value = null;
    dispose = bootTableToolbar();
  });

  it("shows a labelled button with an icon for each item, in groups", () => {
    show();

    expect(toolbar().getAttribute("role")).toBe("toolbar");
    expect(
      [...toolbar().querySelectorAll(".buttons > *")].map((e) => e.tagName),
    ).toEqual(["BUTTON", "BUTTON", "SPAN", "BUTTON"]);
    expect(button("x").getAttribute("aria-label")).toBe("Label x");
    expect(button("x").querySelector("svg.icon")).not.toBeNull();
    expect(button("y").getAttribute("aria-pressed")).toBe("true");
    expect(button("x").hasAttribute("aria-pressed")).toBe(false);
    expect(button("z").getAttribute("aria-disabled")).toBe("true");
  });

  it("runs an enabled item when its button is clicked, keeping the focus", () => {
    const state = show();
    const down = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    button("x").dispatchEvent(down);
    button("x").click();
    button("z").click();

    expect(down.defaultPrevented).toBe(true);
    expect(state.items[0].run).toHaveBeenCalled();
    expect(state.items[2].run).not.toHaveBeenCalled();
  });

  it("updates in place instead of rendering again", () => {
    show();
    const first = toolbar();
    const x = button("x");
    show({
      items: [
        item("x", { enabled: false }),
        item("y"),
        item("z", { group: "b" }),
      ],
    });

    expect(toolbar()).toBe(first);
    expect(button("x")).toBe(x);
    expect(x.getAttribute("aria-disabled")).toBe("true");
  });

  it("shows the keys and a hint in table mode", () => {
    show({ keys: true });

    expect(toolbar().classList.contains("keys")).toBe(true);
    expect(button("x").querySelector("kbd")!.textContent).toBe("X");
    expect(button("x").getAttribute("aria-label")).toBe("Label x (X)");
    expect(toolbar().querySelector(".hint")!.textContent).toContain("Esc");
  });

  it("sits above the table and hides while the table is out of view", () => {
    show();
    // at the table's right end: jsdom measures the toolbar 0 wide
    expect(toolbar().style.left).toBe("600px");
    expect(toolbar().hidden).toBe(false);

    show({ anchor: { left: 100, top: -500, bottom: 10, right: 600 } });
    expect(toolbar().hidden).toBe(true);
  });

  it("opens the caption field, which submits with Enter and cancels with Esc", () => {
    const submit = vi.fn();
    const cancel = vi.fn();
    show({ caption: { value: "Old", submit, cancel } });
    const input = toolbar().querySelector<HTMLInputElement>(".caption input")!;

    expect(input.value).toBe("Old");
    expect(document.activeElement).toBe(input);
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

    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", cancelable: true }),
    );
    expect(cancel).toHaveBeenCalled();

    show();
    expect(toolbar().querySelector(".caption")).toBeNull();
  });

  it("is removed when the cursor leaves the table", () => {
    show();
    tableToolbar.value = null;

    expect(document.getElementById("table-toolbar")).toBeNull();
  });
});
