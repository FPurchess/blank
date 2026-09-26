import { rasterize } from "./codec";
import { type ImageMime, jpegOrientation, probeSize, sniffMime } from "./mime";

// Imported images are kept inside the markdown file as data: URLs, so they
// are scaled down to a size that still prints well at page width.
export const MAX_EDGE = 2000;
const JPEG_QUALITY = 0.85;

// what the markdown parser keeps as data: URL, see markdown-it's validateLink
const KEPT_AS_IS: ImageMime[] = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];
// vector formats of Word that the webview can't decode
const UNDECODABLE: ImageMime[] = ["image/x-emf", "image/x-wmf"];

const isMime = (value: string): value is ImageMime =>
  value.startsWith("image/");

/**
 * optimizeForMarkdown prepares an imported image for a data: URL: images too
 * large to keep in the document are scaled down, rotated photos turned
 * upright, and formats the markdown parser drops (e.g. SVG) turned into PNG.
 * Photos stay JPEG, everything else becomes PNG to keep transparency.
 * @param bytes the image
 * @param contentType the type the .docx declares, for images without a known signature
 * @returns the image to embed, or null if it can't be decoded (e.g. EMF)
 */
export const optimizeForMarkdown = async (
  bytes: Uint8Array,
  contentType: string | null,
): Promise<{ bytes: Uint8Array; mime: ImageMime } | null> => {
  const declared = contentType?.toLowerCase() ?? "";
  const mime = sniffMime(bytes) ?? (isMime(declared) ? declared : null);
  if (!mime || UNDECODABLE.includes(mime)) return null;

  const size = probeSize(bytes, mime);
  const upright = mime !== "image/jpeg" || jpegOrientation(bytes) === 1;
  if (
    KEPT_AS_IS.includes(mime) &&
    upright &&
    size &&
    Math.max(size.width, size.height) <= MAX_EDGE
  ) {
    return { bytes, mime };
  }

  const output = mime === "image/jpeg" ? "image/jpeg" : "image/png";
  try {
    const converted = await rasterize(bytes, mime, {
      maxEdge: MAX_EDGE,
      output,
      quality: JPEG_QUALITY,
    });
    return { bytes: converted.bytes, mime: output };
  } catch (err) {
    console.warn(`failed to convert an imported ${mime} image`, err);
    return null;
  }
};
