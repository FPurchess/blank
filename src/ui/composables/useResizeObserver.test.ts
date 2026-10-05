import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, shallowRef } from "vue";

import { useResizeObserver } from "./useResizeObserver";

describe("useResizeObserver", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("observes the elements while mounted, and stops when the part goes", () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    let notify = () => {};
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          notify = callback;
        }
        observe = observe;
        disconnect = disconnect;
      },
    );
    const resized = vi.fn();
    const App = defineComponent(() => {
      const root = shallowRef<HTMLElement | null>(null);
      useResizeObserver(() => [root.value, null], resized);
      return () => h("div", { ref: root });
    });
    const app = createApp(App);
    app.mount(document.body.appendChild(document.createElement("div")));
    expect(observe).toHaveBeenCalledOnce();
    notify();
    expect(resized).toHaveBeenCalledOnce();
    app.unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it("does nothing without ResizeObserver", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const App = defineComponent(() => {
      useResizeObserver(() => [document.body], vi.fn());
      return () => h("div");
    });
    const app = createApp(App);
    expect(() => app.mount(document.createElement("div"))).not.toThrow();
    app.unmount();
  });
});
