import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";

import SettingRow from "./SettingRow.vue";

const mount = async (props: Record<string, unknown> = {}) => {
  const element = document.createElement("div");
  document.body.append(element);
  const app = createApp(
    defineComponent(
      () => () =>
        h(
          SettingRow,
          { id: "paper-label", name: "paper", label: "Paper", ...props },
          { default: () => h("button", { id: "control" }) },
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

const row = () => document.querySelector<HTMLElement>("[data-row]")!;

describe("SettingRow", () => {
  let unmount = () => {};
  afterEach(() => unmount());

  it("shows its label and its control in a row named for the keys", async () => {
    unmount = await mount();

    expect(row().dataset.row).toBe("paper");
    expect(row().classList).toContain("setting");
    expect(document.getElementById("paper-label")?.textContent).toBe("Paper");
    expect(row().querySelector("#control")).not.toBeNull();
    expect(row().querySelector("small")).toBeNull();
  });

  it("describes the setting below its label", async () => {
    unmount = await mount({ description: "For new documents" });

    expect(
      document.getElementById("paper-label-description")?.textContent,
    ).toBe("For new documents");
  });

  it("puts other attributes on the row", async () => {
    unmount = await mount({ role: "radiogroup", "aria-labelledby": "x" });

    expect(row().getAttribute("role")).toBe("radiogroup");
    expect(row().getAttribute("aria-labelledby")).toBe("x");
  });
});
