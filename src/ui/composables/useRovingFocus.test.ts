import { describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";

import { useRovingFocus } from "./useRovingFocus";

const row = () => {
  const element = document.createElement("div");
  element.innerHTML =
    "<button>a</button><span hidden><button>x</button></span><button>b</button><button>c</button>";
  document.body.replaceChildren(element);
  return element;
};
const key = (name: string) =>
  new KeyboardEvent("keydown", { key: name, cancelable: true });

describe("useRovingFocus", () => {
  it("moves the focus between the shown controls, wrapping around", () => {
    const element = row();
    const moved = vi.fn();
    const roving = effectScope().run(() =>
      useRovingFocus(() => element, "button", 0, moved),
    )!;
    const focused = () => document.activeElement?.textContent;

    const right = key("ArrowRight");
    expect(roving.onKeydown(right)).toBe(true);
    expect(right.defaultPrevented).toBe(true);
    expect(focused()).toBe("b");
    expect(moved).toHaveBeenLastCalledWith(1);
    roving.onKeydown(key("End"));
    expect(focused()).toBe("c");
    roving.onKeydown(key("ArrowRight"));
    expect(focused()).toBe("a");
    roving.onKeydown(key("ArrowLeft"));
    expect(roving.current.value).toBe(2);
    roving.onKeydown(key("Home"));
    expect(focused()).toBe("a");
    expect(roving.onKeydown(key("a"))).toBe(false);
    // with a modifier, the keys are the window's
    const withCtrl = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      ctrlKey: true,
    });
    expect(roving.onKeydown(withCtrl)).toBe(false);
  });

  it("focuses the control in the tab order, within the row when it shrank", () => {
    const element = row();
    const roving = effectScope().run(() =>
      useRovingFocus(() => element, "button", 5),
    )!;
    roving.focusCurrent();
    expect(document.activeElement?.textContent).toBe("c");
    expect(roving.current.value).toBe(2);
    const none = effectScope().run(() => useRovingFocus(() => null, "button"))!;
    expect(() => none.focusCurrent()).not.toThrow();
  });
});
