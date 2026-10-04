import { parseLength } from "../layout/units";
import type { Definition } from "../markdown/blocks/definitions";
import type { LayoutNode } from "../markdown/blocks/layout";
import {
  type BlockChoice,
  type BlockGroup,
  OUTLINE_BREAKPOINT,
} from "../state";

// The blocks pane (BlocksPane.vue): which tiles it shows for a search, how
// the arrow keys move between them, what a form's tile draws, and the room
// it takes at the left of the pages.

// the pane's width, which the pages give up while it's docked: $blocks-dock
// in main.scss
export const BLOCKS_DOCK = 248;

// the tiles of a row
export const TILE_COLUMNS = 2;

/**
 * blocksDock returns the room the pane takes at the left of the pages: its
 * width while it's open from OUTLINE_BREAKPOINT on, where it docks, and
 * nothing below, where it floats over the pages
 */
export const blocksDock = (open: boolean, windowWidth: number) =>
  open && windowWidth >= OUTLINE_BREAKPOINT ? BLOCKS_DOCK : 0;

export interface TileGroup {
  group: BlockGroup;
  label: string;
  choices: BlockChoice[];
}

const GROUPS: { group: BlockGroup; label: string }[] = [
  { group: "contents", label: "Contents" },
  { group: "forms", label: "Forms" },
  { group: "drawings", label: "Drawings" },
];

/**
 * groupsOf returns the groups of tiles the pane shows for `query`: the
 * blocks whose name or description has it, in any case, in the groups'
 * order, leaving out groups without one
 */
export const groupsOf = (
  choices: readonly BlockChoice[],
  query: string,
): TileGroup[] => {
  const wanted = query.trim().toLocaleLowerCase();
  const matches = (choice: BlockChoice) =>
    !wanted ||
    choice.label.toLocaleLowerCase().includes(wanted) ||
    choice.description.toLocaleLowerCase().includes(wanted);
  return GROUPS.map(({ group, label }) => ({
    group,
    label,
    choices: choices.filter(
      (choice) => choice.group === group && matches(choice),
    ),
  })).filter(({ choices }) => choices.length > 0);
};

/**
 * tileStep returns the index of the tile a key moves to from `index`, in a
 * grid of `count` tiles in rows of `columns`: ←→ to the one before and
 * after, ↑↓ a row up and down, Home and End to the first and last; null for
 * another key. ↑ in the first row returns -1, for the search above.
 */
export const tileStep = (
  key: string,
  index: number,
  count: number,
  columns = TILE_COLUMNS,
): number | null => {
  const last = count - 1;
  switch (key) {
    case "ArrowLeft":
      return Math.max(0, index - 1);
    case "ArrowRight":
      return Math.min(last, index + 1);
    case "ArrowUp":
      return index - columns;
    case "ArrowDown":
      return index + columns <= last ? index + columns : index;
    case "Home":
      return 0;
    case "End":
      return last;
    default:
      return null;
  }
};

// a part of a form's wireframe, in shares of the page from its top left
export interface WireBox {
  kind: "heading" | "text" | "image" | "table";
  x: number;
  y: number;
  width: number;
  height: number;
}

// the page a wireframe draws on, in points: A4
const PAGE = { width: 595, height: 842 };
// the margins the wireframe leaves, in shares of the page
const SIDE = 0.12;
const TOP = 0.1;
// the height of each kind of field, in shares of the page
const HEIGHT: Record<WireBox["kind"], number> = {
  heading: 0.04,
  text: 0.03,
  image: 0.16,
  table: 0.12,
};
// the room between two fields, in shares of the page
const GAP = 0.025;
// the share of the text's width a grid's columns leave between them
const COLUMN_GAP = 0.04;

/**
 * boxKind returns how a wireframe draws the field `name` of `definition`
 */
const boxKind = (definition: Definition, name: string): WireBox["kind"] => {
  const field = definition.fields.find((field) => field.name === name);
  if (field?.kind === "image") return "image";
  if (field?.kind === "table") return "table";
  return field?.style?.startsWith("h") ? "heading" : "text";
};

/**
 * share returns a length of a frame as a share of the page's `side`
 */
const share = (length: string | undefined, side: number) =>
  Math.min(1, (parseLength(length ?? "") ?? 0) / side);

/**
 * formWireframe returns the boxes a form's tile draws: its fields where its
 * layout puts them, stacked from the top, side by side in a grid's columns,
 * and at their place in a frame
 */
export const formWireframe = (definition: Definition): WireBox[] => {
  const layout: LayoutNode[] =
    definition.layout ??
    definition.fields.map((field) => ({ field: field.name }));
  const boxes: WireBox[] = [];
  const width = 1 - 2 * SIDE;
  let y = TOP;
  for (const node of layout) {
    if ("frame" in node) {
      const { x, y: top, width: wide, height } = node.frame;
      const kind = boxKind(definition, node.field);
      boxes.push({
        kind,
        x: share(x, PAGE.width),
        y: share(top, PAGE.height),
        width: share(wide, PAGE.width),
        height: share(height, PAGE.height) || HEIGHT[kind],
      });
      y = Math.max(y, share(definition.flowTop, PAGE.height));
    } else if ("grid" in node) {
      const columns = Math.max(1, node.grid.columns.length);
      const column = (width - COLUMN_GAP * (columns - 1)) / columns;
      let bottom = y;
      node.cells.forEach((cell, index) => {
        let top = y;
        for (const { field } of cell) {
          const kind = boxKind(definition, field);
          const x = SIDE + (index % columns) * (column + COLUMN_GAP);
          boxes.push({ kind, x, y: top, width: column, height: HEIGHT[kind] });
          top += HEIGHT[kind] + GAP;
        }
        bottom = Math.max(bottom, top);
      });
      y = bottom;
    } else {
      const kind = boxKind(definition, node.field);
      boxes.push({ kind, x: SIDE, y, width, height: HEIGHT[kind] });
      y += HEIGHT[kind] + GAP;
    }
  }
  return boxes.filter((box) => box.y < 1);
};
