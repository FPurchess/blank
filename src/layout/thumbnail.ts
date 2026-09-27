import { type Layout, pageGeometry } from "./resolve";

// A small picture of the page for the page setup dialog: the paper in its
// proportions, the margins as a faint frame and grey lines for the text.

// the longer side of the picture, in pixels
const SIZE = 132;
const LINE_GAP = 0.055;

const round = (value: number) => Math.round(value * 10) / 10;

/**
 * thumbnailSvg draws the page of `layout` as SVG markup
 */
export const thumbnailSvg = (layout: Layout): string => {
  const { width, height, margins } = pageGeometry(layout);
  const scale = SIZE / Math.max(width, height);
  const [w, h] = [round(width * scale), round(height * scale)];
  const box = {
    x: round(margins.left * scale),
    y: round(margins.top * scale),
    width: round((width - margins.left - margins.right) * scale),
    height: round((height - margins.top - margins.bottom) * scale),
  };

  const gap = SIZE * LINE_GAP;
  const lines: string[] = [];
  for (let y = box.y + gap / 2, i = 0; y < box.y + box.height; y += gap, i++) {
    // a shorter last line every few lines, like paragraphs
    const length = i % 5 === 4 ? box.width * 0.6 : box.width;
    lines.push(
      `<line x1="${box.x}" y1="${round(y)}" x2="${round(box.x + length)}" y2="${round(y)}"/>`,
    );
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">` +
    `<rect class="paper" x="0.5" y="0.5" width="${w - 1}" height="${h - 1}"/>` +
    `<rect class="margins" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}"/>` +
    `<g class="text">${lines.join("")}</g>` +
    `</svg>`
  );
};
