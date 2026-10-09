import { afterEach, describe, expect, it } from "vitest";
import { createApp, h, nextTick, shallowRef } from "vue";

import NumberStepper from "./NumberStepper.vue";

let unmount = () => {};
afterEach(() => unmount());

const render = async (vnode: () => ReturnType<typeof h>) => {
  const element = document.createElement("div");
  document.body.append(element);
  const app = createApp({ render: vnode });
  app.mount(element);
  unmount = () => {
    app.unmount();
    element.remove();
  };
  await nextTick();
};

const button = (label: string) =>
  document.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;
const field = () => document.querySelector<HTMLInputElement>("#copies")!;

const mountStepper = async (value = shallowRef(1)) => {
  await render(() =>
    h(NumberStepper, {
      id: "copies",
      labelledby: "copies-label",
      min: 1,
      max: 3,
      decreaseLabel: "Fewer",
      increaseLabel: "More",
      modelValue: value.value,
      "onUpdate:modelValue": (next: number) => (value.value = next),
    }),
  );
  return value;
};

const key = async (name: string) => {
  const event = new KeyboardEvent("keydown", {
    key: name,
    bubbles: true,
    cancelable: true,
  });
  field().dispatchEvent(event);
  await nextTick();
  return event;
};

describe("NumberStepper", () => {
  it("steps with its buttons, within its bounds", async () => {
    const value = await mountStepper();
    expect(field().getAttribute("aria-labelledby")).toBe("copies-label");
    expect(button("Fewer").getAttribute("aria-disabled")).toBe("true");

    button("More").click();
    button("More").click();
    button("More").click();
    await nextTick();

    expect(value.value).toBe(3);
    expect(field().value).toBe("3");
    expect(button("More").getAttribute("aria-disabled")).toBe("true");
  });

  it("steps with ↑↓ in the field", async () => {
    const value = await mountStepper();

    expect((await key("ArrowUp")).defaultPrevented).toBe(true);
    expect(value.value).toBe(2);
    await key("ArrowDown");
    await key("ArrowDown");
    expect(value.value).toBe(1);
    expect((await key("a")).defaultPrevented).toBe(false);
  });

  it("takes a number as typed, kept within its bounds", async () => {
    const value = await mountStepper();

    field().value = "7";
    field().dispatchEvent(new Event("input"));
    await nextTick();
    expect(value.value).toBe(3);
    // what isn't a number counts for nothing, and leaving shows what counts
    field().value = "x";
    field().dispatchEvent(new Event("input"));
    field().dispatchEvent(new FocusEvent("blur"));
    await nextTick();
    expect(value.value).toBe(3);
    expect(field().value).toBe("3");
  });
});
