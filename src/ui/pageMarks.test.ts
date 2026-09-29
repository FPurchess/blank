import { EditorState } from "prosemirror-state";
import { Decoration } from "prosemirror-view";
import { describe, expect, it } from "vitest";

import { spellcheck, spellcheckKey } from "../editor/plugins/spellcheck";
import { documentFields } from "../layout/bands";
import { schema } from "../markdown";
import { doc, p } from "../test/editor";
import { testEngine } from "../test/engine";
import { testLayout } from "../test/layout";
import { marksOn } from "./pageMarks";

const LONG =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";

// "wrng" misspelled at 1..5 on the first page, a page break, and more text
// on the second page
const node = doc(
  p("wrng text"),
  schema.nodes.page_break.create(),
  ...Array.from({ length: 3 }, () => p(LONG)),
);

const setup = () => {
  const engine = testEngine();
  engine.setSettings(testLayout(), documentFields(node));
  engine.sync(node, () => undefined);
  let state = EditorState.create({
    schema,
    doc: node,
    plugins: [spellcheck()],
  });
  state = state.apply(
    state.tr.setMeta(spellcheckKey, {
      type: "results",
      ranges: "all",
      decorations: [Decoration.inline(1, 5, {}, { word: "wrng" })],
      dirty: "all",
    }),
  );
  return { engine, state };
};

describe("marksOn", () => {
  it("underlines misspelled words and labels page breaks on the pages", () => {
    const { engine, state } = setup();
    expect(engine.pages()).toBe(2);
    const marks = marksOn(engine, state, [0, 1]);
    const spelling = marks.filter((mark) => mark.kind === "spelling");
    expect(spelling).toHaveLength(1);
    expect(spelling[0]).toMatchObject({ page: 0 });
    // as wide as the word's text
    expect(spelling[0].width).toBeCloseTo(engine.selection(1, 5)[0].width, 3);
    const breaks = marks.filter((mark) => mark.kind === "break");
    expect(breaks).toHaveLength(1);
    expect(breaks[0].page).toBe(0);
    // only on the pages asked for
    expect(marksOn(engine, state, [1])).toEqual([]);
  });
});
