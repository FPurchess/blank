import { afterEach, describe, expect, it } from "vitest";
import type { EditorState } from "prosemirror-state";

import { language } from "../../../state";
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
import { cellTexts, cursorAt } from "../../../test/tables";
import {
  parseDate,
  parseNumber,
  sortByColumn,
  sortKind,
  sortOrder,
} from "./sort";

describe("parseNumber", () => {
  it.each([
    ["12", "en", 12],
    ["-3.5", "en", -3.5],
    ["−3.5", "en", -3.5],
    ["1,200.50", "en", 1200.5],
    ["1.200,50", "de", 1200.5],
    ["1 200,5", "fr", 1200.5],
    ["$ 4.99", "en", 4.99],
    ["4,99 €", "de", 4.99],
    ["85 %", "en", 85],
    ["12 kg", "en", 12],
    ["1'000", "de-CH", 1000],
  ])("reads %j in %s as %d", (text, lang, value) => {
    expect(parseNumber(text, lang)).toBe(value);
  });

  it.each(["", "abc", "12 apples and 3 pears", "1.2.3", "v2"])(
    "doesn't read %j as a number",
    (text) => {
      expect(parseNumber(text, "en")).toBeUndefined();
    },
  );
});

describe("parseDate", () => {
  it("reads ISO dates and dates with dots in any language", () => {
    expect(parseDate("2024-12-31", "en")).toBe(
      new Date(2024, 11, 31).getTime(),
    );
    expect(parseDate("31.12.2024", "en")).toBe(
      new Date(2024, 11, 31).getTime(),
    );
  });

  it("reads dates with slashes in the order of the language", () => {
    expect(parseDate("12/31/2024", "en-US")).toBe(
      new Date(2024, 11, 31).getTime(),
    );
    expect(parseDate("31/12/2024", "fr")).toBe(
      new Date(2024, 11, 31).getTime(),
    );
  });

  it.each(["2024-13-01", "31.02.2024", "yesterday", "2024"])(
    "doesn't read %j as a date",
    (text) => {
      expect(parseDate(text, "en")).toBeUndefined();
    },
  );
});

describe("sortKind", () => {
  it("compares numbers, dates or text, leaving empty values out", () => {
    expect(sortKind(["10", "", "2"], "en")).toBe("number");
    expect(sortKind(["2024-01-02", "2023-05-06"], "en")).toBe("date");
    expect(sortKind(["10", "ten"], "en")).toBe("text");
    expect(sortKind(["", " "], "en")).toBe("text");
  });
});

describe("sortOrder", () => {
  const sorted = (values: string[], lang = "en") =>
    sortOrder(values, lang).order.map((index) => values[index]);

  it("sorts numbers by their value", () => {
    expect(sorted(["10", "9", "100"])).toEqual(["9", "10", "100"]);
    expect(sorted(["1,5", "1,25", "10"], "de")).toEqual(["1,25", "1,5", "10"]);
  });

  it("sorts text as people read it, numbers within it included", () => {
    expect(
      sorted(["Zebra", "äpfel", "Apfel", "item 10", "item 9"], "de"),
    ).toEqual(["äpfel", "Apfel", "item 9", "item 10", "Zebra"]);
  });

  it("sorts dates by their day", () => {
    expect(sorted(["03.01.2024", "2023-12-31", "02.01.2024"])).toEqual([
      "2023-12-31",
      "02.01.2024",
      "03.01.2024",
    ]);
  });

  it("puts empty values last and keeps equal values in their order", () => {
    const values = ["b", "", "a", "B"];

    expect(sortOrder(values, "en").order).toEqual([2, 0, 3, 1]);
  });

  it("sorts descending when the values are in ascending order already", () => {
    const { order, descending } = sortOrder(["1", "2", "3", ""], "en");

    expect(descending).toBe(true);
    expect(order).toEqual([2, 1, 0, 3]);
  });
});

describe("sortByColumn", () => {
  afterEach(() => {
    language.value = "en";
  });

  const run = (state: EditorState) => {
    const view = createTestView(state);
    expect(sortByColumn(view.state, view.dispatch)).toBe(true);
    return view.state;
  };

  const fruit = () =>
    doc(
      table(
        tr(th("Fruit"), th("Qty")),
        tr(td("Pears"), td("12")),
        tr(td("Apples"), td("3")),
        tr(td("Kiwis"), td("25")),
      ),
      p(),
    );

  it("sorts the body rows by the column at the cursor, keeping the header on top", () => {
    const state = run(cursorAt(fruit(), "12"));

    expect(cellTexts(state.doc)).toEqual([
      ["Fruit", "Qty"],
      ["Apples", "3"],
      ["Pears", "12"],
      ["Kiwis", "25"],
    ]);
    expect(state.selection.$head.node(-1).textContent).toBe("3");
  });

  it("sorts descending the second time", () => {
    const state = run(run(cursorAt(fruit(), "Pears")));

    expect(cellTexts(state.doc).map((row) => row[0])).toEqual([
      "Fruit",
      "Pears",
      "Kiwis",
      "Apples",
    ]);
  });

  it("sorts decimal commas in German", () => {
    language.value = "de";
    const node = doc(
      table(tr(th("Preis")), tr(td("1,5")), tr(td("1,25")), tr(td("10"))),
      p(),
    );

    expect(cellTexts(run(cursorAt(node, "1,5")).doc).flat()).toEqual([
      "Preis",
      "1,25",
      "1,5",
      "10",
    ]);
  });

  it("sorts a table without header rows as a whole", () => {
    const node = doc(table(tr(td("b")), tr(td("a"))), p());

    expect(cellTexts(run(cursorAt(node, "b")).doc).flat()).toEqual(["a", "b"]);
  });

  it("doesn't sort rows that share a merged cell", () => {
    const node = doc(
      table(
        tr(th("a"), th("b")),
        tr(td("x", { rowspan: 2 }), td("2")),
        tr(td("1")),
      ),
      p(),
    );

    expect(sortByColumn(cursorAt(node, "2"))).toBe(false);
  });

  it("doesn't sort rows a header cell reaches into", () => {
    const node = doc(
      table(
        tr(th("a", { rowspan: 2 }), th("b")),
        tr(td("2")),
        tr(td("x"), td("1")),
      ),
      p(),
    );

    expect(sortByColumn(cursorAt(node, "2"))).toBe(false);
  });

  it("needs two rows to sort", () => {
    const node = doc(table(tr(th("a")), tr(td("b"))), p());

    expect(sortByColumn(cursorAt(node, "b"))).toBe(false);
    expect(sortByColumn(createState(doc(p("x"))))).toBe(false);
  });
});
