// A diagram in the page's ink: Mermaid draws in its theme's colours and in
// colours of its own (#333 lines, yellow notes), which would be unreadable
// on a dark page. So every colour is drawn in the ink, as strong as the
// colour is dark: black text and lines in full ink, a pale fill as a faint
// tint of it, white not at all. It's written `ink(0.42)`, which `inked` in
// src/engine/vectors.ts makes the ink of the screen's theme, or of the PDF
// and Word, at that strength. The colours the author gave
// in the source (`style`, `classDef`, `linkStyle`, a `%%{init}%%` directive)
// stay as they are, so a node the author marked still stands out.

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

// the named colours Mermaid writes itself, and those authors use most
const NAMED: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  gray: "#808080",
  grey: "#808080",
  lightgray: "#d3d3d3",
  lightgrey: "#d3d3d3",
  darkgray: "#a9a9a9",
  darkgrey: "#a9a9a9",
  silver: "#c0c0c0",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  yellow: "#ffff00",
  orange: "#ffa500",
  purple: "#800080",
  pink: "#ffc0cb",
  lightblue: "#add8e6",
  lightgreen: "#90ee90",
  lightyellow: "#ffffe0",
  aqua: "#00ffff",
  cyan: "#00ffff",
  magenta: "#ff00ff",
  fuchsia: "#ff00ff",
  lime: "#00ff00",
  navy: "#000080",
  teal: "#008080",
  olive: "#808000",
  maroon: "#800000",
  brown: "#a52a2a",
  gold: "#ffd700",
  coral: "#ff7f50",
  salmon: "#fa8072",
  violet: "#ee82ee",
  indigo: "#4b0082",
  khaki: "#f0e68c",
  beige: "#f5f5dc",
  ivory: "#fffff0",
  lavender: "#e6e6fa",
  whitesmoke: "#f5f5f5",
  gainsboro: "#dcdcdc",
};

const NAMES = Object.keys(NAMED).join("|");

// a colour as CSS writes it
const COLOR = new RegExp(
  String.raw`#[0-9a-f]{8}\b|#[0-9a-f]{6}\b|#[0-9a-f]{3,4}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\b(?:${NAMES})\b`,
  "gi",
);

const number = (text: string, scale = 1) =>
  text.trim().endsWith("%")
    ? (parseFloat(text) / 100) * scale
    : parseFloat(text);

const hex = (text: string): Rgba => {
  const digits =
    text.length <= 5 ? [...text.slice(1)].map((digit) => digit + digit) : null;
  const pairs = digits ?? text.slice(1).match(/../g)!;
  const [r, g, b, a = "ff"] = pairs;
  return {
    r: parseInt(r, 16),
    g: parseInt(g, 16),
    b: parseInt(b, 16),
    a: parseInt(a, 16) / 255,
  };
};

const hslToRgb = (h: number, s: number, l: number) => {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((value) => Math.round(value * 255));
};

/**
 * parseColor reads a CSS colour, or returns null for what isn't one this
 * knows
 */
export const parseColor = (text: string): Rgba | null => {
  const color = text.trim().toLowerCase();
  if (NAMED[color]) return hex(NAMED[color]);
  if (/^#[0-9a-f]+$/.test(color) && [4, 5, 7, 9].includes(color.length)) {
    return hex(color);
  }
  const fn = /^(rgba?|hsla?)\((.*)\)$/.exec(color);
  if (!fn) return null;
  const parts = fn[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const alpha = parts[3] === undefined ? 1 : number(parts[3], 1);
  if (fn[1].startsWith("rgb")) {
    const [r, g, b] = parts.slice(0, 3).map((part) => number(part, 255));
    return { r, g, b, a: alpha };
  }
  const [r, g, b] = hslToRgb(
    parseFloat(parts[0]),
    number(parts[1], 1) / (parts[1].endsWith("%") ? 1 : 100),
    number(parts[2], 1) / (parts[2].endsWith("%") ? 1 : 100),
  );
  return { r, g, b, a: alpha };
};

const keyOf = ({ r, g, b, a }: Rgba) =>
  [r, g, b].map(Math.round).join(",") + `,${Math.round(a * 100)}`;

/**
 * authorColors returns the colours the author gave in a diagram's source
 */
export const authorColors = (source: string): Set<string> => {
  const colors = new Set<string>();
  for (const line of source.split("\n")) {
    if (!/^\s*(?:style|classDef|linkStyle|%%\{)/.test(line)) continue;
    for (const match of line.matchAll(COLOR)) {
      const color = parseColor(match[0]);
      if (color) colors.add(keyOf(color));
    }
  }
  return colors;
};

// the properties whose colour is drawn in ink
const PROPERTIES = ["fill", "stroke", "stop-color", "flood-color", "color"];

/**
 * inkOf writes the ink at a strength, see the comment on top
 */
export const inkOf = (strength: number) => `ink(${strength})`;

/**
 * strength returns how strong a colour is drawn in ink: as it is dark, by
 * its relative luminance, times its own alpha
 */
export const strength = ({ r, g, b, a }: Rgba) => {
  const lightness = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return Math.round((1 - lightness) * a * 100) / 100;
};

const PROPERTY = PROPERTIES.join("|");
// `fill="#e8e8e8"`, as an attribute
const ATTRIBUTE = new RegExp(String.raw`\b(${PROPERTY})="([^"]*)"`, "g");
// `fill:#e8e8e8`, in a style attribute or rule
const DECLARATION = new RegExp(
  String.raw`(^|[;{\s"])(${PROPERTY})\s*:\s*([^;}"!]+?)\s*(!important)?(?=[;}"])`,
  "g",
);

// the markup of an SVG, its tags and the rules of its <style>, apart from
// its text: what is between the tags, e.g. a label, is left as it is
const MARKUP = /(<style\b[^>]*>[\s\S]*?<\/style>|<[^>]+>)/;

/**
 * inMarkup returns `svg` with `replace` applied to its tags and styles only,
 * never to the text of its labels
 */
export const inMarkup = (svg: string, replace: (markup: string) => string) =>
  svg
    .split(MARKUP)
    .map((part, index) => (index % 2 === 1 ? replace(part) : part))
    .join("");

/**
 * recolor returns a diagram's SVG with its colours in ink, see the comment
 * on top; `source` gives the author's colours
 */
export const recolor = (svg: string, source: string): string => {
  const authors = authorColors(source);
  // what a colour becomes: the ink at a strength, or as it was
  const inked = (value: string) => {
    const color = parseColor(value);
    if (!color || authors.has(keyOf(color))) return null;
    return strength(color);
  };
  return inMarkup(svg, (markup) =>
    markup
      .replace(ATTRIBUTE, (whole, property, value) => {
        const ink = inked(value);
        return ink === null ? whole : `${property}="${inkOf(ink)}"`;
      })
      .replace(
        DECLARATION,
        (whole, before: string, property: string, value: string, important) => {
          const ink = inked(value);
          if (ink === null) return whole;
          return `${before}${property}:${inkOf(ink)}${important ? " !important" : ""}`;
        },
      ),
  );
};
