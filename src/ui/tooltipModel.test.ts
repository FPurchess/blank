import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, type EffectScope } from "vue";

import { CommandIdentifier } from "../config";
import { tooltipsSuppressed } from "../state";
import {
  describedBy,
  TIP_DELAY,
  TIP_ID,
  TIP_KEY_ID,
  tipAttrs,
  tipOf,
  tipTarget,
  watchTips,
} from "./tooltipModel";

/**
 * control adds a button with a tooltip to the document
 */
const control = (attrs: Record<string, string> = {}) => {
  const button = document.createElement("button");
  button.append(document.createElement("span"));
  for (const [name, value] of Object.entries({
    "data-tip": "Bold",
    "data-tip-key": "Ctrl+B",
    "aria-label": "Bold",
    ...attrs,
  })) {
    button.setAttribute(name, value);
  }
  document.body.append(button);
  return button;
};

const over = (target: Element, x = 10, buttons = 0) =>
  target.dispatchEvent(
    new MouseEvent("mouseover", { bubbles: true, clientX: x, buttons }),
  );
const move = (target: Element, x: number, buttons = 0) =>
  target.dispatchEvent(
    new MouseEvent("mousemove", { bubbles: true, clientX: x, buttons }),
  );
const out = (target: Element, to: Element | null = document.body) =>
  target.dispatchEvent(
    new MouseEvent("mouseout", { bubbles: true, relatedTarget: to }),
  );

describe("tipAttrs", () => {
  beforeEach(() => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("Linux x86_64");
  });

  it("names a command and writes its shortcut", () => {
    expect(tipAttrs({ command: CommandIdentifier.PAGE_SETUP })).toEqual({
      "data-tip": "Page setup…",
      "data-tip-key": "Ctrl+Alt+U",
      "aria-keyshortcuts": "Control+Alt+U",
    });
  });

  it("takes the name and the key given", () => {
    expect(
      tipAttrs({
        name: "Hide outline",
        command: CommandIdentifier.VIEW_OUTLINE,
      }),
    ).toMatchObject({
      "data-tip": "Hide outline",
      "data-tip-key": "Ctrl+Alt+O",
    });
    expect(tipAttrs({ name: "Sort", key: "S" })).toEqual({
      "data-tip": "Sort",
      "data-tip-key": "S",
      "aria-keyshortcuts": undefined,
    });
  });
});

describe("the tooltip of a control", () => {
  afterEach(() => document.body.replaceChildren());

  it("is found from inside the control, but not while it's expanded", () => {
    const button = control();
    expect(tipTarget(button.firstChild)).toBe(button);
    expect(tipTarget(document.body)).toBeNull();
    expect(tipTarget(null)).toBeNull();
    button.setAttribute("aria-expanded", "true");
    expect(tipTarget(button)).toBeNull();
  });

  it("says the control's name and key", () => {
    const button = control();
    expect(tipOf(button, 4)).toEqual({
      target: button,
      name: "Bold",
      key: "Ctrl+B",
      x: 4,
    });
    expect(tipOf(control({ "data-tip": "" }), 0)).toBeNull();
    expect(tipOf(control({ "data-tip-key": "" }), 0)?.key).toBeUndefined();
  });

  it("describes the control by only what its name doesn't say", () => {
    const tip = (attrs: Record<string, string>) =>
      describedBy(tipOf(control(attrs), 0)!);
    expect(tip({})).toBe(TIP_KEY_ID);
    expect(tip({ "aria-label": "Bold (Ctrl+B)" })).toBeUndefined();
    expect(tip({ "aria-label": "Bold text" })).toBe(TIP_KEY_ID);
    expect(tip({ "data-tip-key": "" })).toBeUndefined();
    expect(tip({ "aria-label": "A4" })).toBe(TIP_ID);
  });
});

