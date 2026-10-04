import { parseLength } from "../../layout/units";

// The layout of a form: where its fields stand on the page. A template
// without one stacks its fields in order. A layout is a list of:
// - `{ field: name }`, a field across the width of the text;
// - `{ grid: { columns, gap }, cells }`, a grid: its cells side by side, one
//   per column, each holding fields one below the other; cells beyond the
//   columns start a new row. A column is as wide as a length ("40mm") or a
//   share of what the lengths and gaps leave ("1fr").
// - `{ frame: { x, y, width, height }, field }`, a frame: a field at a place
//   of the page, from its top left edge, outside the flow of the text, like
//   the address of a letter, growing below its height if it must. Frames
//   come first, on the form's first page, which a template with frames
//   starts (see checkDefinition). A frame holds one field: Word puts the
//   paragraphs of one frame on top of each other.
// The fields come in the layout in the order of the definition's fields,
// which is the order they are read, written and gone through with Tab in.

export interface FieldNode {
  field: string;
}

export interface GridNode {
  grid: { columns: string[]; gap?: string };
  cells: FieldNode[][];
}

export interface FrameNode {
  frame: { x: string; y: string; width: string; height?: string };
  field: string;
}

export type LayoutNode = FieldNode | GridNode | FrameNode;

// the width of a column, as the layout engine takes it: points, or a share
// of what is left
export interface Track {
  pt: number;
  fr: number;
}

// where a field stands in a grid: the row of which grid (the band, the
// columns side by side), its column, and the widths of the band's columns
export interface GridPlace {
  kind: "grid";
  band: string;
  column: number;
  tracks: Track[];
  // the room between two columns, in points
  gap: number;
}

