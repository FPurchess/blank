import { afterEach, describe, expect, it, vi } from "vitest";

import { createModuleLoader, RETRY } from "./moduleLoader";

describe("a module of the engine's", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("loads once", async () => {
    const load = vi.fn(async () => "module");
    const loader = createModuleLoader("test", load);
    expect(await loader.module()).toBe("module");
    expect(await loader.module()).toBe("module");
    expect(load).toHaveBeenCalledOnce();
  });

  it("tries a failed load again after a while, and logs its kind only", async () => {
    vi.useFakeTimers();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new TypeError("secret text"))
      .mockResolvedValue("module");
    const loader = createModuleLoader("test", load);
    await expect(loader.module()).rejects.toThrow("secret text");
    expect(logged).toHaveBeenCalledWith(
      "the test module didn't load",
      "TypeError",
    );
    await expect(loader.module()).rejects.toThrow("didn't load");
    vi.advanceTimersByTime(RETRY);
    expect(await loader.module()).toBe("module");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("gives up one that trapped until a new loader is set", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const load = vi.fn(async () => "module");
    const loader = createModuleLoader("test", load);
    await loader.module();
    loader.drop(new WebAssembly.RuntimeError("unreachable"));
    vi.advanceTimersByTime(RETRY * 10);
    await expect(loader.module()).rejects.toThrow();
    expect(load).toHaveBeenCalledOnce();
    loader.setLoader(null);
    expect(await loader.module()).toBe("module");
  });
});
