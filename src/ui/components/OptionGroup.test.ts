import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick, shallowRef } from "vue";

import type { Option } from "../../layout/choices";
import OptionGroup from "./OptionGroup.vue";

const sizes: Option<string>[] = [
  { value: "s", label: "Small" },
  { value: "m", label: "Medium" },
  { value: "l", label: "Large" },
];
const levels: Option<number>[] = [
  { value: 1, label: "Heading 1", short: "H1" },
  { value: 2, label: "Heading 2", short: "H2" },
];

const mount = async <T extends string | number>(
  options: Option<T>[],
  value: { value: T | T[] },
) => {
  const element = document.createElement("div");
  document.body.append(element);
  const app = createApp(
    defineComponent(
      () => () =>
        h(OptionGroup<T>, {
          id: "row-label",
          name: "row",
          label: "Row",
          options,
          modelValue: value.value,
          "onUpdate:modelValue": (next: T | T[]) => (value.value = next),
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

const buttons = () => [
  ...document.querySelectorAll<HTMLButtonElement>("[data-row] button"),
];

describe("OptionGroup", () => {
  let unmount = () => {};
  afterEach(() => unmount());

  it("is a radio group in a row named by its label", async () => {
    unmount = await mount(sizes, shallowRef("m"));

    const row = document.querySelector<HTMLElement>("[data-row]")!;
    expect(row.dataset.row).toBe("row");
    expect(row.getAttribute("role")).toBe("radiogroup");
    expect(row.getAttribute("aria-labelledby")).toBe("row-label");
    expect(document.getElementById("row-label")?.textContent).toBe("Row");
    expect(row.querySelector(".options")).not.toBeNull();
    expect(buttons().map((b) => b.getAttribute("aria-checked"))).toEqual([
      "false",
      "true",
      "false",
    ]);
  });

  it("shows short labels, named by them, and tipped by the long ones", async () => {
    unmount = await mount(levels, shallowRef<number[]>([]));

    expect(buttons().map((b) => b.textContent?.trim())).toEqual(["H1", "H2"]);
    expect(buttons()[0].hasAttribute("aria-label")).toBe(false);
    expect(buttons()[0].dataset.tip).toBe("Heading 1");
    expect(buttons()[0].getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps the checked option in the tab order when the value changes from outside", async () => {
    const value = shallowRef("s");
    unmount = await mount(sizes, value);
    expect(buttons().map((b) => b.tabIndex)).toEqual([0, -1, -1]);

    value.value = "l";
    await nextTick();
    await nextTick();

    expect(buttons().map((b) => b.tabIndex)).toEqual([-1, -1, 0]);
  });
});
