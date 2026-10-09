import { EditorState } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { describe, expect, it, vi } from "vitest";

import { spellcheck, spellcheckKey } from "../editor/plugins/spellcheck";
import { documentFields } from "../layout/bands";
import { schema } from "../markdown";
import { doc, p } from "../test/editor";
import { layOutPages, testEngine } from "../test/engine";
import { testLayout } from "../test/layout";
import type { PageEngine } from "../engine/engine";
import {
  MARK_LOOKS,
  type MarkSource,
  PageMarksMemo,
  shownMarks,
} from "./pageMarks";

// the spell check's decorations, as the page view hands them over
const spellingSource = (
  decorations: MarkSource["decorations"],
): MarkSource[] => [{ decorations, kind: "spelling" }];

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
  const engine = layOutPages(node);
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

describe("the marks on a page", () => {
  it("underline misspelled words and label page breaks", () => {
    const { engine, state } = setup();
    expect(engine.pages()).toBe(2);
    const memo = new PageMarksMemo();
    const decorations = spellcheckKey.getState(state)?.decorations;
    const marksOn = (page: number) =>
      shownMarks(
        memo.marksOn(engine, state.doc, spellingSource(decorations), page, 1),
      );
    const marks = marksOn(0);
    const spelling = marks.filter((mark) => mark.kind === "spelling");
    expect(spelling).toHaveLength(1);
    // as wide as the word's text
    expect(spelling[0].width).toBeCloseTo(engine.selection(1, 5)[0].width, 1);
    expect(marks.filter((mark) => mark.kind === "break")).toHaveLength(1);
    // the second page has neither
    expect(marksOn(1)).toEqual([]);
  });
});

describe("the matches of find on a page", () => {
  it("show under the text, the current one apart, a code node as a whole", () => {
    const engine = layOutPages(node);
    const state = EditorState.create({ schema, doc: node });
    const from = state.doc.textContent.indexOf("speling") + 1;
    const decorations = DecorationSet.create(state.doc, [
      Decoration.inline(from, from + 7, {}),
    ]);
    const measure = vi.spyOn(engine, "selection");
    const marks = shownMarks(
      new PageMarksMemo().marksOn(
        engine,
        state.doc,
        [
          { decorations, kind: "find" },
          {
            decorations,
            kind: "find-current",
            range: (start) => [start, start + 2],
          },
        ],
        0,
        1,
      ),
    );
    // and the page break the page has
    expect(marks.map((mark) => mark.kind)).toEqual([
      "find",
      "find-current",
      "break",
    ]);
    expect(MARK_LOOKS.find.under).toBe(true);
    expect(MARK_LOOKS.spelling.under).toBe(false);
    // the range the source gives is what's measured
    expect(measure).toHaveBeenCalledWith(from, from + 2);
  });
});

describe("PageMarksMemo", () => {
  // a misspelled word on the second page, after a page break
  const twoPages = doc(
    p("first page text"),
    schema.nodes.page_break.create(),
    p("short"),
    p("then wrng on the second page"),
  );
  const at = (node: typeof twoPages, word: string) => {
    let found = -1;
    node.descendants((child, pos) => {
      if (found < 0 && child.isText && child.text!.includes(word))
        found = pos + child.text!.indexOf(word);
    });
    return found;
  };
  const setUp = () => {
    const engine = testEngine();
    engine.setSettings(testLayout(), documentFields(twoPages));
    engine.sync(twoPages, () => undefined);
    const from = at(twoPages, "wrng");
    const decorations = DecorationSet.create(twoPages, [
      Decoration.inline(from, from + 4, {}, { word: "wrng" }),
    ]);
    return { engine, decorations };
  };
  const versionOf = (engine: PageEngine, page: number) =>
    engine.raw.bodyVersions()[page];

  it("measures a page's marks again only when they change", () => {
    const { engine, decorations } = setUp();
    const memo = new PageMarksMemo();
    const measure = vi.spyOn(engine, "selection");
    const first = memo.marksOn(
      engine,
      twoPages,
      spellingSource(decorations),
      1,
      versionOf(engine, 1),
    );
    expect(shownMarks(first).map((mark) => mark.kind)).toEqual(["spelling"]);
    const measured = measure.mock.calls.length;
    // asked again, nothing is measured, and the very same string comes back
    expect(
      memo.marksOn(
        engine,
        twoPages,
        spellingSource(decorations),
        1,
        versionOf(engine, 1),
      ),
    ).toBe(first);
    expect(measure.mock.calls.length).toBe(measured);
    // the first page has the break's label
    expect(
      shownMarks(
        memo.marksOn(
          engine,
          twoPages,
          spellingSource(decorations),
          0,
          versionOf(engine, 0),
        ),
      ).map((mark) => mark.kind),
    ).toEqual(["break"]);
  });

  it("keeps a page's marks while text is typed on another page", () => {
    const { engine, decorations } = setUp();
    const memo = new PageMarksMemo();
    const before = memo.marksOn(
      engine,
      twoPages,
      spellingSource(decorations),
      1,
      versionOf(engine, 1),
    );
    // a word typed on the first page moves everything after it
    const state = EditorState.create({ schema, doc: twoPages });
    const tr = state.tr.insertText("more ", 1);
    engine.sync(tr.doc, () => undefined);
    const measure = vi.spyOn(engine, "selection");
    const after = memo.marksOn(
      engine,
      tr.doc,
      spellingSource(decorations.map(tr.mapping, tr.doc)),
      1,
      versionOf(engine, 1),
    );
    expect(after).toBe(before);
    expect(measure).not.toHaveBeenCalled();
  });

  it("keys a mark by its place on the page, which an edit above it keeps", () => {
    const { engine, decorations } = setUp();
    const memo = new PageMarksMemo();
    const before = shownMarks(
      memo.marksOn(
        engine,
        twoPages,
        spellingSource(decorations),
        1,
        versionOf(engine, 1),
      ),
    );
    // on the same page, in the line above the word's
    const state = EditorState.create({ schema, doc: twoPages });
    const tr = state.tr.insertText("er", at(twoPages, "short") + 5);
    engine.sync(tr.doc, () => undefined);
    const after = shownMarks(
      memo.marksOn(
        engine,
        tr.doc,
        spellingSource(decorations.map(tr.mapping, tr.doc)),
        1,
        versionOf(engine, 1),
      ),
    );
    expect(after.map((mark) => mark.key)).toEqual(
      before.map((mark) => mark.key),
    );
  });
});
