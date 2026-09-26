import type { Node } from "prosemirror-model";

import { decodeSize, rasterize } from "./codec";
import { loadImage } from "./load";
import { type ImageMime, type Size, jpegOrientation, probeSize } from "./mime";

export interface PreparedImage extends Size {
  bytes: Uint8Array;
  mime: ImageMime;
}

export interface PreparedImages {
  // by src; images that failed to load are missing
  images: Map<string, PreparedImage>;
  // alt text or src of the images that failed
  failures: string[];
}

// the longest edge of converted images, enough for print at page width
const MAX_EDGE = 4000;
const JPEG_QUALITY = 0.92;

const prepare = async (
  src: string,
  docPath: string | null,
  accepted: ImageMime[],
): Promise<PreparedImage | null> => {
  const loaded = await loadImage(src, docPath);
  if ("error" in loaded) {
    console.warn(`failed to load image ${src}: ${loaded.error}`);
    return null;
  }
  const { bytes, mime } = loaded;

  // other apps ignore the EXIF orientation of embedded photos, so rotated
  // ones are turned upright here
  const rotated = mime === "image/jpeg" && jpegOrientation(bytes) !== 1;
  if (accepted.includes(mime) && !rotated) {
    const size = probeSize(bytes, mime) ?? (await decodeSize(bytes, mime));
    return { bytes, mime, ...size };
  }

  const output = mime === "image/jpeg" ? "image/jpeg" : "image/png";
  const converted = await rasterize(bytes, mime, {
    maxEdge: MAX_EDGE,
    output,
    quality: JPEG_QUALITY,
  });
  return { bytes: converted.bytes, mime: output, ...converted.size };
};

/**
 * prepareImages loads every image of `doc` for an export, converting formats
 * the export can't embed into PNG (or JPEG for photos)
 * @param doc the document to export
 * @param docPath path of the document, for relative images
 * @param accepted the image formats the export can embed as they are
 */
export const prepareImages = async (
  doc: Node,
  docPath: string | null,
  accepted: ImageMime[],
): Promise<PreparedImages> => {
  const nodes = new Map<string, Node>();
  doc.descendants((node) => {
    if (node.type.name === "image") nodes.set(node.attrs.src as string, node);
  });

  const images = new Map<string, PreparedImage>();
  const failures: string[] = [];
  await Promise.all(
    [...nodes].map(async ([src, node]) => {
      const image = await prepare(src, docPath, accepted).catch((err) => {
        console.warn(`failed to convert image ${src}`, err);
        return null;
      });
      if (image) images.set(src, image);
      else failures.push((node.attrs.alt as string | null) || src);
    }),
  );
  return { images, failures };
};

/**
 * failureWarning describes the images an export left out
 */
export const failureWarning = (failures: string[]) =>
  failures.length === 0
    ? []
    : [
        `${failures.length} ${failures.length === 1 ? "image" : "images"} could not be embedded: ${failures.join(", ")}`,
      ];
