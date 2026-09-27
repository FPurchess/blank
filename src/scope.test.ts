import { describe, expect, it, vi } from "vitest";
import { onScopeDispose, shallowRef, watch } from "vue";

import { bootScope, listenOnWindow } from "./scope";

describe("bootScope", () => {
  it("stops the watchers and runs the cleanups of the boot", () => {
    const source = shallowRef(0);
    const seen: number[] = [];
    const cleanup = vi.fn();
    const dispose = bootScope(() => {
      watch(source, (value) => seen.push(value), { flush: "sync" });
      onScopeDispose(cleanup);
    });

    source.value = 1;
    dispose();
    source.value = 2;

    expect(seen).toEqual([1]);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("stops the boots it started with it", () => {
    const inner = vi.fn();
    const dispose = bootScope(() => {
      bootScope(() => onScopeDispose(inner));
    });

    dispose();

    expect(inner).toHaveBeenCalledOnce();
  });

  it("does nothing when disposed again", () => {
    const cleanup = vi.fn();
    const dispose = bootScope(() => onScopeDispose(cleanup));

    dispose();
    dispose();

    expect(cleanup).toHaveBeenCalledOnce();
  });
});

describe("listenOnWindow", () => {
  it("listens on the window until the boot stops", () => {
    const listener = vi.fn();
    const dispose = bootScope(() => listenOnWindow("resize", listener));

    window.dispatchEvent(new Event("resize"));
    dispose();
    window.dispatchEvent(new Event("resize"));

    expect(listener).toHaveBeenCalledOnce();
  });

  it("listens in the capture phase when asked to", () => {
    const seen: string[] = [];
    const target = document.createElement("div");
    document.body.append(target);
    target.addEventListener("mousedown", () => seen.push("target"));
    const dispose = bootScope(() =>
      listenOnWindow("mousedown", () => seen.push("window"), true),
    );

    target.dispatchEvent(new Event("mousedown"));
    dispose();
    target.remove();

    expect(seen).toEqual(["window", "target"]);
  });
});
