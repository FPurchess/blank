import { afterEach, describe, expect, it, vi } from "vitest";

describe("the math fonts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("adds no font a request failed for, and tries again later", async () => {
    const { fallbackFonts } = await import("../engine/fallback");
    const { loadMathFonts } = await import("./fonts");
    const fetch = vi.fn(async () => new Response("", { status: 404 }));
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await loadMathFonts();
    expect(fallbackFonts.value).toEqual([]);
    const tried = fetch.mock.calls.length;
    await loadMathFonts();
    expect(fetch.mock.calls.length).toBeGreaterThan(tried);
  });
});
