import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

import { announcement, tableToolbar } from "../../../state";
import { doc, p, table, td, th, tr } from "../../../test/editor";
import { at, cellTexts, cursorAt, selectCells } from "../../../test/tables";
import { tableKey } from "../../commands/table/tableKey";
import { formatMessage, tableTools, toolsKey } from "./tools";

const grid = () =>
  doc(
    p("intro"),
    table(
      tr(th("Fruit"), th("Qty")),
      tr(td("kiwi"), td("10")),
      tr(td("pear"), td("2")),
    ),
    p("outro"),
  );

let view: EditorView;

const setup = (text = "10", node = grid()) => {
  const state = cursorAt(node, text);
  view = new EditorView(document.createElement("div"), {
    state: state.reconfigure({ plugins: [tableTools()] }),
  });
};

const toolbar = () => tableToolbar.value!;
const item = (id: string) => toolbar().items.find((i) => i.id === id)!;
const keys = () => toolsKey.getState(view.state)!.keys;
const press = (code: string, init: KeyboardEventInit = {}) => {
  const key =
    { ArrowDown: "ArrowDown", Escape: "Escape", Shift: "Shift" }[code] ?? code;
  const event = new KeyboardEvent("keydown", {
    code,
    key,
    cancelable: true,
    ...init,
  });
  return view.someProp("handleKeyDown", (f) => f(view, event)) ?? false;
};
const select = (text: string) =>
  view.dispatch(
    view.state.tr.setSelection(
      TextSelection.create(view.state.doc, at(view.state.doc, text)),
    ),
  );
const toggleKeys = () => tableKey()(view.state, view.dispatch, view);

describe("tableTools", () => {
  beforeEach(() => {
    announcement.value = null;
  });

  afterEach(() => {
    view.destroy();
  });

  describe("toolbar", () => {
    it("shows the toolbar in a table and hides it outside", () => {
      setup();
      expect(toolbar().items.map((i) => i.id)).not.toContain("row-up");
      expect(item("header-row")).toMatchObject({
        checked: true,
        enabled: true,
        key: "H",
      });

      select("outro");
      expect(tableToolbar.value).toBeNull();
    });

    it("runs a button's action and announces what it did", () => {
      setup();
      const focus = vi.spyOn(view, "focus");
      item("row-below").run();

      expect(focus).toHaveBeenCalled();
      expect(cellTexts(view.state.doc)).toHaveLength(4);
      expect(announcement.value).toBe("A row added");
    });

    it("announces why an action can't be done", () => {
      setup();
      item("merge").run();

      expect(announcement.value).toBe("Split cell isn't possible here");
    });

    it("hides the toolbar when the editor goes away", () => {
      setup();
      view.destroy();

      expect(tableToolbar.value).toBeNull();
      setup();
    });
  });

  describe("table mode", () => {
    it("is switched on and off with the table key and shown on the toolbar", () => {
      setup();
      toggleKeys();
      expect(keys()).toBe(true);
      expect(toolbar().keys).toBe(true);

      toggleKeys();
      expect(keys()).toBe(false);
    });

    it("runs the action of a key and stays on", () => {
      setup();
      toggleKeys();

      expect(press("ArrowDown")).toBe(true);
      expect(cellTexts(view.state.doc)).toHaveLength(4);
      expect(announcement.value).toBe("A row added");
      expect(keys()).toBe(true);
    });

    it("ignores modifiers pressed on their own", () => {
      setup();
      toggleKeys();

      expect(press("Shift", { key: "Shift" })).toBe(false);
      expect(keys()).toBe(true);
    });

    it("ends with Esc or any other key, which types nothing", () => {
      setup();
      toggleKeys();
      expect(press("Escape")).toBe(true);
      expect(keys()).toBe(false);

      toggleKeys();
      expect(press("KeyZ", { key: "z" })).toBe(true);
      expect(keys()).toBe(false);
      expect(view.state.doc.eq(grid())).toBe(true);
    });

    it("ends on another shortcut, which still does its job", () => {
      setup();
      toggleKeys();

      expect(press("KeyS", { key: "s", ctrlKey: true })).toBe(false);
      expect(keys()).toBe(false);
    });

    it("ends with the table key", () => {
      setup();
      toggleKeys();

      expect(press("KeyT", { key: "t", ctrlKey: true })).toBe(true);
      expect(keys()).toBe(false);
    });

    it("swallows typed text and ends on a click", () => {
      setup();
      toggleKeys();
      const typed = view.someProp("handleTextInput", (f) =>
        f(view, 1, 1, "x", () => view.state.tr),
      );
      expect(typed).toBe(true);

      view
        .someProp("handleDOMEvents")
        ?.mousedown?.(view, new MouseEvent("mousedown"));
      expect(keys()).toBe(false);
    });

    it("ends when the cursor leaves the table", () => {
      setup();
      toggleKeys();
      select("outro");

      expect(toolsKey.getState(view.state)).toMatchObject({ keys: false });
    });

    it("leaves keys alone while it's off", () => {
      setup();

      expect(press("ArrowDown")).toBe(false);
    });
  });

  describe("caption", () => {
    it("opens a field for the caption and sets it", () => {
      setup();
      const focus = vi.spyOn(view, "focus");
      item("caption").run();
      expect(toolbar().caption).toMatchObject({ value: "" });
      // the field keeps the focus
      expect(focus).not.toHaveBeenCalled();

      toolbar().caption!.submit("  Stock ");
      expect(view.state.doc.child(1).attrs.caption).toBe("Stock");
      expect(toolbar().caption).toBeNull();
      expect(announcement.value).toBe("Caption set");
    });

    it("removes the caption when the field is emptied, and can be cancelled", () => {
      setup();
      item("caption").run();
      toolbar().caption!.submit("Stock");
      item("caption").run();
      expect(toolbar().caption!.value).toBe("Stock");

      toolbar().caption!.submit("");
      expect(view.state.doc.child(1).attrs.caption).toBeNull();
      expect(announcement.value).toBe("Caption removed");

      item("caption").run();
      toolbar().caption!.cancel();
      expect(toolbar().caption).toBeNull();
    });
  });

  describe("format", () => {
    it("tells once when a table becomes an HTML table and a markdown table again", () => {
      setup();
      const merge = () => {
        view.updateState(selectCells(view.state, "kiwi", "10"));
        item("merge").run();
      };
      merge();
      expect(announcement.value).toBe(
        "Cells merged. This table has merged cells, so it's saved as an HTML table.",
      );

      // the split cell holds both paragraphs, so the table stays HTML
      select("kiwi");
      item("merge").run();
      expect(announcement.value).toBe(
        "Cell split. This table has lists or paragraphs in a cell, so it's saved as an HTML table.",
      );

      // each change is told once
      view.updateState(selectCells(view.state, "pear", "2"));
      item("merge").run();
      expect(announcement.value).toBe("Cells merged");
    });

    it("tells when a table is a markdown table again", () => {
      setup();
      item("header-row").run();
      expect(announcement.value).toBe(
        "Header row off. This table has no header row, so it's saved as an HTML table.",
      );

      item("header-row").run();
      expect(announcement.value).toBe(
        "Header row on. This table is saved as a markdown table again.",
      );
    });
  });
});

describe("formatMessage", () => {
  it("tells how the table is saved now", () => {
    expect(formatMessage("gfm")).toBe(
      "This table is saved as a markdown table again.",
    );
    expect(formatMessage("caption")).toBe(
      "This table has a caption, so it's saved as an HTML table.",
    );
  });
});
