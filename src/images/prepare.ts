import type { Node } from "prosemirror-model";

import { embedLabel, embedSrc } from "../markdown/blocks/embeds";
import { decodeSize, rasterize } from "./codec";
import { loadImage } from "./load";
import { type ImageMime, type Size, jpegOrientation, probeSize } from "./mime";

/**
 * imageSource names an image for the log: its file, or only its kind for a
 * web or embedded image, whose address is the document's text (see
 * .claude/rules/logging.md)
 */
const imageSource = (src: string) =>
  src.startsWith("data:")
    ? "an embedded image"
    : /^https?:/i.test(src)
      ? "an image from the web"
      : `the image ${src}`;

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
    console.warn(`failed to load ${imageSource(src)}: ${loaded.error}`);
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
 * prepareImages loads every image of `doc`, and the drawings of its embeds
 * (by their embedSrc), for an export, converting formats
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
  // the images, and the drawings of embeds, which are shown as images; with
  // what stands for each where it fails
  const nodes = new Map<string, string>();
  doc.descendants((node) => {
    if (node.type.name === "image") {
      const src = node.attrs.src as string;
      nodes.set(src, (node.attrs.alt as string | null) || src);
    }
    if (node.type.name === "embed") nodes.set(embedSrc(node), embedLabel(node));
  });

  const images = new Map<string, PreparedImage>();
  const failures: string[] = [];
  await Promise.all(
    [...nodes].map(async ([src, label]) => {
      const image = await prepare(src, docPath, accepted).catch((err) => {
        console.warn(`failed to convert ${imageSource(src)}`, err);
        return null;
      });
      if (image) images.set(src, image);
      else failures.push(label);
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
