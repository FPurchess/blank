import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { bootNativeMenuGuard } from "./nativeMenu";

const contextmenu = (target: Element, init: MouseEventInit = {}) => {
  const event = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event.defaultPrevented;
};

describe("bootNativeMenuGuard", () => {
  let dispose = () => {};

  beforeEach(() => {
    document.body.replaceChildren();
    dispose = bootNativeMenuGuard();
  });

  afterEach(() => dispose());

  it("hides the webview's menu outside text fields", () => {
    const input = document.body.appendChild(document.createElement("input"));
    const textarea = document.body.appendChild(
      document.createElement("textarea"),
    );

    expect(contextmenu(document.body)).toBe(true);
    expect(contextmenu(input)).toBe(false);
    expect(contextmenu(textarea)).toBe(false);
    expect(contextmenu(document.body, { shiftKey: true })).toBe(false);
  });

  it("hides it for events that aren't on an element", () => {
    const event = new MouseEvent("contextmenu", { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("prevents the menu only after the page's own listeners saw it", () => {
    const target = document.body.appendChild(document.createElement("p"));
    let seenPrevented: boolean | null = null;
    target.addEventListener("contextmenu", (event) => {
      seenPrevented = event.defaultPrevented;
    });
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });

    target.dispatchEvent(event);

    expect(seenPrevented).toBe(false);
    expect(event.defaultPrevented).toBe(true);
  });

  it("lets it show again once disposed", () => {
    dispose();
    dispose = () => {};

    expect(contextmenu(document.body)).toBe(false);
  });
});
