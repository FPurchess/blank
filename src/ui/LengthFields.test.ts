import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";

import LengthFields from "./LengthFields.vue";
import { PAPER_FIELDS } from "./pageSetupModel";

const update = vi.fn();

const mount = async (errorId?: string) => {
  const element = document.createElement("div");
  document.body.append(element);
  const app = createApp(
    defineComponent(
      () => () =>
        h(LengthFields, {
          name: "paper",
          fields: PAPER_FIELDS,
          values: { width: "210", height: "297" },
          unit: "mm",
          errorId,
          onUpdate: update,
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

const input = (id: string) =>
  document.getElementById(`page-setup-paper-${id}`) as HTMLInputElement;

describe("LengthFields", () => {
  let unmount = () => {};
  afterEach(() => {
    unmount();
    update.mockClear();
  });

  it("shows a field per length, in its unit", async () => {
    unmount = await mount();

    expect(document.querySelector<HTMLElement>(".custom")?.dataset.fields).toBe(
      "paper",
    );
    expect(input("width").value).toBe("210");
    expect(input("height").value).toBe("297");
    expect(input("width").inputMode).toBe("decimal");
    expect(
      document.getElementById("page-setup-paper-width-unit")?.textContent,
    ).toBe("mm");
  });

  it("hands a typed length up, without changing what it was given", async () => {
    unmount = await mount();

    input("width").value = "170";
    input("width").dispatchEvent(new Event("input"));

    expect(update).toHaveBeenCalledWith("width", "170");
  });

  it("marks every field while the lengths are wrong", async () => {
    unmount = await mount("page-setup-error-paper");

    for (const id of ["width", "height"]) {
      expect(input(id).getAttribute("aria-invalid")).toBe("true");
      expect(input(id).getAttribute("aria-describedby")).toContain(
        "page-setup-error-paper",
      );
    }
  });
});