// where a field stands in a frame: which frame, and where it is on the
// page, in points from its top left edge; a frame grows below its height
export interface FramePlace {
  kind: "frame";
  frame: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Place = GridPlace | FramePlace;

const MAX_COLUMNS = 4;
const MAX_NODES = 64;
// the room between two columns where the grid doesn't say
const DEFAULT_GAP = "6mm";

const SHARE = /^\s*(\d+(?:\.\d*)?|\.\d+)\s*fr\s*$/i;

/**
 * trackOf reads the width of a column: a length or a share ("1fr")
 */
export const trackOf = (value: unknown): Track | undefined => {
  if (typeof value !== "string") return undefined;
  const share = SHARE.exec(value);
  if (share) {
    const fr = Number(share[1]);
    return fr > 0 && fr <= 100 ? { pt: 0, fr } : undefined;
  }
  const pt = parseLength(value);
  return pt !== undefined && pt > 0 && pt < 2000 ? { pt, fr: 0 } : undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const keysAre = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).every((key) => keys.includes(key));

/**
 * checkFieldNode returns the field a layout's node names, or what is wrong
 */
const checkFieldNode = (value: unknown): FieldNode | string =>
  isRecord(value) &&
  keysAre(value, ["field"]) &&
  typeof value.field === "string"
    ? { field: value.field }
    : "a cell of a grid holds fields, like - field: photo";

/**
 * checkGrid returns the grid `value` describes, or what is wrong with it
 */
const checkGrid = (value: Record<string, unknown>): GridNode | string => {
  if (!keysAre(value, ["grid", "cells"]) || !isRecord(value.grid)) {
    return "a grid has its grid (columns and gap) and its cells";
  }
  const { columns, gap } = value.grid;
  if (!keysAre(value.grid, ["columns", "gap"])) {
    return "a grid has columns and a gap";
  }
  if (
    !Array.isArray(columns) ||
    columns.length === 0 ||
    columns.length > MAX_COLUMNS ||
    !columns.every((column) => trackOf(column))
  ) {
    return `a grid has 1 to ${MAX_COLUMNS} columns, each a length like 40mm or a share like 1fr`;
  }
  const gapTrack = gap === undefined ? undefined : trackOf(gap);
  if (gap !== undefined && (!gapTrack || gapTrack.fr > 0)) {
    return "the gap of a grid is a length, like 6mm";
  }
  const { cells } = value;
  if (
    !Array.isArray(cells) ||
    cells.length === 0 ||
    !cells.every((cell) => Array.isArray(cell) && cell.length > 0)
  ) {
    return "a grid has cells, each a list of fields";
  }
  const checked: FieldNode[][] = [];
  for (const cell of cells as unknown[][]) {
    const fields: FieldNode[] = [];
    for (const node of cell) {
      const field = checkFieldNode(node);
      if (typeof field === "string") return field;
      fields.push(field);
    }
    checked.push(fields);
  }
  return {
    grid: {
      columns: columns as string[],
      ...(gap === undefined ? {} : { gap: gap as string }),
    },
    cells: checked,
  };
};

/**
 * lengthOf reads a length of a frame, in points, or undefined
 */
const lengthOf = (value: unknown) => {
  const points = typeof value === "string" ? parseLength(value) : undefined;
  return points !== undefined && points < 2000 ? points : undefined;
};

/**
 * checkFrame returns the frame `value` describes, or what is wrong with it
 */
const checkFrame = (value: Record<string, unknown>): FrameNode | string => {
  if (
    !keysAre(value, ["frame", "field"]) ||
    !isRecord(value.frame) ||
    typeof value.field !== "string"
  ) {
    return "a frame has its frame (x, y, width and height) and its field";
  }
  const { x, y, width, height } = value.frame;
  if (
    !keysAre(value.frame, ["x", "y", "width", "height"]) ||
    [x, y, width].some((length) => lengthOf(length) === undefined) ||
    (height !== undefined && lengthOf(height) === undefined) ||
    !lengthOf(width)
  ) {
    return "a frame has an x, a y and a width, and maybe a height, each a length like 20mm";
  }
  return {
    frame: {
      x: x as string,
      y: y as string,
      width: width as string,
      ...(height === undefined ? {} : { height: height as string }),
    },
    field: value.field,
  };
};

/**
 * fieldsOf returns the fields a layout names, in order
 */
const fieldsOf = (layout: readonly LayoutNode[]): string[] =>
  layout.flatMap((node) =>
    "field" in node
      ? [node.field]
      : node.cells.flatMap((cell) => cell.map((field) => field.field)),
  );

/**
 * framedFields returns the fields a layout puts in frames
 */
export const framedFields = (layout: readonly LayoutNode[] | undefined) =>
  (layout ?? []).flatMap((node) => ("frame" in node ? [node.field] : []));

/**
 * checkLayout returns the layout `value` describes, or what is wrong with
 * it; `fields` are the names of the definition's fields, in order
 */
export const checkLayout = (
  value: unknown,
  fields: readonly string[],
): LayoutNode[] | string => {
  if (!Array.isArray(value) || value.length === 0) {
    return "the layout is a list of fields, grids and frames";
  }
  const layout: LayoutNode[] = [];
  let nodes = 0;
  for (const node of value) {
    const checked = !isRecord(node)
      ? checkFieldNode(node)
      : "grid" in node
        ? checkGrid(node)
        : "frame" in node
          ? checkFrame(node)
          : checkFieldNode(node);
    if (typeof checked === "string") return checked;
    if ("frame" in checked && layout.some((other) => !("frame" in other))) {
      return "the frames come first in a layout";
    }
    nodes += fieldsOf([checked]).length + ("cells" in checked ? 1 : 0);
    layout.push(checked);
  }
  if (nodes > MAX_NODES) return `the layout has more than ${MAX_NODES} parts`;
  const named = fieldsOf(layout);
  const unknown = named.find((name) => !fields.includes(name));
  if (unknown) return `the layout names the field ${unknown}, which isn't one`;
  const twice = named.find((name, index) => named.indexOf(name) !== index);
  if (twice) return `the layout has the field ${twice} twice`;
  const missing = fields.find((name) => !named.includes(name));
  if (missing) return `the layout leaves out the field ${missing}`;
  if (named.some((name, index) => fields[index] !== name)) {
    return "the layout has the fields in another order than fields";
  }
  return layout;
};

/**
 * placesOf returns where each field of a layout stands that stands in a
 * grid or a frame, by its name: the fields of one row of a grid are a band
 */
export const placesOf = (
  layout: readonly LayoutNode[] | undefined,
): Map<string, Place> => {
  const places = new Map<string, Place>();
  (layout ?? []).forEach((node, index) => {
    if ("frame" in node) {
      const { x, y, width, height } = node.frame;
      const place: FramePlace = {
        kind: "frame",
        frame: `${index}`,
        x: lengthOf(x) ?? 0,
        y: lengthOf(y) ?? 0,
        width: lengthOf(width) ?? 0,
        height: lengthOf(height) ?? 0,
      };
      places.set(node.field, place);
      return;
    }
    if ("field" in node) return;
    const tracks = node.grid.columns.map(
      (column) => trackOf(column) ?? { pt: 0, fr: 1 },
    );
    const gap = trackOf(node.grid.gap ?? DEFAULT_GAP)?.pt ?? 0;
    node.cells.forEach((cell, at) => {
      const row = Math.floor(at / tracks.length);
      for (const { field } of cell) {
        places.set(field, {
          kind: "grid",
          band: `${index}:${row}`,
          column: at % tracks.length,
          tracks,
          gap,
        });
      }
    });
  });
  return places;
};

/**
 * trackWidths returns the widths of the columns of `tracks` in `width`,
 * with `gap` between two, as the layout engine works them out
 */
export const trackWidths = (
  tracks: readonly Track[],
  gap: number,
  width: number,
): number[] => {
  const points = tracks.reduce((sum, track) => sum + track.pt, 0);
  const shares = tracks.reduce((sum, track) => sum + track.fr, 0);
  const free = Math.max(0, width - gap * (tracks.length - 1) - points);
  return tracks.map(
    (track) => track.pt + (shares > 0 ? (free * track.fr) / shares : 0),
  );
};
