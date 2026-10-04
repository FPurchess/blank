import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { tableToolbar, type TableToolbarState } from "../state";
import { createTestHandle } from "../test/editor";
import { bootApp } from "./mount";
import { TIP_DELAY } from "./tooltipModel";

const toolbar = (keys: boolean): TableToolbarState => ({
  anchor: { left: 100, top: 300, bottom: 500, right: 600 },
  items: [
    {
      id: "sort",
      label: "Sort by this column",
      icon: "sort",
      key: "S",
      group: "a",
      enabled: true,
      run: vi.fn(),
    },
  ],
  keys,
  caption: null,
});

const tooltip = () => document.querySelector<HTMLElement>("#ui-tooltip");

describe("the tooltip", () => {
  let dispose = () => {};

  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    dispose();
    tableToolbar.value = null;
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  const rest = async (keys: boolean) => {
    dispose = bootApp(createTestHandle());
    tableToolbar.value = toolbar(keys);
    await nextTick();
    const button = document.querySelector<HTMLElement>(
      '#table-toolbar [data-id="sort"]',
    )!;
    button.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    vi.advanceTimersByTime(TIP_DELAY);
    await nextTick();
    return button;
  };

  it("names a button of the table toolbar after a rest", async () => {
    const button = await rest(false);
    expect(tooltip()?.getAttribute("role")).toBe("tooltip");
    expect(tooltip()?.textContent?.trim()).toBe("Sort by this column");
    expect(tooltip()?.querySelector("kbd")).toBeNull();
    expect(document.activeElement).not.toBe(tooltip());

    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await nextTick();
    expect(tooltip()).toBeNull();
  });

  it("shows its key in table mode, which describes the button", async () => {
    const button = await rest(true);
    expect(tooltip()?.querySelector("kbd")?.textContent).toBe("S");
    const id = button.getAttribute("aria-describedby")!;
    expect(document.getElementById(id)?.textContent).toBe("S");
    expect(tooltip()!.style.top).not.toBe("");
  });
});
