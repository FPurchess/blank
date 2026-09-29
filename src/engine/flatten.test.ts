import type { Node } from "prosemirror-model";
import { describe, expect, it } from "vitest";

import { schema } from "../markdown";
import {
  blockquote,
  doc,
  h,
  li,
  ol,
  p,
  table,
  td,
  th,
  tr,
  ul,
} from "../test/editor";
import {
  diff,
  flatten,
  type ImageSizes,
  LIST_INDENT,
  QUOTE_INDENT,
  spansOf,
} from "./flatten";

const noSizes = () => undefined;
const para = (...content: Node[]) => schema.node("paragraph", null, content);
const items = (node: ReturnType<typeof doc>, sizes: ImageSizes = noSizes) =>
  flatten(node, sizes).map((record) => record.build());

describe("flatten", () => {
  it("gives paragraphs and headings the PDF's space and their positions", () => {
    const result = items(
      doc(h(1, "Title"), p("one"), h(2, "Sub"), h(3, "Subsub"), p("two")),
    );
    expect(
      result.map((item) => [item.kind, item.pos, item.before, item.after]),
    ).toEqual([
      ["text", 1, 0, 5],
      ["text", 8, 0, 8],
      ["text", 13, 16, 5],
      ["text", 18, 4, 5],
      ["text", 26, 0, 8],
    ]);
    expect(result[0]).toMatchObject({
      style: "h1",
      level: 1,
      top: true,
      text: "Title",
    });
  });

  it("reads marks into spans, joining runs with the same marks", () => {
    const { strong, em, link } = schema.marks;
    const node = para(
      schema.text("a "),
      schema.text("bold", [strong.create()]),
      schema.text(" both", [strong.create(), em.create()]),
      schema.text(" go", [link.create({ href: "https://x.org" })]),
    );
    expect(spansOf(node.children)).toEqual({
      text: "a bold both go",
      spans: [
        { from: 2, to: 6, bold: true },
        { from: 6, to: 11, bold: true, italic: true },
        { from: 11, to: 14, link: "https://x.org" },
      ],
    });
    const breaks = para(
      schema.text("a"),
      schema.nodes.hard_break.create(),
      schema.text("b"),
    );
    expect(spansOf(breaks.children).text).toBe("a\nb");
  });

  it("indents lists and gives their first blocks markers", () => {
    const result = items(
      doc(ul(li(p("a")), li(p("b"), ul(li(p("c"))))), ol(li(p("x")))),
    );
    expect(
      result.map((item) => [item.indent, item.marker, item.before, item.after]),
    ).toEqual([
      [LIST_INDENT, "•", 2, 2],
      [LIST_INDENT, "•", 2, 0],
      [2 * LIST_INDENT, "◦", 2 + 2, 2 + 2 + 8],
      [LIST_INDENT, "1.", 2, 10],
    ]);
    expect(result[0]).toMatchObject({ top: false });
  });

  it("gives quotes their bars, reaching down to the next item in the quote", () => {
    const result = items(doc(blockquote(p("a"), p("b")), p("after")));
    expect(
      result.map((item) => [item.indent, item.bars, item.barsContinue]),
    ).toEqual([
      [QUOTE_INDENT, [0], true],
      [QUOTE_INDENT, [0], false],
      [0, [], false],
    ]);
  });

  it("stands images on lines of their own", () => {
    const image = schema.nodes.image.create({ src: "a.png", alt: "A" });
    const node = doc(para(schema.text("before"), image, schema.text("after")));
    const result = items(node, (src) =>
      src === "a.png" ? { width: 100, height: 50 } : undefined,
    );
    expect(
      result.map((item) => [item.kind, item.pos, item.before, item.after]),
    ).toEqual([
      ["text", 1, 0, 0],
      ["image", 7, 0, 0],
      ["text", 8, 0, 8],
    ]);
    expect(result[1]).toMatchObject({ width: 100, height: 50, alt: "A" });
  });

  it("lays out tables by rows and cells", () => {
    const node = doc(table(tr(th("Name"), th("Value")), tr(td("a"), td("b"))));
    const [item] = items(node);
    expect(item.kind).toBe("table");
    if (item.kind !== "table") return;
    expect(item.rows.map((row) => row.header)).toEqual([true, false]);
    const cell = item.rows[1].cells[1];
    // the paragraph's text starts where ProseMirror has it
    expect(
      node.textBetween(cell.paragraphs[0].pos, cell.paragraphs[0].pos + 1),
    ).toBe("b");
    expect(item.end).toBe(node.child(0).nodeSize);
  });

  it("places merged cells in their columns, with the caption", () => {
    const node = doc(
      schema.node("table", { caption: "Totals" }, [
        tr(th("a", { colspan: 2 })),
        tr(td("b", { rowspan: 2 }), td("c")),
        tr(td("d")),
      ]),
    );
    const [item] = items(node);
    if (item.kind !== "table") throw new Error("no table");
    expect(item.caption).toBe("Totals");
    expect(item.rows[0].cells[0]).toMatchObject({ col: 0, colspan: 2 });
    expect(item.rows[1].cells[0]).toMatchObject({ col: 0, rowspan: 2 });
    // the last row's only cell starts in the second column
    expect(item.rows[2].cells).toHaveLength(1);
    expect(item.rows[2].cells[0]).toMatchObject({ col: 1, colspan: 1 });
  });

  it("keeps the widths of a frozen table", () => {
    const node = doc(p("x"), table(tr(td("a"), td("a much longer cell"))));
    const [, free] = items(node);
    if (free.kind !== "table") throw new Error("no table");
    expect(free.widths[1]).toBeGreaterThan(free.widths[0]);
    const records = flatten(node, noSizes, { pos: 3, widths: [0.5, 0.5] });
    const frozen = records[1].build();
    if (frozen.kind !== "table") throw new Error("no table");
    expect(frozen.widths).toEqual([0.5, 0.5]);
    // a new key, so the engine lays it out again once it relaxes
    expect(records[1].key).not.toBe(flatten(node, noSizes)[1].key);
    // widths for another number of columns don't fit
    const other = flatten(node, noSizes, { pos: 3, widths: [1] })[1].build();
    if (other.kind !== "table") throw new Error("no table");
    expect(other.widths).toEqual(free.widths);
  });

  it("keys records by what they look like", () => {
    const [plain] = flatten(doc(p("a")), noSizes);
    const [listed] = flatten(doc(ul(li(p("a")))), noSizes);
    expect(plain.key).not.toBe(listed.key);
  });
});

describe("diff", () => {
  const base = doc(p("one"), p("two"), p("three"), p("four"));

  it("keeps what didn't change at the start and the end", () => {
    const before = flatten(base, noSizes);
    // type into "two"
    const changed = base.replace(6, 6, doc(p("x")).slice(1, 2));
    const after = flatten(changed, noSizes);
    const change = diff(
      before,
      after,
      changed.content.size - base.content.size,
    );
    expect(change).toMatchObject({ start: 1, delete: 1, shift: 1 });
    expect(change.records.map((record) => record.build())).toMatchObject([
      { text: "xtwo" },
    ]);
  });

  it("finds inserted and deleted items", () => {
    const before = flatten(base, noSizes);
    // ProseMirror keeps the nodes that didn't change
    const [one, two, three, four] = base.children;
    const inserted = doc(one, p("new"), two, three, four);
    const change = diff(before, flatten(inserted, noSizes), 5);
    expect(change.delete).toBe(0);
    expect(change.records.length).toBe(1);
    expect(diff(before, before, 0)).toMatchObject({
      start: 4,
      delete: 0,
      records: [],
    });
  });
});
