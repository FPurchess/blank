import { describe, expect, it } from "vitest";

import { columnPercents } from "../../../markdown/tables";
import { doc, p, table, td, th, tr } from "../../../test/editor";
import { cursorAt } from "../../../test/tables";
import { transactionOf } from "./rect";
import { resetColumnWidths, setColumnWidths } from "./widths";

const grid = () =>
  doc(
    p("intro"),
    table(tr(th("a", { colspan: 2 }), th("b")), tr(td("c"), td("d"), td("e"))),
    p("outro"),
  );
const START = p("intro").nodeSize + 1;

describe("column widths", () => {
  it("sets the widths of the columns of a table", () => {
    const state = cursorAt(grid(), "outro");
    const set = state.apply(
      transactionOf(setColumnWidths(START, [50, 20, 30]), state)!,
    );

    expect(columnPercents(set.doc.child(1))).toEqual([50, 20, 30]);
    expect(set.doc.child(1).child(0).child(0).attrs.colwidth).toEqual([50, 20]);
  });

  it("refuses widths that don't fit the table, and where there is no table", () => {
    const state = cursorAt(grid(), "outro");

    expect(setColumnWidths(START, [50, 50])(state)).toBe(false);
    expect(setColumnWidths(1, [100])(state)).toBe(false);
  });

  it("resets the widths of the table the cursor is in", () => {
    const state = cursorAt(grid(), "c");
    expect(resetColumnWidths(state)).toBe(false);

    const set = state.apply(
      transactionOf(setColumnWidths(START, [50, 20, 30]), state)!,
    );
    const reset = set.apply(transactionOf(resetColumnWidths, set)!);
    expect(columnPercents(reset.doc.child(1))).toBeNull();
    expect(resetColumnWidths(cursorAt(grid(), "outro"))).toBe(false);
  });
});
