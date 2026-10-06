import { bandsOn, bandTop, fieldValues, hasText } from "./bands";
import { type Layout, pageGeometry } from "./resolve";
import { SLOTS, type Slots } from "./settings";
import { expand } from "./tokens";

// A small picture of a page for the page setup dialog: the paper in its
// proportions, the margins as a faint frame, grey lines for the text, and
// the header and footer as they read on that page.

// the longer side of the picture, in pixels
const SIZE = 132;
const LINE_GAP = 0.055;
// the text of the header and footer, readable at this size
const BAND_TEXT = 5.5;

// what the placeholders show in the picture
const SAMPLE = { title: "Title", author: "Author", date: "Date", file: "File" };

const round = (value: number) => Math.round(value * 10) / 10;

const escapeXml = (text: string) =>
  text.replace(/[<>&"]/g, (char) => `&#${char.charCodeAt(0)};`);

/**
 * thumbnailSvg draws a page of `layout` as SVG markup
 * @param page the page, counted from 1: the first may be plain
 */
export const thumbnailSvg = (layout: Layout, page = 1): string => {
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

  const values = fieldValues(layout, page, 12, SAMPLE, "Chapter");
  const band = (slots: Slots, y: number) =>
    hasText(slots)
      ? SLOTS.filter((slot) => slots[slot])
          .map((slot) => {
            const x = {
              left: box.x,
              center: round(box.x + box.width / 2),
              right: round(box.x + box.width),
            }[slot];
            const anchor = { left: "start", center: "middle", right: "end" }[
              slot
            ];
            return `<text x="${x}" y="${y}" text-anchor="${anchor}">${escapeXml(expand(slots[slot], values))}</text>`;
          })
          .join("")
      : "";
  // where the pages set them, the text on the line's top
  const { header, footer } = bandsOn(layout, page);
  const baseline = (which: "header" | "footer") =>
    round(bandTop({ height, margins }, which) * scale + BAND_TEXT);
  const bands =
    band(header, baseline("header")) + band(footer, baseline("footer"));

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">` +
    `<rect class="paper" x="0.5" y="0.5" width="${w - 1}" height="${h - 1}"/>` +
    `<rect class="margins" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}"/>` +
    `<g class="text">${lines.join("")}</g>` +
    (bands ? `<g class="band" font-size="${BAND_TEXT}">${bands}</g>` : "") +
    `</svg>`
  );
};
