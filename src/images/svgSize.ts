// the root of an SVG drawing
const ROOT = /<svg\b[^>]*>/;

/**
 * rootSize returns the width and height an SVG drawing's root gives, 0 for
 * one it doesn't
 */
export const rootSize = (svg: string) => {
  const root = ROOT.exec(svg)?.[0] ?? "";
  const at = (name: string) =>
    Number(new RegExp(`\\s${name}="([\\d.]+)"`).exec(root)?.[1] ?? 0);
  return { width: at("width"), height: at("height") };
};

/**
 * withSize returns an SVG drawing whose root is `width` by `height`, in
 * place of the size it gave
 */
export const withSize = (svg: string, width: number, height: number) =>
  svg.replace(ROOT, (root) =>
    root
      .replace(/\s(?:width|height)="[^"]*"/g, "")
      .replace(/^<svg/, `<svg width="${width}" height="${height}"`),
  );
