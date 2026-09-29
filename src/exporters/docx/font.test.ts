import { describe, expect, it, vi } from "vitest";

import { loadFont } from "./font";

describe("loadFont", () => {
  it("loads the font file once", async () => {
    const fetched = vi.fn(async () => new Response(new Uint8Array([1, 2])));
    vi.stubGlobal("fetch", fetched);
    expect(await loadFont()).toEqual(new Uint8Array([1, 2]));
    expect(await loadFont()).toEqual(new Uint8Array([1, 2]));
    expect(fetched).toHaveBeenCalledTimes(1);
  });
});
