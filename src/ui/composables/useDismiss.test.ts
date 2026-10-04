import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, type EffectScope } from "vue";

import { type DismissOptions, useDismiss } from "./useDismiss";

describe("useDismiss", () => {
  let scope: EffectScope;
  let popup: HTMLElement;
  let anchor: HTMLElement;
  const close = vi.fn();

  const start = (options?: DismissOptions) =>
    scope.run(() => useDismiss(() => [popup, anchor, null], close, options))!;
  const press = (target: EventTarget) =>
    target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  // dispatches a key, and returns whether it went on (wasn't prevented)
  const key = (name: string) =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: name, cancelable: true }),
    );

  beforeEach(() => {
    scope = effectScope();
    popup = document.createElement("div");
    popup.append(document.createElement("button"));
    anchor = document.createElement("button");
    document.body.append(popup, anchor);
  });

  afterEach(() => {
    scope.stop();
    document.body.replaceChildren();
  });

  it("closes on a press outside, not inside or on what it belongs to", () => {
    start();
    press(popup.firstChild!);
    press(anchor);
    expect(close).not.toHaveBeenCalled();
    press(document.body);
    expect(close).toHaveBeenCalledOnce();
  });

  it("tells what is inside", () => {
    const { contains } = start();
    expect(contains(popup.firstChild)).toBe(true);
    expect(contains(anchor)).toBe(true);
    expect(contains(document.body)).toBe(false);
    expect(contains(window)).toBe(false);
  });

  it("closes on keys, blur and resize only when asked", () => {
    start();
    key("Escape");
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("resize"));
    expect(close).not.toHaveBeenCalled();
  });

  it("closes on Escape but not on other keys, and takes the Escape", () => {
    start({ escape: true });
    expect(key("a")).toBe(true);
    expect(close).not.toHaveBeenCalled();
    // the rest of the press never reaches what gets the focus as typing
    expect(key("Escape")).toBe(false);
    expect(close).toHaveBeenCalledOnce();
  });

  it("closes on any key, which goes on", () => {
    start({ anyKey: true });
    expect(key("a")).toBe(true);
    expect(close).toHaveBeenCalledOnce();
    expect(key("Escape")).toBe(true);
  });

  it("closes on blur and resize", () => {
    start({ blur: true, resize: true });
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("resize"));
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("stops listening with the component", () => {
    start({ anyKey: true });
    scope.stop();
    press(document.body);
    key("a");
    expect(close).not.toHaveBeenCalled();
  });
});
