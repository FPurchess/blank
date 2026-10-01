import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// How the themes' colours read against each other, for the tests that keep
// the page view legible in every theme: the colours as the theme files set
// them, and their WCAG contrast.

// red, green and blue from 0 to 1
export type Rgb = [number, number, number];

const THEMES = resolve(import.meta.dirname, "themes");

/**
 * parseColor reads a CSS colour: #rgb, #rrggbb, rgb() or rgba(), the last
 * over `background`
 */
export const parseColor = (value: string, background?: Rgb): Rgb => {
  const text = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const digits =
      hex[1].length === 3
        ? [...hex[1]].map((digit) => digit + digit)
        : (hex[1].match(/../g) as string[]);
    return digits.map((pair) => parseInt(pair, 16) / 255) as Rgb;
  }
  const rgb = /^rgba?\(([^)]*)\)$/i.exec(text);
  if (rgb) {
    const [r, g, b, a = 1] = rgb[1].split(",").map(Number);
    if ([r, g, b, a].some(Number.isNaN))
      throw new Error(`not a colour: ${value}`);
    const color: Rgb = [r / 255, g / 255, b / 255];
    return a === 1 ? color : mix(color, background ?? [0, 0, 0], a);
  }
  throw new Error(`not a colour: ${value}`);
};

/**
 * mix returns `a` at `amount` over `b`
 */
export const mix = (a: Rgb, b: Rgb, amount: number): Rgb =>
  a.map((channel, index) => channel * amount + b[index] * (1 - amount)) as Rgb;

export const luminance = (color: Rgb) => {
  const [r, g, b] = color.map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * contrast returns the WCAG contrast ratio of two colours, from 1 to 21
 */
export const contrast = (a: Rgb, b: Rgb) => {
  const [dark, light] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (light + 0.05) / (dark + 0.05);
};

/**
 * themeVariables returns the custom properties a theme file sets, as
 * written
 */
export const themeVariables = (theme: string) => {
  const source = readFileSync(resolve(THEMES, `_${theme}.scss`), "utf8");
  const variables: Record<string, string> = {};
  for (const [, name, value] of source.matchAll(
    /^\s*--([\w-]+):\s*([^;]+);/gm,
  )) {
    variables[name] = value.trim();
  }
  return variables;
};

/**
 * scssNumber reads a number an SCSS file sets as a variable, e.g.
 * `$page-end-opacity: 0.6;`
 */
export const scssNumber = (file: string, name: string) => {
  const source = readFileSync(resolve(import.meta.dirname, file), "utf8");
  const found = new RegExp(`\\$${name}:\\s*([\\d.]+)`).exec(source);
  if (!found) throw new Error(`$${name} isn't set in ${file}`);
  return Number(found[1]);
};
