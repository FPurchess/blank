import { beforeEach, describe, expect, it, vi } from "vitest";

import { caretBox } from "../../../engine/geometry";
import { tablePicker } from "../../../state";
import {
  createState,
  createTestView,
  doc,
  p,
  table,
  td,
  th,
  tr,
} from "../../../test/editor";
import { createTable } from "./insert";
import { tableTools, toolsKey } from "../../plugins/tables/tools";
import { tableKey } from "./tableKey";

vi.mock("../../../engine/geometry", () => ({ caretBox: vi.fn() }));

const setup = (node = doc(p()), cursor = 1) => {
  const view = createTestView(createState(node, { cursor }));
  vi.mocked(caretBox).mockReturnValue({
    left: 10,
    right: 10,
    top: 20,
    bottom: 40,
  });
  Object.assign(view, { focus: vi.fn() });
  return view;
};

describe("tableKey", () => {
  beforeEach(() => {
    tablePicker.value = null;
  });

  it("opens the picker at the cursor with a 3 × 3 table", () => {
    const view = setup();

    expect(tableKey()(view.state, view.dispatch, view)).toBe(true);
    expect(tablePicker.value).toMatchObject({
      cols: 3,
      rows: 3,
      anchor: { left: 10, top: 20, bottom: 40 },
    });
  });

  it("inserts the chosen size and closes the picker", () => {
    const view = setup();
    tableKey()(view.state, view.dispatch, view);

    tablePicker.value!.submit(2, 4);
    expect(tablePicker.value).toBeNull();
    expect(view.state.doc.eq(doc(createTable(2, 4)))).toBe(true);
    expect(view.focus).toHaveBeenCalled();
  });

  it("closes the open picker", () => {
    const view = setup();
    tableKey()(view.state, view.dispatch, view);

    expect(tableKey()(view.state, view.dispatch, view)).toBe(true);
    expect(tablePicker.value).toBeNull();
  });

  it("switches table mode on and off in a table", () => {
    const node = doc(table(tr(th("a")), tr(td("b"))), p());
    const view = setup(node, 4);
    view.updateState(view.state.reconfigure({ plugins: [tableTools()] }));

    expect(tableKey()(view.state, view.dispatch, view)).toBe(true);
    expect(tablePicker.value).toBeNull();
    expect(toolsKey.getState(view.state)?.keys).toBe(true);

    tableKey()(view.state, view.dispatch, view);
    expect(toolsKey.getState(view.state)?.keys).toBe(false);
  });
});
