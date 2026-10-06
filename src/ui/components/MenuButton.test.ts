import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";

import { EditorKey } from "../../editor/handle";
import { contextMenu, type MenuItem } from "../../state";
import { createTestHandle } from "../../test/editor";
import MenuButton from "./MenuButton.vue";

const items: MenuItem[] = [{ id: "a", label: "A", run: () => {} }];

const mount = async (
  props: Record<string, unknown>,
  shown?: string,
  focus = vi.fn(),
) => {
  const element = document.createElement("div");
  document.body.append(element);
  const handle = { ...createTestHandle(), focus };
  const app = createApp(
    defineComponent(
      () => () =>
        h(
          MenuButton,
          { label: "First page", items: () => items, ...props },
          shown ? { default: () => shown } : undefined,
        ),
    ),
  );
  app.provide(EditorKey, handle);
  app.mount(element);
  await nextTick();
  return () => {
    app.unmount();
    element.remove();
  };
};

const button = () =>
  document.querySelector<HTMLButtonElement>("button.menu-button")!;

describe("MenuButton", () => {
  let unmount = () => {};
  afterEach(() => {
    unmount();
    contextMenu.value = null;
  });

  it("shows its value and names it with its label, as a select", async () => {
    unmount = await mount({ text: "None", class: "select" });
    expect(button().getAttribute("aria-label")).toBe("First page: None");
    expect(button().textContent?.trim()).toBe("None");
    expect(button().classList).not.toContain("icon-only");
    expect(button().getAttribute("aria-haspopup")).toBe("menu");
    expect(button().getAttribute("title")).toBeNull();
  });

  it("shows what its slot holds, named by its label alone, with its own tooltip", async () => {
    unmount = await mount(
      { icon: "plus", label: "Page number", tip: "Page number, in a style" },
      "Page number",
    );
    expect(button().getAttribute("aria-label")).toBe("Page number");
    expect(button().textContent?.trim()).toBe("Page number");
    expect(button().dataset.tip).toBe("Page number, in a style");
    expect(button().classList).not.toContain("icon-only");
  });

  it("is only an icon without a value or a slot, and focusable unless told", async () => {
    unmount = await mount({ icon: "more", chevron: false });
    expect(button().classList).toContain("icon-only");
    expect(button().hasAttribute("tabindex")).toBe(false);
  });

  it("gives the focus to `refocus` when a menu a click opened closes", async () => {
    const refocus = vi.fn();
    const focus = vi.fn();
    unmount = await mount({ refocus }, undefined, focus);
    button().click();
    await nextTick();
    expect(button().getAttribute("aria-expanded")).toBe("true");
    contextMenu.value!.close();
    expect(refocus).toHaveBeenCalledOnce();
    expect(focus).not.toHaveBeenCalled();
  });

  it("gives the text the focus without `refocus`", async () => {
    const focus = vi.fn();
    unmount = await mount({}, undefined, focus);
    button().click();
    await nextTick();
    contextMenu.value!.close();
    expect(focus).toHaveBeenCalledOnce();
  });
});
