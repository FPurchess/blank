import { afterEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";

import { contextMenu, type MenuItem } from "../../state";
import { useMenuButton } from "./useMenuButton";

const items: MenuItem[] = [{ id: "a", label: "A" }];

const button = () => {
  const element = document.createElement("button");
  document.body.append(element);
  return element;
};
const clickOn = (element: HTMLElement) => {
  const event = new MouseEvent("click");
  Object.defineProperty(event, "currentTarget", { value: element });
  return event;
};

describe("useMenuButton", () => {
  const scope = effectScope();
  afterEach(() => {
    contextMenu.value = null;
    document.body.replaceChildren();
  });

  it("opens its menu at the button, which owns it, and closes it on the next click", () => {
    const closed = vi.fn();
    const menu = scope.run(() => useMenuButton(closed))!;
    const element = button();

    menu.toggle(clickOn(element), items);
    expect(contextMenu.value).toMatchObject({
      items,
      owner: element,
      keyboard: false,
    });
    expect(menu.isOpen.value).toBe(true);

    menu.toggle(clickOn(element), items);
    expect(contextMenu.value).toBeNull();
    expect(menu.isOpen.value).toBe(false);
    expect(closed).toHaveBeenCalledOnce();
  });

  it("opens from the keyboard when the button has the focus", () => {
    const menu = scope.run(() => useMenuButton(() => {}))!;
    const element = button();
    element.focus();

    menu.toggle(clickOn(element), items);
    expect(contextMenu.value?.keyboard).toBe(true);
  });

  it("leaves a menu opened since then alone when it closes", () => {
    const closed = vi.fn();
    const first = scope.run(() => useMenuButton(closed))!;
    const second = scope.run(() => useMenuButton(() => {}))!;
    first.toggle(clickOn(button()), items);
    const close = contextMenu.value!.close;
    second.toggle(clickOn(button()), items);

    close();
    expect(second.isOpen.value).toBe(true);
    expect(first.isOpen.value).toBe(false);
    expect(closed).toHaveBeenCalledOnce();
  });
});
