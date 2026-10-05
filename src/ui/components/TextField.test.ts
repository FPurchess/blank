import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick, shallowRef } from "vue";

import TextField from "./TextField.vue";

const value = shallowRef("start");
const hint = shallowRef("");

const mount = async (
  withButton = false,
  props: Record<string, unknown> = {},
) => {
  const element = document.createElement("div");
  document.body.append(element);
  const app = createApp(
    defineComponent(
      () => () =>
        h(
          TextField,
          {
            id: "field",
            label: "Name",
            modelValue: value.value,
            "onUpdate:modelValue": (next: string) => (value.value = next),
            hint: { id: "field-hint", text: hint.value },
            placeholder: "e.g. Ada",
            ...props,
          },
          withButton
            ? { default: () => h("button", { id: "next" }) }
            : undefined,
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

const input = () => document.getElementById("field") as HTMLInputElement;

describe("TextField", () => {
  let unmount = () => {};

  afterEach(() => {
    unmount();
    value.value = "start";
    hint.value = "";
  });

  it("labels a plain text field", async () => {
    unmount = await mount();

    expect(document.querySelector("label")!.htmlFor).toBe("field");
    expect(input().type).toBe("text");
    expect(input().autocomplete).toBe("off");
    expect(input().getAttribute("spellcheck")).toBe("false");
    expect(input().placeholder).toBe("e.g. Ada");
    expect(input().value).toBe("start");
  });

  it("follows what's typed, and keeps it while it renders again", async () => {
    unmount = await mount();
    input().value = "Ada";
    input().dispatchEvent(new Event("input"));
    hint.value = "Looks good";
    await nextTick();

    expect(value.value).toBe("Ada");
    expect(input().value).toBe("Ada");
  });

  it("shows its hint below it, announced and linked to the field", async () => {
    unmount = await mount();
    const note = () => document.getElementById("field-hint")!;
    expect(note().hidden).toBe(true);

    hint.value = "Too short";
    await nextTick();
    expect(note().hidden).toBe(false);
    expect(note().textContent).toBe("Too short");
    expect(note().getAttribute("aria-live")).toBe("polite");
    expect(input().getAttribute("aria-describedby")).toBe("field-hint");
  });

  it("puts what goes next to it in a row with it", async () => {
    unmount = await mount(true);

    const row = document.querySelector(".row")!;
    expect(row.contains(input())).toBe(true);
    expect(row.querySelector("#next")).not.toBeNull();
  });

  it("shows a unit inside the field, which describes it", async () => {
    unmount = await mount(false, { unit: "cm", hint: undefined });

    const unit = document.getElementById("field-unit")!;
    expect(unit.textContent).toBe("cm");
    expect(unit.parentElement!.classList).toContain("field");
    expect(unit.parentElement!.contains(input())).toBe(true);
    expect(input().getAttribute("aria-describedby")).toBe("field-unit");
    expect(document.querySelector("label")!.textContent).toBe("Name");
  });

  it("marks a value that can't be used, described by its error", async () => {
    unmount = await mount(false, { unit: "cm", errorId: "field-error" });

    expect(input().getAttribute("aria-invalid")).toBe("true");
    expect(input().getAttribute("aria-describedby")).toBe(
      "field-hint field-unit field-error",
    );
  });

  it("is valid without an error", async () => {
    unmount = await mount();

    expect(input().hasAttribute("aria-invalid")).toBe(false);
    expect(input().getAttribute("aria-describedby")).toBe("field-hint");
  });
});
