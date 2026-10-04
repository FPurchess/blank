// Line icons on a 24 × 24 grid, drawn with a 1.5 stroke, round ends and no
// fill in the text color, so they follow the theme (see
// .claude/rules/design.md). IconGlyph (src/ui/components) draws them.

const ICONS: Record<string, string> = {
  bold: "M7 5h5.5a3.5 3.5 0 0 1 0 7H7z M7 12h6.5a3.5 3.5 0 0 1 0 7H7z",
  italic: "M19 4h-9 M14 20H5 M15 4 9 20",
  underline: "M7 4v6a5 5 0 0 0 10 0V4 M5 20h14",
  code: "m16 18 6-6-6-6 M8 6l-6 6 6 6",
  link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  heading: "M6 4v16 M18 4v16 M6 12h12",
  type: "M4 7V5h16v2 M12 5v14 M9 19h6",
  list: "M9 6h11 M9 12h11 M9 18h11 M4.5 6h.01 M4.5 12h.01 M4.5 18h.01",
  "list-ordered":
    "M10 6h10 M10 12h10 M10 18h10 M4 4h1v4 M4 8h2 M6 19H4c0-1.2 2-1.8 2-3a1 1 0 0 0-2-.2",
  quote: "M17 6H3 M21 12H8 M21 18H8 M3 12v6",
  indent: "M3 5h18 M11 10h10 M11 14h10 M3 19h18 M3 9l4 3-4 3",
  outdent: "M3 5h18 M11 10h10 M11 14h10 M3 19h18 M7 9l-4 3 4 3",
  plus: "M12 5v14 M5 12h14",
  minus: "M5 12h14",
  x: "M18 6 6 18 M6 6l12 12",
  check: "M20 6 9 17l-5-5",
  "chevron-down": "m6 9 6 6 6-6",
  "chevron-right": "m9 18 6-6-6-6",
  "chevron-left": "m15 18-6-6 6-6",
  image:
    "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M21 15l-5-5L5 21 M9 7a2 2 0 1 1 0 4 2 2 0 0 1 0-4z",
  table:
    "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M3 9h18 M3 15h18 M12 3v18",
  "page-break":
    "M5 9V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4 M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4 M3 12h2 M8 12h3 M13 12h3 M19 12h2",
  rule: "M3 12h18 M8 7h8 M8 17h8",
  blocks:
    "M4 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z M14 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z M4 15a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z M17 14v6 M14 17h6",
  folder:
    "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  "folder-plus":
    "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M12 10v6 M9 13h6",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5",
  "file-text":
    "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M9 13h6 M9 17h6",
  "file-plus":
    "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M12 11v6 M9 14h6",
  "folder-open":
    "M3 7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v1 M3 7v10a2 2 0 0 0 2 2h12.5a2 2 0 0 0 1.9-1.4L21.5 12H7.2a2 2 0 0 0-1.9 1.4L3 19",
  sidebar:
    "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 3v18",
  outline: "M4 6h16 M8 12h12 M8 18h9",
  export: "M12 15V3 M7 8l5-5 5 5 M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6",
  search: "M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14z M20 20l-4.3-4.3",
  undo: "M9 14 4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  redo: "M15 14l5-5-5-5 M20 9H9.5a5.5 5.5 0 0 0 0 11H13",
  sun: "M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M6.3 17.7l-1.4 1.4 M19.1 4.9l-1.4 1.4",
  moon: "M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z",
  settings:
    "M4 6h9 M17 6h3 M4 12h3 M11 12h9 M4 18h11 M19 18h1 M15 4v4 M9 10v4 M17 16v4",
  keyboard:
    "M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M7 9h.01 M11 9h.01 M15 9h.01 M7 13h.01 M17 13h.01 M9 15.5h6",
  help: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3 M12 17h.01",
  info: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z M12 16v-4 M12 8h.01",
  spell: "M3 16 6.5 6l3.5 10 M4.4 12.5h4.2 M13 15l3 3 5-6",
  globe:
    "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z M3 12h18 M12 3a14 14 0 0 1 0 18 M12 3a14 14 0 0 0 0 18",
  "zoom-in":
    "M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14z M20 20l-4.3-4.3 M8 11h6 M11 8v6",
  "zoom-out": "M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14z M20 20l-4.3-4.3 M8 11h6",
  pages:
    "M8 3h9a2 2 0 0 1 2 2v12 M5 7h9a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z",
  "page-ends":
    "M6 3v7 M18 3v7 M6 14v7 M18 14v7 M3 12h2 M8 12h3 M13 12h3 M19 12h2",
  page: "M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M8.5 8h7 M8.5 12h7 M8.5 16h4",
  focus:
    "M3 8V5a2 2 0 0 1 2-2h3 M16 3h3a2 2 0 0 1 2 2v3 M21 16v3a2 2 0 0 1-2 2h-3 M8 21H5a2 2 0 0 1-2-2v-3 M12 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4z",
  more: "M5 12h.01 M12 12h.01 M19 12h.01",
  trash:
    "M4 7h16 M10 11v6 M14 11v6 M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13 M9 7V4h6v3",
  pencil: "M4 20h4L19 9l-4-4L4 16z M14 6l4 4",
  copy: "M9 9h11v11H9z M5 15H4V4h11v1",
  cut: "M6 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6z M6 15a3 3 0 1 1 0 6 3 3 0 0 1 0-6z M8.1 8.1 20 20 M8.1 15.9 20 4",
  paste:
    "M9 3h6v3H9z M9 4.5H6a1 1 0 0 0-1 1V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5.5a1 1 0 0 0-1-1h-3",
  "align-left": "M4 6h16 M4 12h10 M4 18h14",
  "align-center": "M4 6h16 M7 12h10 M5 18h14",
  "align-right": "M4 6h16 M10 12h10 M6 18h14",
  "row-plus": "M3 4h18v7H3z M12 15v6 M9 18h6",
  "col-plus": "M4 3h7v18H4z M15 12h6 M18 9v6",
  sort: "M7 4v16 M3 16l4 4 4-4 M14 6h7 M14 12h5 M14 18h3",
  merge: "M4 4h16v16H4z M12 4v5 M12 15v5 M9 12h6",
  "header-row":
    "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M3 9h18 M6 6h12",
  toc: "M4 5h16 M6 10h9 M19 10h.01 M6 14h7 M19 14h.01 M6 18h9 M19 18h.01",
  columns:
    "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M12 3v18",
  flow: "M3 3h6v5H3z M15 3h6v5h-6z M9 16h6v5H9z M6 8v3h12V8 M12 11v5",
  shapes:
    "M3 14h7v7H3z M17.5 3a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z M14 21l3.5-6 3.5 6z",
  sketch: "M3 17c3-1 4-6 7-6s2 5 5 5 3-4 6-6 M4 21h16",
  sigma: "M18 7V4H6l6 8-6 8h12v-3",
  chart: "M3 3v18h18 M8 17v-5 M13 17V8 M18 17v-9",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5",
  qr: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h3v3h-3z M20.5 14v.01 M14 20.5h.01 M17 17h4v4h-4z",
  pin: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z M12 7.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z",
  embed:
    "M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M10 9l5 3-5 3z",
  form: "M3 5h18v5H3z M3 14h18v5H3z M6 7.5h5 M6 16.5h7",
  save: "M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M7 3v5h8V3 M7 21v-7h10v7",
  palette:
    "M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4.1-4-7.7-9-7.7z M7.5 11h.01 M10 7.5h.01 M14.5 7.5h.01",
  pinned: "M12 17v5 M9 3h6l-1 6 3 3v2H7v-2l3-3z",
  header: "M5 3h14v18H5z M5 8h14 M8 5.5h8",
  footer: "M5 3h14v18H5z M5 16h14 M8 18.5h8",
  source: "M8 9l-3 3 3 3 M16 9l3 3-3 3 M13.5 6l-3 12",
  clock: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z M12 7v5l3 2",
  grip: "M9 6h.01 M15 6h.01 M9 12h.01 M15 12h.01 M9 18h.01 M15 18h.01",
  replace: "M4 7h11l-3-3 M20 17H9l3 3",
  print:
    "M6 9V3h12v6 M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2 M6 14h12v7H6z",
  doc: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M8.5 12l1.2 5 1.3-4 1.3 4 1.2-5",
  pdf: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M9 17v-5h1.5a1.5 1.5 0 0 1 0 3H9",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z",
  // the table's actions (src/editor/commands/table/actions.ts)
  "row-above": "M4 11h16v9H4z M4 15.5h16 M12 3v5 M9.5 5.5h5",
  "row-below": "M4 4h16v9H4z M4 8.5h16 M12 16v5 M9.5 18.5h5",
  "row-delete": "M4 11h16v9H4z M4 15.5h16 M9.5 5.5h5",
  "column-left": "M11 4h9v16h-9z M15.5 4v16 M3 12h5 M5.5 9.5v5",
  "column-right": "M4 4h9v16H4z M8.5 4v16 M16 12h5 M18.5 9.5v5",
  "column-delete": "M11 4h9v16h-9z M15.5 4v16 M3 12h5",
  "row-up": "M12 13V3 M8.5 6.5 12 3l3.5 3.5 M4 17h16 M4 21h16",
  "row-down": "M12 11v10 M8.5 17.5 12 21l3.5-3.5 M4 3h16 M4 7h16",
  "column-back": "M13 12H3 M6.5 8.5 3 12l3.5 3.5 M17 4v16 M21 4v16",
  "column-forward": "M11 12h10 M17.5 8.5 21 12l-3.5 3.5 M3 4v16 M7 4v16",
  "header-column":
    "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 3v18 M6 6v12",
  caption: "M4 4h16 M4 8h9 M3 12h18v8H3z",
  "widths-reset": "M3 4v16 M21 4v16 M7 12h10 M10 9l-3 3 3 3 M14 9l3 3-3 3",
};

// icons of dots only, which need a heavier stroke to show
const DOTS = new Set(["more", "grip"]);

/**
 * iconPath returns the SVG path of the icon `name`, drawn on a 24 × 24 grid
 */
export const iconPath = (name: string) => ICONS[name] ?? "";

/**
 * iconStroke returns the width of the stroke the icon `name` is drawn with
 */
export const iconStroke = (name: string) => (DOTS.has(name) ? 2.5 : 1.5);

export const iconNames = Object.keys(ICONS);
