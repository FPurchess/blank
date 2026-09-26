import { describe, expect, it, vi } from "vitest";

import { EMF, IMAGES, SVG, WMF, bytesOf } from "../test/images";
import { rasterize } from "./codec";
import { MAX_EDGE, optimizeForMarkdown } from "./optimize";

vi.mock("./codec", () => ({ decodeSize: vi.fn(), rasterize: vi.fn() }));

const converted = (mime: "image/png" | "image/jpeg") => ({
  bytes: new Uint8Array([1, 2, 3]),
  mime,
  size: { width: 10, height: 10 },
});

// a PNG header claiming the given size
const pngOfSize = (width: number, height: number) => {
  const bytes = bytesOf(IMAGES.png);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
};

describe("images.optimizeForMarkdown", () => {
  it.each([
    [IMAGES.png, "image/png"],
    [IMAGES.jpeg, "image/jpeg"],
    [IMAGES.gif, "image/gif"],
    [IMAGES.webpLossy, "image/webp"],
  ])(
    "keeps small images the markdown parser accepts (%#)",
    async (base64, mime) => {
      const bytes = bytesOf(base64);

      expect(await optimizeForMarkdown(bytes, null)).toEqual({ bytes, mime });
      expect(rasterize).not.toHaveBeenCalled();
    },
  );

  it("scales large images down, keeping PNG", async () => {
    vi.mocked(rasterize).mockResolvedValue(converted("image/png"));
    const bytes = pngOfSize(MAX_EDGE + 1, 10);

    expect(await optimizeForMarkdown(bytes, "image/png")).toEqual({
      bytes: converted("image/png").bytes,
      mime: "image/png",
    });
    expect(rasterize).toHaveBeenCalledWith(bytes, "image/png", {
      maxEdge: MAX_EDGE,
      output: "image/png",
      quality: 0.85,
    });
  });

  it("turns rotated photos upright as JPEG", async () => {
    vi.mocked(rasterize).mockResolvedValue(converted("image/jpeg"));

    const result = await optimizeForMarkdown(bytesOf(IMAGES.jpegExif6), null);

    expect(result?.mime).toBe("image/jpeg");
    expect(rasterize).toHaveBeenCalledWith(
      bytesOf(IMAGES.jpegExif6),
      "image/jpeg",
      expect.objectContaining({ output: "image/jpeg" }),
    );
  });

  it.each([
    [SVG, "image/svg+xml"],
    [bytesOf(IMAGES.bmp), "image/bmp"],
    [bytesOf(IMAGES.tiff), "image/tiff"],
  ])("converts formats the parser drops to PNG (%#)", async (bytes, mime) => {
    vi.mocked(rasterize).mockResolvedValue(converted("image/png"));

    expect((await optimizeForMarkdown(bytes, null))?.mime).toBe("image/png");
    expect(rasterize).toHaveBeenCalledWith(
      bytes,
      mime,
      expect.objectContaining({ output: "image/png" }),
    );
  });

  it("falls back to the declared type", async () => {
    vi.mocked(rasterize).mockResolvedValue(converted("image/png"));
    const unknown = new Uint8Array([0, 1, 2, 3]);

    await optimizeForMarkdown(unknown, "IMAGE/AVIF");

    expect(rasterize).toHaveBeenCalledWith(
      unknown,
      "image/avif",
      expect.anything(),
    );
  });

  it.each([
    [EMF, "image/x-emf"],
    [WMF, "image/x-wmf"],
    [new Uint8Array([0, 1, 2, 3]), null],
    [new Uint8Array([0, 1, 2, 3]), "application/octet-stream"],
  ])("drops images that can't be decoded (%#)", async (bytes, contentType) => {
    expect(await optimizeForMarkdown(bytes, contentType)).toBeNull();
    expect(rasterize).not.toHaveBeenCalled();
  });

  it("drops images the webview fails to convert", async () => {
    vi.mocked(rasterize).mockRejectedValue(new Error("can't decode"));

    expect(await optimizeForMarkdown(bytesOf(IMAGES.tiff), null)).toBeNull();
  });
});
