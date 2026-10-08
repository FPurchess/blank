import {
  decodePixels,
  drawPixels,
  encodePng,
  type Pixels,
} from "../images/codec";
import { toDataUrl } from "../images/dataUrl";
import { removeBackground, trim } from "./ink";
import { drawStrokes, PAD_HEIGHT, PAD_WIDTH, BASELINE } from "./pad";
import type { MarkSource, SavedMark } from "./profile";
import { loadSignatureFont } from "./fonts";

// Makes the picture of a signature or initials, however they were made: a
// transparent PNG of the ink alone, which every page and file shows.

// the colour of the ink, a ballpoint's blue-black, on paper as on the screen
export const INK = "#1d2b6b";
// how much larger than the pad's units the picture is drawn, for print
const SCALE = 2;
// the size a typed name is set in, as a share of the pad's height
const TYPE_SIZE = 0.42;
// the longest edge of a picture from a file
const IMAGE_EDGE = 2000;

/**
 * typed draws a typed name in its font on the pad's baseline
 */
const typed = async (text: string, font: MarkSource & { kind: "type" }) => {
  await loadSignatureFont(font.font);
  const width = PAD_WIDTH * SCALE * 2;
  const height = PAD_HEIGHT * SCALE;
  return drawPixels(width, height, (context) => {
    context.font = `${Math.round(height * TYPE_SIZE)}px "${font.font}"`;
    context.fillStyle = INK;
    context.textBaseline = "alphabetic";
    context.fillText(text, height * 0.1, height * BASELINE);
  });
};

/**
 * renderMark makes the picture of a signature from how it was made; an
 * image's bytes come with it, its background removed if `clean` says so.
 * Null when there's no ink, e.g. an empty pad.
 */
export const renderMark = async (
  source: MarkSource,
  image?: { bytes: Uint8Array; mime: string; clean: boolean },
): Promise<SavedMark | null> => {
  let pixels: Pixels;
  if (source.kind === "draw") {
    pixels = drawPixels(PAD_WIDTH * SCALE, PAD_HEIGHT * SCALE, (context) =>
      drawStrokes(context, source.strokes, SCALE, INK),
    );
  } else if (source.kind === "type") {
    if (!source.text.trim()) return null;
    pixels = await typed(source.text.trim(), source);
  } else {
    if (!image) return null;
    const decoded = await decodePixels(image.bytes, image.mime, IMAGE_EDGE);
    pixels = image.clean ? removeBackground(decoded) : decoded;
  }
  const ink = trim(pixels);
  if (!ink) return null;
  const png = await toDataUrl(await encodePng(ink), "image/png");
  return { source, png, width: ink.width, height: ink.height };
};
