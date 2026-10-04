import { describe, expect, it, vi } from "vitest";
import type { Command, EditorState } from "prosemirror-state";

import { CommandIdentifier as C } from "../config";
import { schema } from "../markdown";
import type { MenuItem } from "../state";
import {
  aligned,
  blockquote,
  codeBlock,
  createState,
  doc,
  h,
  li,
  p,
  table,
  td,
  tr,
  ul,
} from "../test/editor";
import {
  entries,
  type FormatItem,
  formatItems,
  insertMenuItems,
  moreMenuItems,
  OVERFLOW_ORDER,
  overflowCut,
  PARTS,
  type PartId,
  pressedOf,
  styleLabel,
  styleMenuItems,
} from "./formatToolbarModel";

const can = (state: EditorState) => (command: Command) => command(state);
const itemsOf = (state: EditorState, run = vi.fn()) =>
  formatItems(state, can(state), run);
const byId = (items: FormatItem[], id: C) =>
  items.find((item) => item.id === id)!;
const entry = (items: MenuItem[], id: string) =>
  items.find((item) => item !== "separator" && item.id === id) as Exclude<
    MenuItem,
    "separator"
  >;

describe("formatItems", () => {
  it("makes a button of every command of the row, in its order", () => {
    const items = itemsOf(createState(doc(p("x"))));
    expect(items.map((item) => item.id)).toEqual(
      PARTS.flatMap((part) => part.commands ?? []),
    );
    const bold = byId(items, C.FORMAT_BOLD);
    expect(bold).toMatchObject({
      label: "Bold",
      icon: "bold",
      command: C.FORMAT_BOLD,
      part: "marks",
    });
  });

  it("runs a button's command by its id", () => {
    const run = vi.fn();
    byId(itemsOf(createState(doc(p("x"))), run), C.FORMAT_ITALIC).run();
    expect(run).toHaveBeenCalledWith(C.FORMAT_ITALIC);
  });

  it("keeps the buttons whose state didn't change", () => {
    const text = doc(
      schema.node("paragraph", null, [
        schema.text("bold", [schema.marks.strong.create()]),
        schema.text(" plain"),
      ]),
    );
    const plain = createState(text, { cursor: 8 });
    const first = itemsOf(plain);
    const typed = plain.apply(plain.tr.insertText("x"));
    const second = formatItems(typed, can(typed), vi.fn(), first);
    expect(second.every((item, index) => item === first[index])).toBe(true);
    // in the bold text, Bold is pressed: a new object for it alone
    const bold = createState(text, { cursor: 3 });
    const third = formatItems(bold, can(bold), vi.fn(), second);
    expect(byId(third, C.FORMAT_BOLD).checked).toBe(true);
    expect(byId(third, C.FORMAT_BOLD)).not.toBe(byId(second, C.FORMAT_BOLD));
    expect(byId(third, C.FORMAT_ITALIC)).toBe(byId(second, C.FORMAT_ITALIC));
  });

  it("disables what doesn't apply", () => {
    const listed = itemsOf(createState(doc(ul(li(p("a"))))));
    expect(byId(listed, C.FORMAT_ALIGN_CENTER).enabled).toBe(false);
    const plain = itemsOf(createState(doc(p("a"))));
    expect(byId(plain, C.UNDO).enabled).toBe(false);
    expect(byId(plain, C.FORMAT_INDENT).enabled).toBe(false);
    expect(byId(plain, C.FORMAT_ALIGN_JUSTIFY).enabled).toBe(true);
    const cell = itemsOf(createState(doc(table(tr(td("a")))), { cursor: 4 }));
    expect(byId(cell, C.FORMAT_ALIGN_JUSTIFY).enabled).toBe(false);
    expect(byId(cell, C.FORMAT_ALIGN_RIGHT).enabled).toBe(true);
    const code = itemsOf(createState(doc(codeBlock("a"))));
    expect(byId(code, C.FORMAT_INDENT).enabled).toBe(true);
  });
});

describe("pressedOf", () => {
  it("presses the list, quote and alignment the selection has", () => {
    const listed = createState(doc(ul(li(p("a")))));
    expect(pressedOf(C.BLOCKTYPE_BULLET_LIST, listed)).toBe(true);
    expect(pressedOf(C.BLOCKTYPE_ORDERED_LIST, listed)).toBe(false);
    expect(
      pressedOf(C.FORMAT_BLOCKQUOTE, createState(doc(blockquote(p("a"))))),
    ).toBe(true);
    const centered = createState(doc(aligned("center", p("a"))));
    expect(pressedOf(C.FORMAT_ALIGN_CENTER, centered)).toBe(true);
    expect(pressedOf(C.FORMAT_ALIGN_LEFT, centered)).toBe(false);
    expect(pressedOf(C.FORMAT_ALIGN_LEFT, createState(doc(p("a"))))).toBe(true);
    // where alignment doesn't apply, none is pressed
    expect(pressedOf(C.FORMAT_ALIGN_LEFT, listed)).toBe(false);
  });

  it("presses the marks of the caret, links included", () => {
    const linked = createState(
      doc(
        schema.node("paragraph", null, [
          schema.text("site", [
            schema.marks.link.create({ href: "https://example.org" }),
            schema.marks.underline.create(),
            schema.marks.em.create(),
            schema.marks.code.create(),
          ]),
        ]),
      ),
      { cursor: [1, 5] },
    );
    for (const id of [
      C.FORMAT_LINK,
      C.FORMAT_UNDERLINE,
      C.FORMAT_ITALIC,
      C.FORMAT_CODE,
    ]) {
      expect(pressedOf(id, linked)).toBe(true);
    }
    expect(pressedOf(C.FORMAT_BOLD, linked)).toBe(false);
  });

  it("leaves buttons that aren't toggles unpressed", () => {
    expect(pressedOf(C.UNDO, createState(doc(p("a"))))).toBeUndefined();
  });
});

