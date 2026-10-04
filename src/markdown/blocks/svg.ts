// Cleaning SVG that comes from files and the clipboard, e.g. the cached
// rendering of an embedded drawing (see ./embeds.ts), before Blank shows it:
// only what draws stays. Scripts, foreignObject, event handlers and links
// to anything but the drawing itself, or an embedded picture, go. Blank only
// ever shows the result as an image, which doesn't run scripts either; this
// keeps the file it writes clean too.

const SVG = "http://www.w3.org/2000/svg";
const XLINK = "http://www.w3.org/1999/xlink";

// the most characters of SVG Blank keeps
export const MAX_SVG = 2 * 1024 * 1024;

// the elements that draw, by their local name
const ELEMENTS = new Set([
  "svg",
  "g",
  "defs",
  "symbol",
  "use",
  "title",
  "desc",
  "metadata",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "textPath",
  "image",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "mask",
  "pattern",
  "marker",
  "filter",
  "feBlend",
  "feColorMatrix",
  "feComposite",
  "feFlood",
  "feGaussianBlur",
  "feMerge",
  "feMergeNode",
  "feOffset",
  "style",
]);

// a link that stays in the drawing, or a picture embedded in it
const LOCAL = /^#/;
const PICTURE = /^data:image\/(png|jpeg|gif|webp);base64,/i;

/**
 * cleanStyle keeps a style sheet or an attribute to the drawing: no imports,
 * and no url() but the drawing's own and embedded fonts or pictures
 */
const cleanStyle = (css: string) =>
  css
    .replace(/@import[^;]*;?/gi, "")
    .replace(/url\(\s*(['"]?)(?!#|data:(?:image|font)\/)[^)]*\)/gi, "none");

/**
 * clean removes from `element` what doesn't draw, see the comment on top
 */
const clean = (element: Element) => {
  for (const child of [...element.children]) {
    if (child.namespaceURI !== SVG || !ELEMENTS.has(child.localName)) {
      child.remove();
    } else clean(child);
  }
  for (const attribute of [...element.attributes]) {
    const name = attribute.localName.toLowerCase();
    const value = attribute.value.trim();
    const link =
      name === "href" &&
      (attribute.namespaceURI === XLINK || attribute.namespaceURI === null);
    if (
      name.startsWith("on") ||
      (link &&
        !LOCAL.test(value) &&
        !(element.localName === "image" && PICTURE.test(value)))
    ) {
      element.removeAttributeNode(attribute);
    } else {
      // style, and presentation attributes such as fill="url(…)"
      attribute.value = cleanStyle(attribute.value);
    }
  }
  if (element.localName === "style") {
    element.textContent = cleanStyle(element.textContent ?? "");
  }
};

/**
 * sanitizeSvg returns `svg` with only what draws in it, or null if it isn't
 * an SVG drawing Blank keeps
 */
export const sanitizeSvg = (svg: string): string | null => {
  if (svg.length > MAX_SVG) return null;
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  if (
    doc.getElementsByTagName("parsererror").length > 0 ||
    root.namespaceURI !== SVG ||
    root.localName !== "svg"
  ) {
    return null;
  }
  clean(root);
  return new XMLSerializer().serializeToString(root);
};
