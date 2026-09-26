import { describe, expect, it, vi } from "vitest";
import { schema } from "prosemirror-markdown";

import { readFile } from "@tauri-apps/plugin-fs";

import { doc } from "../test/editor";
import { IMAGES, bytesOf, dataUrl } from "../test/images";
import { decodeSize, rasterize } from "./codec";
import { failureWarning, prepareImages } from "./prepare";

vi.mock("./codec", () => ({ decodeSize: vi.fn(), rasterize: vi.fn() }));

const image = (src: string, alt?: string) =>
  schema.node("image", { src, alt: alt ?? null });
const paragraph = (...images: ReturnType<typeof image>[]) =>
  schema.node("paragraph", null, images);

const PNG_SRC = dataUrl("image/png", IMAGES.png);
const converted = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

describe("images.prepareImages", () => {
  it("keeps accepted formats as they are, once per src", async () => {
    const node = doc(paragraph(image(PNG_SRC), image(PNG_SRC)));

    const { images, failures } = await prepareImages(node, null, ["image/png"]);

    expect(failures).toEqual([]);
    expect([...images]).toEqual([
      [
        PNG_SRC,
        { bytes: bytesOf(IMAGES.png), mime: "image/png", width: 3, height: 2 },
      ],
    ]);
    expect(rasterize).not.toHaveBeenCalled();
  });

  it("decodes the size if the header doesn't tell", async () => {
    const svg = "data:image/svg+xml,%3Csvg%3E%3C/svg%3E";
    vi.mocked(decodeSize).mockResolvedValue({ width: 10, height: 20 });

    const { images } = await prepareImages(doc(paragraph(image(svg))), null, [
      "image/svg+xml",
    ]);

    expect(images.get(svg)).toMatchObject({ width: 10, height: 20 });
  });

  it("converts other formats to PNG", async () => {
    const webp = dataUrl("image/webp", IMAGES.webpLossy);
    vi.mocked(rasterize).mockResolvedValue({
      bytes: converted,
      mime: "image/png",
      size: { width: 7, height: 5 },
    });

    const { images } = await prepareImages(doc(paragraph(image(webp))), null, [
      "image/png",
    ]);

    expect(rasterize).toHaveBeenCalledWith(
      bytesOf(IMAGES.webpLossy),
      "image/webp",
      expect.objectContaining({ output: "image/png" }),
    );
    expect(images.get(webp)).toEqual({
      bytes: converted,
      mime: "image/png",
      width: 7,
      height: 5,
    });
  });

  it("turns rotated photos upright as JPEG", async () => {
    const photo = dataUrl("image/jpeg", IMAGES.jpegExif6);
    vi.mocked(rasterize).mockResolvedValue({
      bytes: converted,
      mime: "image/jpeg",
      size: { width: 3, height: 5 },
    });

    const { images } = await prepareImages(doc(paragraph(image(photo))), null, [
      "image/jpeg",
    ]);

    expect(rasterize).toHaveBeenCalledWith(
      bytesOf(IMAGES.jpegExif6),
      "image/jpeg",
      expect.objectContaining({ output: "image/jpeg" }),
    );
    expect(images.get(photo)).toMatchObject({ width: 3, height: 5 });
  });

  it("lists the images that failed by alt text or src", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("missing"));
    vi.mocked(rasterize).mockRejectedValue(new Error("can't decode"));
    const tiff = dataUrl("image/tiff", IMAGES.tiff);

    const { images, failures } = await prepareImages(
      doc(paragraph(image("/a.png", "Chart"), image("/b.png"), image(tiff))),
      null,
      ["image/png"],
    );

    expect(images.size).toBe(0);
    expect(failures.sort()).toEqual(["/b.png", "Chart", tiff].sort());
  });

  it("describes failures for the notification", () => {
    expect(failureWarning([])).toEqual([]);
    expect(failureWarning(["Chart"])).toEqual([
      "1 image could not be embedded: Chart",
    ]);
    expect(failureWarning(["a", "b"])).toEqual([
      "2 images could not be embedded: a, b",
    ]);
  });
});