describe("entries", () => {
  const items = itemsOf(createState(doc(p("x"))));

  it("shows every part, with separators between groups", () => {
    const shown = entries(items, new Set());
    const kinds = shown.map((entry) =>
      entry.kind === "button"
        ? entry.item.id
        : entry.kind === "menu"
          ? entry.menu
          : entry.kind,
    );
    expect(kinds).toEqual([
      C.UNDO,
      C.REDO,
      "separator",
      "style",
      "separator",
      C.FORMAT_BOLD,
      C.FORMAT_ITALIC,
      C.FORMAT_UNDERLINE,
      C.FORMAT_CODE,
      C.FORMAT_LINK,
      "separator",
      C.BLOCKTYPE_BULLET_LIST,
      C.BLOCKTYPE_ORDERED_LIST,
      C.FORMAT_BLOCKQUOTE,
      C.FORMAT_UNINDENT,
      C.FORMAT_INDENT,
      "separator",
      C.FORMAT_ALIGN_LEFT,
      C.FORMAT_ALIGN_CENTER,
      C.FORMAT_ALIGN_RIGHT,
      C.FORMAT_ALIGN_JUSTIFY,
      "separator",
      "insert",
    ]);
  });

  it("leaves out the parts cut and ends in More", () => {
    const shown = entries(items, new Set<PartId>(["insert", "align"]));
    expect(shown[shown.length - 1]).toEqual({ kind: "more", key: "more" });
    expect(
      shown.some((entry) => entry.kind === "menu" && entry.menu === "insert"),
    ).toBe(false);
    expect(
      shown.some((entry) => entry.kind === "button" && entry.part === "align"),
    ).toBe(false);
  });
});

describe("overflowCut", () => {
  const widths = Object.fromEntries(
    PARTS.map((part) => [part.id, 100]),
  ) as Record<PartId, number>;

  it("cuts nothing when the row fits", () => {
    expect(overflowCut(widths, 30, 700).size).toBe(0);
  });

  it("cuts in order until the rest and More fit, never what stays", () => {
    expect([...overflowCut(widths, 30, 690)]).toEqual(["insert"]);
    expect([...overflowCut(widths, 30, 530)]).toEqual(["insert", "align"]);
    expect([...overflowCut(widths, 30, 10)]).toEqual([...OVERFLOW_ORDER]);
  });
});

describe("the style menu", () => {
  it("names the style, and nothing where it differs", () => {
    expect(styleLabel("paragraph")).toBe("Text");
    expect(styleLabel("heading2")).toBe("Heading 2");
    expect(styleLabel("quote")).toBe("Quote");
    expect(styleLabel("code_block")).toBe("Code block");
    expect(styleLabel(null)).toBe("");
  });

  it("checks the selection's style, which stays enabled, and draws each in its style", () => {
    const state = createState(doc(h(2, "a")));
    const run = vi.fn();
    const items = styleMenuItems(state, can(state), run);
    expect(items.filter((item) => item === "separator")).toHaveLength(1);
    const current = entry(items, "style-heading2");
    expect(current).toMatchObject({
      checked: true,
      radio: true,
      look: "style-heading2",
    });
    expect(current.disabled).toBe(false);
    current.run!();
    expect(run).not.toHaveBeenCalled();
    entry(items, "style-paragraph").run!();
    expect(run).toHaveBeenCalledWith(C.BLOCKTYPE_PARAGRAPH);
  });

  it("takes text out of a quote", () => {
    const state = createState(doc(blockquote(p("a"))));
    const run = vi.fn();
    const items = styleMenuItems(state, can(state), run);
    expect(entry(items, "style-quote").checked).toBe(true);
    entry(items, "style-paragraph").run!();
    expect(run).toHaveBeenCalledWith(C.FORMAT_BLOCKQUOTE);
  });
});

describe("the Insert and More menus", () => {
  const anchor = { left: 1, top: 2, bottom: 3 };

  it("inserts an image, a table at the button, a line and a page break", () => {
    const state = createState(doc(p("a")));
    const run = vi.fn();
    const runCommand = vi.fn();
    const items = insertMenuItems(can(state), run, runCommand, anchor);
    expect(items.map((item) => item !== "separator" && item.label)).toEqual([
      "Image…",
      "Table",
      "Horizontal line",
      "Page break",
    ]);
    entry(items, C.INSERT_TABLE).run!();
    expect(runCommand).toHaveBeenCalledOnce();
    entry(items, C.INSERT_PAGE_BREAK).run!();
    expect(run).toHaveBeenCalledWith(C.INSERT_PAGE_BREAK);
    // no table in a table
    const cell = createState(doc(table(tr(td("a")))), { cursor: 4 });
    const inCell = insertMenuItems(can(cell), run, runCommand, anchor);
    expect(entry(inCell, C.INSERT_TABLE).disabled).toBe(true);
  });

  it("holds the cut parts' buttons and Insert as a submenu", () => {
    const state = createState(doc(p("a")));
    const items = itemsOf(state);
    const more = moreMenuItems(
      items,
      new Set<PartId>(["insert", "align"]),
      () => insertMenuItems(can(state), vi.fn(), vi.fn(), anchor),
    );
    const center = entry(more, `more-${C.FORMAT_ALIGN_CENTER}`);
    expect(center).toMatchObject({ label: "Center", icon: "align-center" });
    const left = entry(more, `more-${C.FORMAT_ALIGN_LEFT}`);
    expect(left.checked).toBe(true);
    expect(entry(more, "more-insert").children).toHaveLength(4);
    expect(more.filter((item) => item === "separator")).toHaveLength(1);
  });
});
