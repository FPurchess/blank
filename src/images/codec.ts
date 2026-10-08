// The only image code that needs the webview's decoders and a canvas. jsdom
// has neither, so tests mock this module (and coverage leaves it out).
import type { Size } from "./mime";

// an SVG without width and height has no natural size of its own
const SVG_FALLBACK_EDGE = 1024;

// decodes the image from a blob URL, which `use` may draw before it is revoked
const withImage = async <T>(
  bytes: Uint8Array,
  mime: string,
  use: (image: HTMLImageElement, size: Size) => T | Promise<T>,
): Promise<T> => {
  const url = URL.createObjectURL(
    new Blob([bytes as BlobPart], { type: mime }),
  );
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const size =
      image.naturalWidth && image.naturalHeight
        ? { width: image.naturalWidth, height: image.naturalHeight }
        : { width: SVG_FALLBACK_EDGE, height: SVG_FALLBACK_EDGE };
    return await use(image, size);
  } finally {
    URL.revokeObjectURL(url);
  }
};

/**
 * decodeSize decodes an image to read its pixel size, e.g. for formats whose
 * header `probeSize` can't read. EXIF orientation is applied.
 */
export const decodeSize = async (
  bytes: Uint8Array,
  mime: string,
): Promise<Size> => withImage(bytes, mime, (_, size) => size);

export interface RasterizeOptions {
  // the longest edge of the result in pixels; smaller images keep their size
  maxEdge: number;
  output: "image/png" | "image/jpeg";
  // JPEG quality between 0 and 1
  quality?: number;
}

/**
 * rasterize re-encodes an image as PNG or JPEG, scaled down to `maxEdge` and
 * turned upright according to its EXIF orientation
 */
export const rasterize = (
  bytes: Uint8Array,
  mime: string,
  { maxEdge, output, quality }: RasterizeOptions,
): Promise<{ bytes: Uint8Array; mime: string; size: Size }> =>
  withImage(bytes, mime, async (image, size) => {
    const scale = Math.min(1, maxEdge / Math.max(size.width, size.height));
    const width = Math.max(1, Math.round(size.width * scale));
    const height = Math.max(1, Math.round(size.height * scale));

    // a regular canvas: OffscreenCanvas needs WebKitGTK 2.46
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas is not available");
    if (output === "image/jpeg") {
      // JPEG has no transparency, which would otherwise turn black
      context.fillStyle = "#fff";
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, output, quality),
    );
    if (!blob) throw new Error(`could not encode the image as ${output}`);
    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      mime: output,
      size: { width, height },
    };
  });

// the pixels of an image, as a canvas holds them: RGBA, row by row
export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * decodePixels decodes an image into its pixels, scaled down to `maxEdge`
 * and turned upright according to its EXIF orientation
 */
export const decodePixels = (
  bytes: Uint8Array,
  mime: string,
  maxEdge: number,
): Promise<Pixels> =>
  withImage(bytes, mime, (image, size) => {
    const scale = Math.min(1, maxEdge / Math.max(size.width, size.height));
    const width = Math.max(1, Math.round(size.width * scale));
    const height = Math.max(1, Math.round(size.height * scale));
    return drawPixels(width, height, (context) =>
      context.drawImage(image, 0, 0, width, height),
    );
  });

/**
 * drawPixels returns the pixels of a transparent canvas of `width` by
 * `height` that `draw` drew on, e.g. a signature's strokes or typed name
 */
export const drawPixels = (
  width: number,
  height: number,
  draw: (context: CanvasRenderingContext2D) => void,
): Pixels => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas is not available");
  draw(context);
  const { data } = context.getImageData(0, 0, width, height);
  return { data, width, height };
};

/**
 * encodePng encodes pixels as a PNG, keeping their transparency
 */
export const encodePng = async ({ data, width, height }: Pixels) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas is not available");
  context.putImageData(
    new ImageData(new Uint8ClampedArray(data), width, height),
    0,
    0,
  );
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("could not encode the image as image/png");
  return new Uint8Array(await blob.arrayBuffer());
};
