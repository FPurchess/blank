import { shallowRef } from "vue";

import { displaySrc } from "../editor/plugins/images";
import { fitBox } from "../images/fit";
import { POINTS_PER_PIXEL } from "../layout/units";

// The images of the page view: loaded by the webview once, for their size,
// which the engine lays out with, and for painting them.

interface Loaded {
  image: HTMLImageElement;
  // in points, before the engine fits it into the room it has
  width: number;
  height: number;
}

const images = new Map<string, Loaded | "loading" | "failed">();

// counts the images that finished loading, so the layout and the painting
// follow them
export const imagesLoaded = shallowRef(0);

/**
 * loadedImage returns an image that is loaded, and starts loading it
 * otherwise
 * @param docPath the document's file, for relative images
 */
export const loadedImage = (
  src: string,
  docPath: string | null,
): Loaded | null => {
  const known = images.get(src);
  if (known === "loading" || known === "failed") return null;
  if (known) return known;
  const url = displaySrc(src, docPath);
  if (url === null) {
    images.set(src, "failed");
    return null;
  }
  images.set(src, "loading");
  const image = new Image();
  image.onload = () => {
    images.set(src, {
      image,
      width: image.naturalWidth * POINTS_PER_PIXEL,
      height: image.naturalHeight * POINTS_PER_PIXEL,
    });
    imagesLoaded.value += 1;
  };
  image.onerror = () => images.set(src, "failed");
  image.src = url;
  return null;
};

/**
 * imageSizes returns the sizes the engine lays images out with: as large
 * as in the PDF, at most as large as the room for the text
 */
export const imageSizes =
  (docPath: string | null, room: { width: number; height: number }) =>
  (src: string) => {
    const loaded = loadedImage(src, docPath);
    return loaded ? fitBox(loaded, room.width, room.height) : undefined;
  };

/**
 * forgetImages forgets the loaded images, e.g. between tests
 */
export const forgetImages = () => images.clear();
