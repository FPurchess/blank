import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";

import BaseDialog from "./BaseDialog.vue";

const submit = vi.fn();
const cancel = vi.fn();

/**
 * mount shows a dialog with two fields and a button, and waits for it
 */
const mount = async () => {
  const element = document.createElement("div");
  document.body.append(element);
  const app = createApp(
    defineComponent(
      () => () =>
        h(
          BaseDialog,
          {
            id: "test-dialog",
            title: "Test",
            onSubmit: submit,
            onCancel: cancel,
          },
          {
            default: () => [
              h("input", { id: "first" }),
              h("input", { id: "hidden", hidden: true }),
              h("input", { id: "second" }),
            ],
            actions: () => [
              h("button", { type: "submit", id: "ok" }, "OK"),
              h("button", { type: "button", disabled: true }, "Off"),
              h("button", { type: "button", hidden: true }, "Gone"),
              h("button", { type: "button", tabindex: -1 }, "Skip"),
            ],
          },
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

const byId = (id: string) => document.getElementById(id)!;
const key = (target: Element, key: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
};

describe("BaseDialog", () => {
  let unmount = () => {};

  afterEach(() => {
    unmount();
    unmount = () => {};
    submit.mockClear();
    cancel.mockClear();
  });

  it("is a modal dialog, labelled by its title, with its buttons below", async () => {
    unmount = await mount();
    const form = byId("test-dialog").querySelector("form")!;

    expect(byId("test-dialog").className).toBe("dialog-backdrop");
    expect(form.getAttribute("role")).toBe("dialog");
    expect(form.getAttribute("aria-modal")).toBe("true");
    expect(form.getAttribute("aria-labelledby")).toBe("test-dialog-title");
    expect(byId("test-dialog-title").textContent).toBe("Test");
    expect(form.querySelector(".actions #ok")).not.toBeNull();
  });

  it("submits with Enter and cancels with Esc", async () => {
    unmount = await mount();
    byId("test-dialog").querySelector("form")!.requestSubmit();
    const escape = key(byId("first"), "Escape");

    expect(submit).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
    expect(escape.defaultPrevented).toBe(true);
  });

  it("cancels on a press on the backdrop, not on the dialog", async () => {
    unmount = await mount();
    byId("first").dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(cancel).not.toHaveBeenCalled();

    const press = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    byId("test-dialog").dispatchEvent(press);
    expect(cancel).toHaveBeenCalledOnce();
    expect(press.defaultPrevented).toBe(true);
  });

  it("keeps the focus inside, skipping what Tab can't reach", async () => {
    unmount = await mount();
    byId("first").focus();

    expect(key(byId("first"), "Tab", { shiftKey: true }).defaultPrevented).toBe(
      true,
    );
    expect(document.activeElement).toBe(byId("ok"));
    expect(key(byId("ok"), "Tab").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(byId("first"));
    // the browser moves the focus between the other elements
    expect(key(byId("first"), "Tab").defaultPrevented).toBe(false);
  });

  it("keeps the form from submitting itself", async () => {
    unmount = await mount();
    const event = new Event("submit", { bubbles: true, cancelable: true });

    byId("test-dialog").querySelector("form")!.dispatchEvent(event);

    expect(submit).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });
});
