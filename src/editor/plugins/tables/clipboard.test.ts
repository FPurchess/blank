import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Slice } from "prosemirror-model";
import { tableEditing } from "prosemirror-tables";
import type { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

import { schema } from "../../../markdown";
import { createState, doc, p, table, td, th, tr } from "../../../test/editor";
import {
  cellTexts,
  cellTypes,
  cursorAt,
  selectCells,
} from "../../../test/tables";
import {
  formatTsv,
  parseTsv,
  pasteText,
  tableClipboard,
  tableOfRows,
  tsvOf,
} from "./clipboard";

describe("tab-separated values", () => {
  it("reads rows and cells, whatever the line breaks", () => {
    expect(parseTsv("a\tb\r\nc\td\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(parseTsv("a\t\n\td")).toEqual([
      ["a", ""],
      ["", "d"],
    ]);
  });

  it("reads quoted cells with tabs, line breaks and quotes in them", () => {
    expect(parseTsv('"a\tb"\t"two\nlines"\n"say ""hi"""\tc')).toEqual([
      ["a\tb", "two\nlines"],
      ['say "hi"', "c"],
    ]);
  });

  it("is no table with fewer than two rows or columns, or rows unlike", () => {
    expect(parseTsv("a\tb")).toBeNull();
    expect(parseTsv("a\nb")).toBeNull();
    expect(parseTsv("a\tb\nc")).toBeNull();
    // lines indented with a tab
    expect(parseTsv("\tfoo\n\tbar")).toBeNull();
  });

  it("reads a quote that doesn't enclose a whole cell as text", () => {
    expect(parseTsv('"Hello" she said\tx\ny\tz')).toEqual([
      ['"Hello" she said', "x"],
      ["y", "z"],
    ]);
    expect(parseTsv('"open\tx\ny\tz')).toEqual([
      ['"open', "x"],
      ["y", "z"],
    ]);
  });

  it("keeps an empty column in the middle of a table", () => {
    expect(parseTsv("a\t\tc\nd\t\tf")).toEqual([
      ["a", "", "c"],
      ["d", "", "f"],
    ]);
  });

  it("writes rows as tab-separated values that read back the same", () => {
    const rows = [
      ["a\tb", "two\nlines"],
      ['say "hi"', ""],
    ];
    const text = formatTsv(rows);

    expect(text).toBe('"a\tb"\t"two\nlines"\n"say ""hi"""\t');
    expect(parseTsv(text)).toEqual(rows);
  });
});

describe("tableOfRows", () => {
  it("makes a table with a header row, and line breaks in cells", () => {
    const node = tableOfRows(
      [
        ["Fruit", "Note"],
        ["kiwi", "ripe\nsoft"],
      ],
      true,
    );

    expect(cellTypes(doc(node))).toEqual([
      ["th", "th"],
      ["td", "td"],
    ]);
    expect(node.child(1).child(1).firstChild!.childCount).toBe(3);
  });

  it("makes a table without a header row", () => {
    expect(cellTypes(doc(tableOfRows([["a"], ["b"]], false)))).toEqual([
      ["td"],
      ["td"],
    ]);
  });
});

describe("tsvOf", () => {
  const grid = () =>
    doc(
      table(
        tr(th("Fruit"), th("Qty")),
        tr(td("kiwi"), td("10")),
        tr(td("two words", { colspan: 2 })),
      ),
      p("after"),
    );

  it("writes selected cells as tab-separated values", () => {
    const state = selectCells(cursorAt(grid(), "Fruit"), "Fruit", "10");

    expect(tsvOf(state.selection.content())).toBe("Fruit\tQty\nkiwi\t10");
  });

  it("leaves the columns a merged cell spans empty", () => {
    const state = selectCells(cursorAt(grid(), "kiwi"), "kiwi", "two words");

    expect(tsvOf(state.selection.content())).toBe("kiwi\t10\ntwo words\t");
  });

  it("writes a line break in a cell as a quoted newline, and leaves out images", () => {
    const { hard_break, image, paragraph } = schema.nodes;
    const node = doc(
      table(
        tr(
          td(
            paragraph.create(null, [
              schema.text("two"),
              hard_break.create(),
              schema.text("lines"),
            ]),
          ),
          td(
            paragraph.create(null, [
              schema.text("pic "),
              image.create({ src: "a.png" }),
            ]),
          ),
        ),
        tr(td("c"), td("d")),
      ),
      p(),
    );
    const state = selectCells(cursorAt(node, "two"), "two", "d");

    expect(tsvOf(state.selection.content())).toBe('"two\nlines"\tpic \nc\td');
  });

  it("is nothing for other content", () => {
    const state = cursorAt(grid(), "after");

    expect(tsvOf(Slice.empty)).toBeNull();
    expect(tsvOf(state.doc.slice(state.doc.content.size - 6))).toBeNull();
  });
});

describe("tableClipboard", () => {
  let view: EditorView;

  beforeEach(() => {
    // ProseMirror pastes through a ClipboardEvent, which jsdom lacks
    vi.stubGlobal("ClipboardEvent", class extends Event {});
  });

  const mount = (state: EditorState) => {
    view = new EditorView(document.createElement("div"), {
      state: state.reconfigure({ plugins: [tableClipboard(), tableEditing()] }),
    });
  };
  // an empty paragraph to paste into, or the cursor in a table
  const setup = () => mount(createState(doc(p("intro"), p())));
  const at = (text: string) => mount(cursorAt(grid(), text));
  const grid = () =>
    doc(
      table(
        tr(th("Fruit"), th("Qty")),
        tr(td("kiwi"), td("10")),
        tr(td("pear"), td("2")),
      ),
      p("after"),
    );
  const tables = () => {
    const found: string[][][] = [];
    view.state.doc.forEach((node) => {
      if (node.type.name === "table") found.push(cellTexts(doc(node)));
    });
    return found;
  };

  afterEach(() => {
    view.destroy();
  });

  it("pastes a table from a spreadsheet with a header row, aligned by column", () => {
    setup();
    view.pasteHTML(
      [
        "<google-sheets-html-origin><table><colgroup><col width=100></colgroup>",
        '<tr><td style="text-align:left">Fruit</td><td>Qty</td></tr>',
        '<tr><td>kiwi</td><td style="text-align:right">10</td></tr>',
        "</table>",
      ].join(""),
    );

    const node = view.state.doc.child(1);
    expect(cellTypes(doc(node))).toEqual([
      ["th", "th"],
      ["td", "td"],
    ]);
    expect(node.child(0).child(1).attrs.align).toBe("right");
    expect(node.child(0).child(0).attrs.align).toBeNull();
  });

  it("aligns tables by column wherever they are in what's pasted", () => {
    setup();
    view.pasteHTML(
      [
        "<p>stock<br>today</p><ul><li><p>fruit</p><table>",
        '<tr><td>a</td><td align="right">1</td></tr>',
        '<tr><td align="center">b</td><td align="right">2</td></tr>',
        "</table></li></ul>",
      ].join(""),
    );

    let aligns: (string | null)[][] = [];
    view.state.doc.descendants((node) => {
      if (node.type.name !== "table") return true;
      aligns = node.children.map((row) =>
        row.children.map((cell) => cell.attrs.align as string | null),
      );
      return false;
    });
    // the first row became the header, so its cells don't count
    expect(aligns).toEqual([
      ["center", "right"],
      ["center", "right"],
    ]);
  });

  it("keeps a table copied within Blank as it is", () => {
    setup();
    view.pasteHTML(
      '<table data-pm-slice="0 0 []"><tr><td style="text-align:center">a</td></tr><tr><td>b</td></tr></table>',
    );

    const node = view.state.doc.child(1);
    expect(cellTypes(doc(node))).toEqual([["td"], ["td"]]);
    expect(node.child(0).child(0).attrs.align).toBe("center");
  });

  it("pastes tab-separated text as a table with a header row", () => {
    setup();
    pasteText(view, "Fruit\tQty\nkiwi\t10\n", false);

    expect(tables()).toEqual([
      [
        ["Fruit", "Qty"],
        ["kiwi", "10"],
      ],
    ]);
    expect(cellTypes(view.state.doc)[0]).toEqual(["th", "th"]);
  });

  it("pastes tab-separated text as it is when plain text is asked for", () => {
    setup();
    pasteText(view, "Fruit\tQty\nkiwi\t10", true);
    expect(tables()).toEqual([]);

    view.pasteText("a\tb\nc\td");
    expect(tables()).toEqual([]);
  });

  it("pastes cells into a table from the cursor, growing it", () => {
    at("10");
    pasteText(view, "plum\t7\nfig\t3", false);

    expect(cellTexts(view.state.doc)).toEqual([
      ["Fruit", "Qty", ""],
      ["kiwi", "plum", "7"],
      ["pear", "fig", "3"],
    ]);
    expect(cellTypes(view.state.doc)).toEqual([
      ["th", "th", "th"],
      ["td", "td", "td"],
      ["td", "td", "td"],
    ]);
  });

  it("gives cells pasted into the header row the header type", () => {
    at("Fruit");
    view.pasteHTML(
      "<table><tr><td>Name</td><td>Count</td></tr><tr><td>fig</td><td>3</td></tr></table>",
    );

    expect(cellTexts(view.state.doc).slice(0, 2)).toEqual([
      ["Name", "Count"],
      ["fig", "3"],
    ]);
    expect(cellTypes(view.state.doc)).toEqual([
      ["th", "th"],
      ["td", "td"],
      ["td", "td"],
    ]);
  });

  it("fills the selected cells", () => {
    at("kiwi");
    view.updateState(selectCells(view.state, "kiwi", "2"));
    pasteText(view, "a\tb\nc\td", false);

    expect(cellTexts(view.state.doc)).toEqual([
      ["Fruit", "Qty"],
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("keeps selected header cells header cells when text is pasted into them", () => {
    at("Fruit");
    view.updateState(selectCells(view.state, "Fruit", "Qty"));
    pasteText(view, "word", false);

    expect(cellTexts(view.state.doc)[0]).toEqual(["word", "word"]);
    expect(cellTypes(view.state.doc)[0]).toEqual(["th", "th"]);
  });

  it("copies cells as tab-separated text", () => {
    at("kiwi");
    view.updateState(selectCells(view.state, "kiwi", "2"));

    expect(
      view.serializeForClipboard(view.state.selection.content()).text,
    ).toBe("kiwi\t10\npear\t2");
  });
});
