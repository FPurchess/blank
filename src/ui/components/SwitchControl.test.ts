import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick, shallowRef } from "vue";

import SwitchControl from "./SwitchControl.vue";

const on = shallowRef(false);

const mount = async () => {
  const element = document.createElement("div");
  document.body.append(element);
  const app = createApp(
    defineComponent(
      () => () =>
        h(
          SwitchControl,
          {
            modelValue: on.value,
            "onUpdate:modelValue": (next: boolean) => (on.value = next),
          },
          { default: () => "Odd and even pages differ" },
        ),
    ),
  );
  app.mount(element);
  await nextTick();
  return () => {
    app.unmount();
    element.remove();
  };
};

const control = () =>
  document.querySelector<HTMLButtonElement>("[role=switch]")!;

describe("SwitchControl", () => {
  let unmount = () => {};
  afterEach(() => {
    unmount();
    on.value = false;
  });

  it("is a switch named by its label, which says whether it's on", async () => {
    unmount = await mount();
    expect(control().textContent?.trim()).toBe("Odd and even pages differ");
    expect(control().getAttribute("aria-checked")).toBe("false");
    on.value = true;
    await nextTick();
    expect(control().getAttribute("aria-checked")).toBe("true");
  });

  it("switches on a click, the label's too, and back", async () => {
    unmount = await mount();
    control().click();
    await nextTick();
    expect(on.value).toBe(true);
    expect(control().getAttribute("aria-checked")).toBe("true");
    control().click();
    await nextTick();
    expect(on.value).toBe(false);
  });

  it("draws its track apart from the label, hidden from screen readers", async () => {
    unmount = await mount();
    const track = control().querySelector(".switch")!;
    expect(track.getAttribute("aria-hidden")).toBe("true");
  });
});