describe("watchTips", () => {
  let scope: EffectScope;
  const show = vi.fn();
  const hide = vi.fn();
  const shown = () => show.mock.lastCall?.[0];

  beforeEach(() => {
    vi.useFakeTimers();
    scope = effectScope();
    scope.run(() => watchTips(show, hide));
  });

  afterEach(() => {
    scope.stop();
    vi.useRealTimers();
    tooltipsSuppressed.value = false;
    document.body.replaceChildren();
  });

  it("shows once the pointer rested on a control", () => {
    const button = control();
    over(button.firstChild as Element, 12);
    vi.advanceTimersByTime(TIP_DELAY - 1);
    expect(show).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(shown()).toMatchObject({ target: button, name: "Bold", x: 12 });
  });

  it("describes the control while it shows, as it was before after", () => {
    const button = control({ "aria-describedby": "hint" });
    over(button);
    vi.advanceTimersByTime(TIP_DELAY);
    expect(button.getAttribute("aria-describedby")).toBe(`hint ${TIP_KEY_ID}`);
    out(button);
    expect(hide).toHaveBeenCalled();
    expect(button.getAttribute("aria-describedby")).toBe("hint");

    const plain = control({ "aria-label": "Other" });
    over(plain);
    vi.advanceTimersByTime(TIP_DELAY);
    expect(plain.getAttribute("aria-describedby")).toBe(TIP_ID);
    out(plain);
    expect(plain.hasAttribute("aria-describedby")).toBe(false);
  });

  it("goes at once when the pointer leaves, and waits again on the next", () => {
    const [first, second] = [control(), control({ "data-tip": "Italic" })];
    over(first);
    vi.advanceTimersByTime(TIP_DELAY);
    // within the control, it stays
    out(first.firstChild as Element, first);
    over(first.firstChild as Element);
    expect(hide).not.toHaveBeenCalled();

    out(first, second);
    over(second);
    expect(hide).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(TIP_DELAY - 1);
    expect(shown().name).toBe("Bold");
    vi.advanceTimersByTime(1);
    expect(shown().name).toBe("Italic");
  });

  it("waits until the pointer rests, and shows where it stopped", () => {
    const button = control();
    over(button, 10);
    vi.advanceTimersByTime(TIP_DELAY - 100);
    move(button, 40);
    vi.advanceTimersByTime(TIP_DELAY - 1);
    expect(show).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(shown().x).toBe(40);
    // once it shows, moving over the control leaves it
    move(button, 60);
    vi.advanceTimersByTime(TIP_DELAY);
    expect(show).toHaveBeenCalledOnce();
  });

  it("shows nothing while a button is held, e.g. dragging", () => {
    const button = control();
    over(button, 10, 1);
    move(button, 20, 1);
    vi.advanceTimersByTime(TIP_DELAY);
    expect(show).not.toHaveBeenCalled();
  });

  it("stays away after a second press on the same control", () => {
    const button = control();
    over(button);
    window.dispatchEvent(new Event("mousedown"));
    window.dispatchEvent(new Event("keydown"));
    over(button.firstChild as Element);
    vi.advanceTimersByTime(TIP_DELAY);
    expect(show).not.toHaveBeenCalled();
  });

  it.each(["mousedown", "keydown", "wheel", "scroll"])(
    "goes on a %s",
    (type) => {
      const button = control();
      over(button);
      vi.advanceTimersByTime(TIP_DELAY);
      window.dispatchEvent(new Event(type));
      expect(hide).toHaveBeenCalled();
      // and doesn't come back while the pointer stays on the control
      over(button.firstChild as Element);
      vi.advanceTimersByTime(TIP_DELAY);
      expect(show).toHaveBeenCalledOnce();
      // but once it came back to it
      out(button);
      over(button);
      vi.advanceTimersByTime(TIP_DELAY);
      expect(show).toHaveBeenCalledTimes(2);
    },
  );

  it("doesn't show once the window lost the focus", () => {
    over(control());
    window.dispatchEvent(new Event("blur"));
    vi.advanceTimersByTime(TIP_DELAY);
    expect(show).not.toHaveBeenCalled();
  });

  it("doesn't show while suppressed, and goes when suppressed", () => {
    const button = control();
    tooltipsSuppressed.value = true;
    over(button);
    vi.advanceTimersByTime(TIP_DELAY);
    expect(show).not.toHaveBeenCalled();

    tooltipsSuppressed.value = false;
    over(control({ "data-tip": "Italic" }));
    vi.advanceTimersByTime(TIP_DELAY);
    expect(show).toHaveBeenCalledOnce();
    tooltipsSuppressed.value = true;
    expect(hide).toHaveBeenCalled();
  });

  it("follows a name that changes while it shows", async () => {
    const button = control();
    over(button);
    vi.advanceTimersByTime(TIP_DELAY);
    button.dataset.tip = "Bolder";
    await Promise.resolve();
    expect(shown().name).toBe("Bolder");

    out(button);
    button.dataset.tip = "Boldest";
    await Promise.resolve();
    expect(shown().name).toBe("Bolder");
  });

  it("goes when the control's tooltip goes while it shows", async () => {
    const button = control({ "aria-describedby": "hint" });
    over(button);
    vi.advanceTimersByTime(TIP_DELAY);
    delete button.dataset.tip;
    await Promise.resolve();
    expect(hide).toHaveBeenCalled();
    expect(button.getAttribute("aria-describedby")).toBe("hint");
  });

  it("doesn't show once the control opened what it controls", async () => {
    const button = control();
    over(button);
    button.setAttribute("aria-expanded", "true");
    vi.advanceTimersByTime(TIP_DELAY);
    expect(show).not.toHaveBeenCalled();

    // and goes when it opens it while it shows
    const other = control({ "data-tip": "Italic" });
    over(other);
    vi.advanceTimersByTime(TIP_DELAY);
    expect(shown().name).toBe("Italic");
    other.setAttribute("aria-expanded", "true");
    await Promise.resolve();
    expect(hide).toHaveBeenCalled();
  });

  it("doesn't show for a control that went away", () => {
    const button = control();
    over(button);
    button.remove();
    vi.advanceTimersByTime(TIP_DELAY);
    expect(show).not.toHaveBeenCalled();
  });
});
