import { afterEach, describe, expect, it } from "vitest";
import { createApp, h, nextTick, shallowRef } from "vue";

import DisclosureButton from "./DisclosureButton.vue";

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

describe("DisclosureButton", () => {
  it("shows and hides what it controls", async () => {
    const open = shallowRef(false);
    await render(() =>
      h(
        DisclosureButton,
        {
          controls: "more",
          modelValue: open.value,
          "onUpdate:modelValue": (next: boolean) => (open.value = next),
        },
        () => "More settings",
      ),
    );
    const disclosure =
      document.querySelector<HTMLButtonElement>("button.disclosure")!;
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
    expect(disclosure.getAttribute("aria-controls")).toBe("more");
    expect(disclosure.textContent?.trim()).toBe("More settings");

    disclosure.click();
    await nextTick();

    expect(open.value).toBe(true);
    expect(disclosure.getAttribute("aria-expanded")).toBe("true");
  });
});
