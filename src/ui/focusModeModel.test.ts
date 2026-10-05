import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { config } from "../config";
import { bootScope } from "../scope";
import {
  announcement,
  contextMenu,
  controlsFaded,
  focusMode,
  linkDialog,
  setFocusMode,
  tooltipsSuppressed,
} from "../state";
import { isTypingKey, watchFocusMode } from "./focusModeModel";

const key = (key: string, init: KeyboardEventInit = {}) =>
  new KeyboardEvent("keydown", { key, cancelable: true, ...init });

describe("isTypingKey", () => {
  it.each([
    ["a"],
    ["A"],
    [" "],
    ["é"],
    ["Enter"],
    ["Backspace"],
    ["Delete"],
    ["Tab"],
  ])("counts %j", (name) => expect(isTypingKey(key(name))).toBe(true));

  it.each([
    ["ArrowLeft", {}],
    ["PageDown", {}],
    ["Escape", {}],
    ["F6", {}],
    ["b", { ctrlKey: true }],
    ["s", { metaKey: true }],
    ["Backspace", { ctrlKey: true }],
  ])("doesn't count %s %j", (name, init) =>
    expect(isTypingKey(key(name, init))).toBe(false),
  );

  it("counts a character typed with Option", () => {
    expect(isTypingKey(key("é", { altKey: true }))).toBe(true);
  });
});

describe("watchFocusMode", () => {
  const defaults = config.value;
  let dispose = () => {};
  let chrome: HTMLElement;
  let page: HTMLElement;

  const move = (target: Element, x: number, y = 0) =>
    target.dispatchEvent(
      new MouseEvent("pointermove", { clientX: x, clientY: y, bubbles: true }),
    );
  const type = (name = "a") => window.dispatchEvent(key(name));

  beforeEach(async () => {
    vi.useFakeTimers();
    chrome = document.createElement("footer");
    chrome.id = "ui-bottom";
    page = document.createElement("div");
    document.body.append(chrome, page);
    dispose = bootScope(watchFocusMode);
    setFocusMode(true);
    await nextTick();
  });

  afterEach(() => {
    dispose();
    setFocusMode(false);
    config.value = defaults;
    linkDialog.value = null;
    contextMenu.value = null;
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it("announces what focus mode does", () => {
    expect(announcement.value?.text).toBe(
      "Focus mode: the controls fade when you type or after 3 s; move the mouse to bring them back",
    );
  });

  it("fades the controls on typing, not on the arrows", () => {
    type("ArrowDown");
    expect(controlsFaded.value).toBe(false);

    type("x");
    expect(controlsFaded.value).toBe(true);
  });

  it("brings them back when the pointer moves more than 6 px", () => {
    move(page, 0);
    type();
    move(page, 5);
    expect(controlsFaded.value).toBe(true);

    move(page, 12);
    expect(controlsFaded.value).toBe(false);
  });

  it("fades them after the pointer rested", () => {
    vi.advanceTimersByTime(2900);
    expect(controlsFaded.value).toBe(false);

    vi.advanceTimersByTime(200);
    expect(controlsFaded.value).toBe(true);
  });

  it("starts the rest again when the pointer moves", () => {
    vi.advanceTimersByTime(2000);
    move(page, 0);
    move(page, 20);
    vi.advanceTimersByTime(2000);
    expect(controlsFaded.value).toBe(false);

    vi.advanceTimersByTime(1100);
    expect(controlsFaded.value).toBe(true);
  });

  it("waits the rest time of the settings, or for typing only", async () => {
    config.value = { ...defaults, focusMode: { hideAfter: 10 } };
    await nextTick();
    vi.advanceTimersByTime(9000);
    expect(controlsFaded.value).toBe(false);
    vi.advanceTimersByTime(1100);
    expect(controlsFaded.value).toBe(true);

    controlsFaded.value = false;
    config.value = { ...defaults, focusMode: { hideAfter: 0 } };
    await nextTick();
    vi.advanceTimersByTime(60_000);
    expect(controlsFaded.value).toBe(false);
  });

  it("never fades them while the pointer is on one", () => {
    move(chrome, 0);
    type();
    vi.advanceTimersByTime(5000);
    expect(controlsFaded.value).toBe(false);

    move(page, 0);
    type();
    expect(controlsFaded.value).toBe(true);
  });

  it("never fades them while a dialog or menu is open, and brings them back", async () => {
    type();
    linkDialog.value = {} as never;
    await nextTick();
    expect(controlsFaded.value).toBe(false);

    type();
    vi.advanceTimersByTime(5000);
    expect(controlsFaded.value).toBe(false);
  });

  it("hides the tooltips while they have faded", async () => {
    type();
    await nextTick();
    expect(tooltipsSuppressed.value).toBe(true);

    move(page, 0);
    move(page, 10);
    await nextTick();
    expect(tooltipsSuppressed.value).toBe(false);
  });

  it("brings them back when the focus moves to one (F6)", () => {
    const button = document.createElement("button");
    chrome.append(button);
    type();

    button.focus();

    expect(controlsFaded.value).toBe(false);
  });

  it("leaves focus mode on Esc", () => {
    type();
    window.dispatchEvent(key("Escape"));

    expect(focusMode.value).toBe(false);
    expect(controlsFaded.value).toBe(false);
  });

  it("leaves Esc to what took it, or to a menu that is open", () => {
    const taken = key("Escape");
    taken.preventDefault();
    window.dispatchEvent(taken);
    expect(focusMode.value).toBe(true);

    contextMenu.value = {} as never;
    window.dispatchEvent(key("Escape"));
    expect(focusMode.value).toBe(true);
  });

  it("does nothing outside focus mode", () => {
    setFocusMode(false);
    type();
    vi.advanceTimersByTime(5000);

    expect(controlsFaded.value).toBe(false);
  });
});
