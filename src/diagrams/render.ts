import { logError } from "../log";
import type { Rendered } from "../sources/registry";
import { sanitizeSvg } from "../markdown/blocks/svg";
import { loadMermaid } from "./mermaid";
import { recolor } from "./recolor";

// A diagram drawn from its source: Mermaid's SVG, in the page's ink
// (./recolor.ts), cleaned as every drawing is (sanitizeSvg), and with its
// own size, where Mermaid writes it as wide as its page.

// the id Mermaid gives the drawing, which its styles are scoped by
const ID = "blank-diagram";

// how many lines of Mermaid's message an error shows
const ERROR_LINES = 3;

/**
 * errorOf returns what Mermaid says is wrong with a source: the first lines
 * of its message, and the line of the source, if it says
 */
export const errorOf = (error: unknown): { error: string; line?: number } => {
  const message =
    error instanceof Error
      ? error.message
      : String(error ?? "it can't be drawn");
  const lines = message
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);
  const line = /\bline (\d+)/i.exec(message)?.[1];
  return {
    error: lines.slice(0, ERROR_LINES).join("\n"),
    ...(line ? { line: Number(line) } : {}),
  };
};

const ROOT = /<svg\b[^>]*>/;

/**
 * sized returns a drawing with its own size, from its viewBox, as `width`
 * and `height` of its root, without the page's width Mermaid gives it
 */
export const sized = (svg: string) => {
  const root = ROOT.exec(svg)?.[0];
  const box = root ? /viewBox="([^"]*)"/.exec(root)?.[1] : undefined;
  const [width, height] = (box?.trim().split(/[\s,]+/) ?? [])
    .slice(2)
    .map(Number);
  if (!root || !(width > 0) || !(height > 0)) return null;
  const resized = root
    .replace(/\s(?:width|height)="[^"]*"/g, "")
    .replace(/\sstyle="[^"]*"/, "")
    .replace(/^<svg/, `<svg width="${width}" height="${height}"`);
  return { svg: svg.replace(root, resized), width, height };
};

// whether Mermaid's failing to load was logged
let toldUnavailable = false;

/**
 * renderDiagram draws a diagram from its source
 */
export const renderDiagram = async (source: string): Promise<Rendered> => {
  let mermaid;
  try {
    mermaid = await loadMermaid();
  } catch (error) {
    // once, by its kind only: the diagram's text never goes into the log
    if (!toldUnavailable) {
      toldUnavailable = true;
      logError(
        "Mermaid didn't load",
        error instanceof Error ? error.name : "error",
      );
    }
    return {
      ok: "unavailable",
      reason: `Diagrams can't be drawn here: ${errorOf(error).error}`,
    };
  }
  try {
    await mermaid.parse(source);
    const { svg } = await mermaid.render(ID, source);
    const drawn = sized(sanitizeSvg(recolor(svg, source)) ?? "");
    if (!drawn) return { ok: false, error: "It can't be drawn." };
    return { ok: true, data: drawn };
  } catch (error) {
    return { ok: false, ...errorOf(error) };
  } finally {
    // what Mermaid leaves in the page after an error
    document.getElementById(`d${ID}`)?.remove();
  }
};
