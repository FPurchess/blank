import { EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import { CellSelection } from "prosemirror-tables";
import { describe, expect, it } from "vitest";

import { documentFields } from "../layout/bands";
import { schema } from "../markdown";
import { doc, p, table, td, th, tr } from "../test/editor";
import { testEngine } from "../test/engine";
import { testLayout } from "../test/layout";
import { cellRects, shownSelection } from "./selection";

// "intro" at 0, a table of 2 × 3 at 7, and a rule
const node = doc(
  p("intro"),
  table(tr(th("a"), th("b")), tr(td("c"), td("d")), tr(td("e"), td("f"))),
  schema.nodes.horizontal_rule.create(),
  p("end"),
);

const setup = () => {
  const engine = testEngine();
  engine.setSettings(testLayout(), documentFields(node));
  engine.sync(node, () => undefined);
  const state = EditorState.create({ schema, doc: node });
  return { engine, state };
};

// the position inside the cell with `text`
const cellAt = (text: string) => {
  let found = -1;
  node.descendants((child, pos) => {
    if (found < 0 && child.isText && child.text === text) found = pos;
  });
  // before its paragraph, inside the cell
  return node.resolve(found).before(-1);
};

describe("shownSelection", () => {
  it("shows a caret, a range, a node and cells as the page view does", () => {
    const { engine, state } = setup();
    const caret = shownSelection(engine, TextSelection.create(state.doc, 2));
    expect(caret.caret).toMatchObject({ page: 0 });
    expect(caret.rects).toEqual([]);

    const range = shownSelection(engine, TextSelection.create(state.doc, 1, 6));
    expect(range.caret).toBeNull();
    expect(range.rects).toHaveLength(1);

    let rule = -1;
    node.forEach((child, offset) => {
      if (child.type.name === "horizontal_rule") rule = offset;
    });
    const selected = shownSelection(
      engine,
      NodeSelection.create(state.doc, rule),
    );
    expect(selected.rects).toEqual([]);
    expect(selected.nodes).toHaveLength(1);
  });

  it("gives the box of the selected cells", () => {
    const { engine, state } = setup();
    // from "c" down to "f": the two body rows, both columns
    const cells = CellSelection.create(state.doc, cellAt("c"), cellAt("f"));
    const rects = cellRects(engine, cells);
    expect(rects).toHaveLength(1);
    const grid = engine.tableGrid(7)!;
    expect(rects[0].x).toBeCloseTo(grid.columns[0]);
    expect(rects[0].width).toBeCloseTo(grid.columns[2] - grid.columns[0]);
    expect(rects[0].y).toBeCloseTo(grid.rows[1].y);
    expect(rects[0].height).toBeCloseTo(
      grid.rows[2].y + grid.rows[2].height - grid.rows[1].y,
    );
    // one column
    const column = cellRects(
      engine,
      CellSelection.create(state.doc, cellAt("b"), cellAt("f")),
    );
    expect(column[0].x).toBeCloseTo(grid.columns[1]);
    expect(shownSelection(engine, cells).rects).toEqual(rects);
  });
});
