import {
  decodePixels,
  drawPixels,
  encodePng,
  inkOfText,
  type Pixels,
} from "../images/codec";
import { toDataUrl } from "../images/dataUrl";
import { removeBackground, trim } from "./ink";
import { drawStrokes, PAD_HEIGHT, PAD_WIDTH } from "./pad";
import type { MarkSource, SavedMark } from "./profile";
import { loadSignatureFont, type SignatureFont } from "./fonts";

// Makes the picture of a signature or initials, however they were made: a
// transparent PNG of the ink alone, which every page and file shows.

// the colour of the ink, a ballpoint's blue-black, on paper as on the screen
const INK = "#1d2b6b";
// how much larger than the pad's units the picture is drawn, for print
const SCALE = 2;
// the size a typed name is set in, as a share of the pad's height
const TYPE_SIZE = 0.42;
// the longest edge of a picture from a file
const IMAGE_EDGE = 2000;
// the widest a typed signature is drawn, longer names cut, in pixels
const MAX_WIDTH = 8000;

/**
 * typed draws a typed name in its font, on a canvas as large as its ink
 * with some room around it: swashes past the letters and long names too
 */
const typed = async (text: string, font: SignatureFont) => {
  await loadSignatureFont(font);
  const css = `${Math.round(PAD_HEIGHT * SCALE * TYPE_SIZE)}px "${font}"`;
  const ink = inkOfText(css, text);
  const room = Math.round(PAD_HEIGHT * SCALE * 0.05);
  const width = Math.ceil(ink.left + ink.right) + 2 * room;
  const height = Math.ceil(ink.ascent + ink.descent) + 2 * room;
  return drawPixels(Math.min(width, MAX_WIDTH), height, (context) => {
    context.font = css;
    context.fillStyle = INK;
    context.textBaseline = "alphabetic";
    context.fillText(text, room + ink.left, room + ink.ascent);
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
    pixels = await typed(source.text.trim(), source.font);
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
