import { computed, shallowRef } from "vue";

import { displaySrc } from "../editor/plugins/images";
import { fitBox } from "../images/fit";
import type { Size } from "../images/mime";
import { POINTS_PER_PIXEL } from "../layout/units";
import { isVector, vectorOf } from "./vectors";

// The images of the page view: loaded by the webview once, for their size,
// which the engine lays out with, and for painting them. They are known by
// the url the webview loads them from, since the same relative src stands
// for another file next to another document.

interface Loaded {
  image: HTMLImageElement;
  // in pixels, as the file has it
  width: number;
  height: number;
}

// by url; an image that failed to load is tried again once the document
// moves (see forgetFailures)
const images = new Map<string, Loaded | "loading" | "failed">();

// the urls of the images that finished loading, so the layout and the
// painting follow them; replaced whole with each
export const loadedImages = shallowRef<ReadonlySet<string>>(new Set());

// how many have loaded, for what only needs to know that one did, e.g. the
// page view's painted bitmaps
export const imagesLoaded = computed(() => loadedImages.value.size);

/**
 * loadedImage returns an image that is loaded, and starts loading it
 * otherwise
 * @param docPath the document's file, for relative images, which can't load
 *   until it has one
 */
export const loadedImage = (
  src: string,
  docPath: string | null,
): Loaded | null => {
  const url = displaySrc(src, docPath);
  if (url === null) return null;
  const known = images.get(url);
  if (known === "loading" || known === "failed") return null;
  if (known) return known;
  images.set(url, "loading");
  const image = new Image();
  image.onload = () => {
    images.set(url, {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
    });
    loadedImages.value = new Set([...loadedImages.value, url]);
  };
  image.onerror = () => images.set(url, "failed");
  image.src = url;
  return null;
};

/**
 * fittedSize returns the size an image of `pixels` is laid out at, in
 * points: as large as it prints at 96 dpi, at most as large as the room for
 * the text. The page view and the PDF lay images out alike with it.
 */
export const fittedSize = (
  pixels: Size,
  room: { width: number; height: number },
): Size =>
  fitBox(
    {
      width: pixels.width * POINTS_PER_PIXEL,
      height: pixels.height * POINTS_PER_PIXEL,
    },
    room.width,
    room.height,
  );

/**
 * imageSizes returns the sizes the engine lays images out with, see
 * fittedSize
 */
export const imageSizes =
  (docPath: string | null, room: { width: number; height: number }) =>
  (src: string) => {
    // a drawing of Blank's (./vectors.ts) is no file to load
    const loaded = isVector(src) ? vectorOf(src) : loadedImage(src, docPath);
    return loaded ? fittedSize(loaded, room) : undefined;
  };

/**
 * forgetFailures lets the images that failed load again, e.g. once the
 * document is saved somewhere else
 */
export const forgetFailures = () => {
  for (const [url, known] of images) {
    if (known === "failed") images.delete(url);
  }
};

/**
 * forgetImages forgets the loaded images, e.g. between tests
 */
export const forgetImages = () => {
  images.clear();
  loadedImages.value = new Set();
};
