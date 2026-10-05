import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick, shallowRef } from "vue";

import SegmentedTabs from "./SegmentedTabs.vue";

const selected = shallowRef("odd");

const mount = async () => {
  const element = document.createElement("div");
  document.body.append(element);
  const app = createApp(
    defineComponent(
      () => () =>
        h(SegmentedTabs, {
          label: "Pages",
          items: [
            { value: "first", label: "First page" },
            { value: "odd", label: "Odd pages" },
            { value: "even", label: "Even pages" },
          ],
          modelValue: selected.value,
          "onUpdate:modelValue": (next: string) => (selected.value = next),
        }),
    ),
  );
  app.mount(element);
  await nextTick();
  return () => {
    app.unmount();
    element.remove();
  };
};

const tabs = () => [
  ...document.querySelectorAll<HTMLButtonElement>("[role=tab]"),
];
const press = (key: string) =>
  document.activeElement!.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );

describe("SegmentedTabs", () => {
  let unmount = () => {};
  afterEach(() => {
    unmount();
    selected.value = "odd";
  });

  it("is a named tab list with the chosen tab selected and in the tab order", async () => {
    unmount = await mount();
    const list = document.querySelector("[role=tablist]")!;
    expect(list.getAttribute("aria-label")).toBe("Pages");
    expect(tabs().map((tab) => tab.textContent?.trim())).toEqual([
      "First page",
      "Odd pages",
      "Even pages",
    ]);
    expect(tabs().map((tab) => tab.getAttribute("aria-selected"))).toEqual([
      "false",
      "true",
      "false",
    ]);
    expect(tabs().map((tab) => tab.tabIndex)).toEqual([-1, 0, -1]);
  });

  it("selects a tab that is clicked", async () => {
    unmount = await mount();
    tabs()[2].click();
    await nextTick();
    expect(selected.value).toBe("even");
    expect(tabs()[2].getAttribute("aria-selected")).toBe("true");
    expect(tabs()[2].tabIndex).toBe(0);
  });

  it("selects the next and first tabs with the arrows and Home, keeping the focus", async () => {
    unmount = await mount();
    tabs()[1].focus();
    press("ArrowRight");
    await nextTick();
    expect(selected.value).toBe("even");
    expect(document.activeElement).toBe(tabs()[2]);
    press("Home");
    await nextTick();
    expect(selected.value).toBe("first");
    expect(document.activeElement).toBe(tabs()[0]);
  });

  it("goes on from the tab selected elsewhere", async () => {
    unmount = await mount();
    selected.value = "first";
    await nextTick();
    expect(tabs().map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
    tabs()[0].focus();
    press("ArrowRight");
    await nextTick();
    expect(selected.value).toBe("odd");
  });
});
