import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick, shallowRef } from "vue";

import EntryList from "./EntryList.vue";

describe("EntryList", () => {
  let unmount = () => {};
  afterEach(() => unmount());

  it("keeps the focus in the list when its last entry goes outside an inner page", async () => {
    const entries = shallowRef([{ key: "abc" }]);
    const element = document.createElement("div");
    document.body.append(element);
    const app = createApp(
      defineComponent(
        () => () =>
          h(EntryList, {
            id: "list",
            label: "things",
            entries: entries.value,
            empty: "None",
            removeLabel: (entry: { key: string }) => `Remove ${entry.key}`,
            onRemove: () => (entries.value = []),
          }),
      ),
    );
    app.mount(element);
    unmount = () => {
      app.unmount();
      element.remove();
    };
    await nextTick();

    element.querySelector<HTMLElement>(".entry button")!.click();
    await nextTick();
    await nextTick();

    expect(document.activeElement).toBe(document.getElementById("list"));
  });
});
