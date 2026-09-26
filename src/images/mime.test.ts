import { describe, expect, it } from "vitest";

import { EMF, IMAGES, SVG, WMF, bytesOf } from "../test/images";
import { jpegOrientation, probeSize, sniffMime } from "./mime";

describe("images.mime", () => {
  describe("sniffMime", () => {
    it.each([
      [IMAGES.png, "image/png"],
      [IMAGES.jpeg, "image/jpeg"],
      [IMAGES.gif, "image/gif"],
      [IMAGES.webpLossy, "image/webp"],
      [IMAGES.bmp, "image/bmp"],
      [IMAGES.tiff, "image/tiff"],
    ])("detects %#", (base64, mime) => {
      expect(sniffMime(bytesOf(base64))).toBe(mime);
    });

    it("detects SVG, EMF and WMF", () => {
      expect(sniffMime(SVG)).toBe("image/svg+xml");
      expect(sniffMime(EMF)).toBe("image/x-emf");
      expect(sniffMime(WMF)).toBe("image/x-wmf");
    });

    it.each([
      new Uint8Array([]),
      new TextEncoder().encode("# not an image"),
      new TextEncoder().encode("<svgfoo>"),
    ])("returns null for anything else (%#)", (bytes) => {
      expect(sniffMime(bytes)).toBeNull();
    });
  });

  describe("probeSize", () => {
    it.each([
      [IMAGES.png, "image/png", 3, 2],
      [IMAGES.jpeg, "image/jpeg", 5, 3],
      [IMAGES.jpegExif6, "image/jpeg", 5, 3],
      [IMAGES.gif, "image/gif", 4, 2],
      [IMAGES.webpLossy, "image/webp", 7, 5],
      [IMAGES.webpLossless, "image/webp", 7, 5],
      [IMAGES.webpExtended, "image/webp", 7, 5],
      [IMAGES.bmp, "image/bmp", 3, 2],
    ] as const)("reads the size of %#", (base64, mime, width, height) => {
      expect(probeSize(bytesOf(base64), mime)).toEqual({ width, height });
    });

    it("returns null for formats without a readable header", () => {
      expect(probeSize(bytesOf(IMAGES.tiff), "image/tiff")).toBeNull();
      expect(probeSize(SVG, "image/svg+xml")).toBeNull();
    });

    it.each([
      ["image/png", IMAGES.png],
      ["image/jpeg", IMAGES.jpeg],
      ["image/gif", IMAGES.gif],
      ["image/webp", IMAGES.webpLossy],
      ["image/bmp", IMAGES.bmp],
    ] as const)("returns null for a truncated %s", (mime, base64) => {
      expect(probeSize(bytesOf(base64).subarray(0, 8), mime)).toBeNull();
    });

    it("returns null for a JPEG without a frame", () => {
      const bytes = new Uint8Array([
        0xff, 0xd8, 0x00, 0x00, 0, 0, 0, 0, 0, 0, 0,
      ]);
      expect(probeSize(bytes, "image/jpeg")).toBeNull();
    });
  });

  describe("jpegOrientation", () => {
    it("reads the EXIF orientation", () => {
      expect(jpegOrientation(bytesOf(IMAGES.jpegExif6))).toBe(6);
    });

    it("defaults to upright", () => {
      expect(jpegOrientation(bytesOf(IMAGES.jpeg))).toBe(1);
      expect(jpegOrientation(new Uint8Array([0xff, 0xd8, 0xff]))).toBe(1);
    });
  });
});
