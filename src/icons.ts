// Line icons for the table toolbar, drawn on a 20 × 20 grid with round ends
// in the text colour, so they follow the theme.

const TABLE_ICONS: Record<string, string> = {
  "row-above": "M4 9h12v8H4z M4 13h12 M10 2v5 M7.5 4.5h5",
  "row-below": "M4 3h12v8H4z M4 7h12 M10 13v5 M7.5 15.5h5",
  "row-delete": "M4 9h12v8H4z M4 13h12 M7.5 4.5h5",
  "column-left": "M9 4h8v12H9z M13 4v12 M2 10h5 M4.5 7.5v5",
  "column-right": "M3 4h8v12H3z M7 4v12 M13 10h5 M15.5 7.5v5",
  "column-delete": "M9 4h8v12H9z M13 4v12 M2 10h5",
  "row-up": "M10 11V3 M7 6l3-3 3 3 M4 14h12 M4 17h12",
  "row-down": "M10 9v8 M7 14l3 3 3-3 M4 3h12 M4 6h12",
  "column-back": "M11 10H3 M6 7l-3 3 3 3 M14 4v12 M17 4v12",
  "column-forward": "M9 10h8 M14 7l3 3-3 3 M3 4v12 M6 4v12",
  "align-left": "M3 5h14 M3 9h9 M3 13h14 M3 17h9",
  "align-center": "M3 5h14 M5.5 9h9 M3 13h14 M5.5 17h9",
  "align-right": "M3 5h14 M8 9h9 M3 13h14 M8 17h9",
  sort: "M6 4v12 M3 13l3 3 3-3 M14 16V4 M11 7l3-3 3 3",
  merge:
    "M3 4h14v12H3z M5 10h3.5 M7 8l1.5 2L7 12 M15 10h-3.5 M13 8l-1.5 2 1.5 2",
  "header-row": "M3 4h14v12H3z M3 8h14 M5.5 6h9",
  "header-column": "M3 4h14v12H3z M7 4v12 M5 6.5v7",
  caption: "M4 4h12 M4 7h7 M3 10h14v6H3z",
  "table-delete": "M4 6h12 M8 6V4h4v2 M6 6l1 10h6l1-10 M9 9v4.5 M11 9v4.5",
};

const SVG = "http://www.w3.org/2000/svg";

/**
 * icon returns the icon `name` as an SVG element, hidden from screen readers,
 * since its button is labelled
 */
export const icon = (name: string): SVGSVGElement => {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("icon");
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("d", TABLE_ICONS[name] ?? "");
  svg.appendChild(path);
  return svg;
};

export const iconNames = Object.keys(TABLE_ICONS);
