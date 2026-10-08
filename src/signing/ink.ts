import type { Pixels } from "../images/codec";

// The ink of a signature's picture: a photo or scan of a signature on paper
// keeps only the ink, with the paper made transparent, and every picture of
// a signature is trimmed to its ink.

/**
 * lightness returns how light a pixel is, 0 to 255, by Rec. 601's weights
 */
const lightness = (data: Uint8ClampedArray, offset: number) =>
  0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];

/**
 * otsu splits the opaque pixels into ink and paper by their lightness
 * (Otsu's method: the split with the most variance between the two) and
 * returns how light each is on average
 */
const otsu = (pixels: Pixels) => {
  const histogram = new Array<number>(256).fill(0);
  let count = 0;
  for (let offset = 0; offset < pixels.data.length; offset += 4) {
    if (pixels.data[offset + 3] < 128) continue;
    histogram[Math.round(lightness(pixels.data, offset))]++;
    count++;
  }
  const total = histogram.reduce((sum, n, level) => sum + n * level, 0);
  let best = { between: -1, ink: 0, paper: 255 };
  let [darker, darkSum] = [0, 0];
  for (let level = 0; level < 256; level++) {
    darker += histogram[level];
    darkSum += histogram[level] * level;
    const lighter = count - darker;
    if (darker === 0 || lighter === 0) continue;
    const ink = darkSum / darker;
    const paper = (total - darkSum) / lighter;
    const between = darker * lighter * (paper - ink) ** 2;
    if (between > best.between) best = { between, ink, paper };
  }
  // a picture of one lightness is all paper
  if (best.between < 0) {
    const level = count ? total / count : 255;
    return { ink: level, paper: level };
  }
  return { ink: best.ink, paper: best.paper };
};

/**
 * removeBackground makes the paper transparent and keeps the ink in its own
 * colour: a pixel as dark as the ink is opaque, one as light as the paper
 * transparent, and those between fade, so the edges stay smooth
 */
export const removeBackground = (pixels: Pixels): Pixels => {
  const { ink, paper } = otsu(pixels);
  const data = new Uint8ClampedArray(pixels.data);
  const range = paper - ink;
  for (let offset = 0; offset < data.length; offset += 4) {
    const opacity =
      range < 1
        ? 0
        : Math.min(1, Math.max(0, (paper - lightness(data, offset)) / range));
    data[offset + 3] = Math.round(data[offset + 3] * opacity);
  }
  return { data, width: pixels.width, height: pixels.height };
};

/**
 * inkBox returns the box of the pixels that aren't transparent, or null for
 * a picture without ink
 */
const inkBox = ({ data, width, height }: Pixels) => {
  let [left, top, right, bottom] = [width, height, -1, -1];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  return right < 0
    ? null
    : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
};

/**
 * trim returns the pixels of the ink with `margin` pixels around, or null
 * for a picture without ink
 */
export const trim = (pixels: Pixels, margin = 4): Pixels | null => {
  const box = inkBox(pixels);
  if (!box) return null;
  const x0 = Math.max(0, box.x - margin);
  const y0 = Math.max(0, box.y - margin);
  const x1 = Math.min(pixels.width, box.x + box.width + margin);
  const y1 = Math.min(pixels.height, box.y + box.height + margin);
  const width = x1 - x0;
  const height = y1 - y0;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const from = ((y0 + y) * pixels.width + x0) * 4;
    data.set(pixels.data.subarray(from, from + width * 4), y * width * 4);
  }
  return { data, width, height };
};
