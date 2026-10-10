import type { Node } from "prosemirror-model";

import {
  drawingOf,
  inked,
  isVector,
  vectorOf,
  withFonts,
} from "../engine/vectors";
import { LIGHT_TEXT } from "../layout/paperColors";
import { embedLabel, embedSrc } from "../markdown/blocks/embeds";
import { sourceKind } from "../sources/registry";
import { renderedOf, sourceKeyOf } from "../sources/store";
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
  // a drawing's SVG, where `bytes` is its picture for an export that can't
  // embed SVG, e.g. Word as the picture an older Word shows
  svg?: Uint8Array;
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

// the ink of drawings in exports: ink on white, as the PDF's text
export const PRINT_INK = `rgb(${LIGHT_TEXT.join(",")})`;

// how much finer than its own size a drawing's picture is, where an export
// can't embed SVG: sharp in print at its size
const PICTURE_SCALE = 3;

const SVG_ROOT = /<svg\b([^>]*)>/;

/**
 * scaled returns a drawing whose own size is `scale` times its own, which
 * draws its picture finer
 */
const scaled = (svg: string, scale: number) =>
  svg.replace(SVG_ROOT, (_, attributes: string) => {
    const at = (name: string) =>
      Number(new RegExp(`\\s${name}="([\\d.]+)"`).exec(attributes)?.[1] ?? 0);
    const width = at("width") * scale;
    const height = at("height") * scale;
    const rest = attributes.replace(/\s(?:width|height)="[^"]*"/g, "");
    return `<svg width="${width}" height="${height}"${rest}>`;
  });

/**
 * prepareVector prepares a drawing of Blank's (src/engine/vectors.ts): its
 * SVG, in ink on white, where the export takes SVG, else a picture of it
 * with the SVG along. Its size is its own, however fine the picture.
 */
const prepareVector = async (
  key: string,
  accepted: ImageMime[],
  drawn: boolean,
): Promise<PreparedImage | null> => {
  const drawing = vectorOf(key);
  if (!drawing) return null;
  const size = { width: drawing.width, height: drawing.height };
  // the engine draws it from the diagram module's drawing: only its size
  if (drawn) {
    return { bytes: new Uint8Array(), mime: "image/svg+xml", ...size };
  }
  const svg = inked(drawing.svg, PRINT_INK);
  const bytes = new TextEncoder().encode(svg);
  if (accepted.includes("image/svg+xml")) {
    return { bytes, mime: "image/svg+xml", ...size };
  }
  const picture = await rasterize(
    new TextEncoder().encode(withFonts(scaled(svg, PICTURE_SCALE))),
    "image/svg+xml",
    { maxEdge: MAX_EDGE, output: "image/png" },
  );
  return { bytes: picture.bytes, mime: "image/png", svg: bytes, ...size };
};

const prepare = async (
  src: string,
  docPath: string | null,
  accepted: ImageMime[],
  drawn: boolean,
): Promise<PreparedImage | null> => {
  if (isVector(src)) return prepareVector(src, accepted, drawn);
  const loaded = await loadImage(src, docPath);
  if ("error" in loaded) {
    console.warn(`failed to load ${imageSource(src)}: ${loaded.error}`);
    return null;
  }
  const { bytes, mime } = loaded;

  // other apps ignore the EXIF orientation of embedded photos, so rotated
  // ones are turned upright here
  const rotated = mime === "image/jpeg" && jpegOrientation(bytes) !== 1;
  // an SVG file goes as a picture: only Blank's own drawings (above) are
  // drawn as vectors, whose fonts and size are known
  const kept = accepted.includes(mime) && mime !== "image/svg+xml";
  if (kept && !rotated) {
    const size = probeSize(bytes, mime) ?? (await decodeSize(bytes, mime));
    return { bytes, mime, ...size };
  }

  const output = mime === "image/jpeg" ? "image/jpeg" : "image/png";
  const converted = await rasterize(bytes, mime, {
    maxEdge: MAX_EDGE,
    output,
    quality: JPEG_QUALITY,
  });
  return {
    bytes: converted.bytes,
    mime: output,
    ...converted.size,
    // a drawing goes along as it is, for what can show it
    ...(mime === "image/svg+xml" ? { svg: bytes } : {}),
  };
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
  // the drawings of Blank's the export draws from the diagram module's
  // drawings, whose bytes it doesn't need (the PDF's)
  { drawings = false }: { drawings?: boolean } = {},
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
    // what a source made, e.g. a diagram, if it could be drawn
    const kind = sourceKind(node.type.name);
    if (kind && renderedOf(node)?.ok === true) {
      const label = (node.attrs.alt as string) || kind.label(node.textContent);
      nodes.set(sourceKeyOf(node), label);
    }
  });

  const images = new Map<string, PreparedImage>();
  const failures: string[] = [];
  await Promise.all(
    [...nodes].map(async ([src, label]) => {
      const drawn = drawings && isVector(src) && drawingOf(src) !== undefined;
      const image = await prepare(src, docPath, accepted, drawn).catch(
        (err) => {
          console.warn(`failed to convert ${imageSource(src)}`, err);
          return null;
        },
      );
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
