import { beforeEach, describe, expect, it, vi } from "vitest";

// the loader keeps the fonts it loaded, so each test gets a fresh one
const freshLoader = async () => {
  vi.resetModules();
  return (await import("./font")).loadFonts;
};

describe("loadFonts", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("loads IBM Plex Sans and IBM Plex Mono once each", async () => {
    const loadFonts = await freshLoader();
    const fetched = vi.fn(
      async (url: string) =>
        new Response(new Uint8Array(url.includes("Mono") ? [2] : [1])),
    );
    vi.stubGlobal("fetch", fetched);
    const fonts = [
      { name: "IBM Plex Sans", data: new Uint8Array([1]) },
      { name: "IBM Plex Mono", data: new Uint8Array([2]) },
    ];
    expect(await loadFonts()).toEqual(fonts);
    expect(await loadFonts()).toEqual(fonts);
    expect(fetched).toHaveBeenCalledTimes(2);
  });

  it("tries again after a load that failed", async () => {
    const loadFonts = await freshLoader();
    const fetched = vi
      .fn()
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockImplementation(async () => new Response(new Uint8Array([3])));
    vi.stubGlobal("fetch", fetched);

    await expect(loadFonts()).rejects.toThrow("HTTP 404");
    const fonts = await loadFonts();
    expect(fonts.map((font) => font.data)).toEqual([
      new Uint8Array([3]),
      new Uint8Array([3]),
    ]);
  });
});
