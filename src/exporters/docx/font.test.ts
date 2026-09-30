import { beforeEach, describe, expect, it, vi } from "vitest";

// the loader keeps the font it loaded, so each test gets a fresh one
const freshLoader = async () => {
  vi.resetModules();
  return (await import("./font")).loadFont;
};

describe("loadFont", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("loads the font file once", async () => {
    const loadFont = await freshLoader();
    const fetched = vi.fn(async () => new Response(new Uint8Array([1, 2])));
    vi.stubGlobal("fetch", fetched);
    expect(await loadFont()).toEqual(new Uint8Array([1, 2]));
    expect(await loadFont()).toEqual(new Uint8Array([1, 2]));
    expect(fetched).toHaveBeenCalledTimes(1);
  });

  it("tries again after a load that failed", async () => {
    const loadFont = await freshLoader();
    const fetched = vi
      .fn()
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(new Response(new Uint8Array([3])));
    vi.stubGlobal("fetch", fetched);

    await expect(loadFont()).rejects.toThrow("HTTP 404");
    await expect(loadFont()).rejects.toThrow("offline");
    expect(await loadFont()).toEqual(new Uint8Array([3]));
    expect(await loadFont()).toEqual(new Uint8Array([3]));
    expect(fetched).toHaveBeenCalledTimes(3);
  });
});
