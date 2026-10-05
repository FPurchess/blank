import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, shallowRef } from "vue";
import { createApp } from "vue";

import { cycleFocus } from "../../state";
import { useFocusRegion } from "./useFocusRegion";

/**
 * mount mounts a part with two buttons that holds the focus through
 * useFocusRegion, with an F6 stop, and returns its flag and what it was told
 */
const mount = () => {
  const focused = shallowRef(false);
  const left = vi.fn();
  const App = defineComponent(() => {
    const root = shallowRef<HTMLElement | null>(null);
    const { onFocusin, onFocusout } = useFocusRegion(
      () => root.value,
      focused,
      {
        id: "part",
        order: 1,
        focus: () => root.value?.querySelector("button")?.focus(),
      },
      left,
    );
    return () =>
      h("div", { ref: root, onFocusin, onFocusout }, [
        h("button", "a"),
        h("button", "b"),
      ]);
  });
  const host = document.body.appendChild(document.createElement("div"));
  const app = createApp(App);
  app.mount(host);
  return { focused, left, app, host };
};

describe("useFocusRegion", () => {
  it("keeps its flag while the focus is in the part, and tells where it went", () => {
    const { focused, left, app, host } = mount();
    const [a, b] = host.querySelectorAll("button");
    a.focus();
    expect(focused.value).toBe(true);
    b.focus();
    expect(focused.value).toBe(true);
    expect(left).not.toHaveBeenCalled();
    b.blur();
    expect(focused.value).toBe(false);
    expect(left).toHaveBeenCalledWith(null);
    app.unmount();
  });

  it("is a stop F6 comes to, until the part goes, which clears its flag", () => {
    const { focused, app, host } = mount();
    const editor = vi.fn();
    cycleFocus(1, null, editor);
    expect(document.activeElement).toBe(host.querySelector("button"));
    app.unmount();
    expect(focused.value).toBe(false);
    cycleFocus(1, null, editor);
    expect(editor).toHaveBeenCalled();
  });
});
