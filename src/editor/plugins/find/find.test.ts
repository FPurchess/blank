import { history, undo } from "prosemirror-history";
import { EditorState, type Transaction } from "prosemirror-state";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { schema } from "../../../markdown";
import {
  announcement,
  findOptions,
  findPanel,
  NO_FIND_OPTIONS,
} from "../../../state";
import { doc, docWithFrontmatter, p } from "../../../test/editor";
import {
  closeFind,
  openFind,
  replaceAllFound,
  replaceFound,
  setFind,
  stepFind,
} from "./commands";
import { find } from "./index";
import { findKey, paintedRange, STORE_CAP } from "./state";

// an editor state with find, history to undo with, and a dispatch that
// keeps it
const editor = (node = doc(p("one two one"), p("one"))) => {
  let state = EditorState.create({
    schema,
    doc: node,
    plugins: [history(), find()],
  });
  const dispatch = (tr: Transaction) => {
    state = state.apply(tr);
  };
  const run = (command: (s: EditorState, d?: typeof dispatch) => boolean) =>
    command(state, dispatch);
  return {
    run,
    get state() {
      return state;
    },
    found: () => findKey.getState(state)!,
    texts: () =>
      findKey
        .getState(state)!
        .matches.map(({ from, to }) => state.doc.textBetween(from, to)),
    text: () => state.doc.textContent,
    type: (text: string, pos: number) =>
      dispatch(state.tr.insertText(text, pos)),
    undo: () => undo(state, dispatch),
  };
};

beforeEach(() => {
  findOptions.value = NO_FIND_OPTIONS;
});

afterEach(() => {
  findPanel.value = null;
});

describe("find", () => {
  it("opens the panel with what's selected, or what it looked for last", () => {
    const e = editor();
    expect(e.run(openFind())).toBe(true);
    expect(findPanel.value).not.toBeNull();
    expect(e.found()).toMatchObject({ active: true, query: "" });

    e.run(setFind({ query: "one" }));
    e.run(closeFind(false));
    expect(findPanel.value).toBeNull();
    expect(e.found()).toMatchObject({ active: false, query: "one" });
    e.run(openFind());
    expect(e.found().query).toBe("one");
  });

  it("counts the matches, the one after the cursor current, and steps round", () => {
    const e = editor();
    e.run(openFind());
    e.run(setFind({ query: "one" }));
    expect(e.texts()).toEqual(["one", "one", "one"]);
    expect(e.found().current).toBe(0);
    e.run(stepFind(1));
    e.run(stepFind(1));
    e.run(stepFind(1));
    expect(e.found().current).toBe(0);
    e.run(stepFind(-1));
    expect(e.found().current).toBe(2);
  });

  it("follows edits, matching only the textblocks they changed again", () => {
    const e = editor();
    e.run(openFind());
    e.run(setFind({ query: "one" }));
    e.type("one ", 1);
    expect(e.texts()).toEqual(["one", "one", "one", "one"]);
    // a match broken by typing in it is gone
    e.type("x", 2);
    expect(e.texts()).toHaveLength(3);
  });

  it("keeps following edits while the panel is closed in another tab", () => {
    const e = editor();
    e.run(openFind());
    e.run(setFind({ query: "one" }));
    findPanel.value = null;
    e.type("one ", 1);
    // the page view and the editor show none of it without the panel
    expect(e.found()).toMatchObject({ active: true, query: "one" });
    expect(e.texts()).toHaveLength(4);
  });

  it("replaces the current match and moves on, also when the new text matches", () => {
    const e = editor();
    e.run(openFind());
    e.run(setFind({ query: "one" }));
    e.run(replaceFound("one one"));
    expect(e.text()).toBe("one one two oneone");
    // the next match is the one after what was put in
    expect(e.found().matches[e.found().current].from).toBeGreaterThan(8);
  });

  it("replaces every match as one step to undo, and says how many", () => {
    const e = editor();
    e.run(openFind());
    e.run(setFind({ query: "one" }));
    e.run(replaceAllFound("1"));
    expect(e.text()).toBe("1 two 11");
    expect(announcement.value?.text).toBe("Replaced 3");
    e.undo();
    expect(e.text()).toBe("one two oneone");
  });

  it("replaces in the marks of the text, not the ones stored for typing", () => {
    const bold = schema.marks.strong.create();
    const e = editor(
      doc(
        schema.node("paragraph", null, [
          schema.text("one", [bold]),
          schema.text(" two"),
        ]),
      ),
    );
    e.run(openFind());
    e.run(setFind({ query: "two" }));
    // as after Mod-B with an empty selection
    e.run((state, dispatch) => {
      dispatch?.(state.tr.setStoredMarks([bold]));
      return true;
    });
    e.run(replaceAllFound("2"));
    const last = e.state.doc.firstChild!.lastChild!;
    expect(last.text).toBe(" 2");
    expect(last.marks).toEqual([]);
  });

  it("replaces thousands of matches at once, in one step to undo", () => {
    const e = editor(
      doc(...Array.from({ length: 300 }, () => p("a b a b a b a b a b"))),
    );
    e.run(openFind());
    e.run(setFind({ query: "a" }));
    e.run(replaceAllFound("c"));
    expect(e.text()).not.toContain("a");
    e.undo();
    expect(e.text()).not.toContain("c");
  });

  it("replaces with the groups of a regular expression", () => {
    const e = editor(doc(p("ann@x bob@y")));
    e.run(openFind());
    e.run(
      setFind({
        query: "(\\w+)@",
        options: { matchCase: false, wholeWord: false, regex: true },
      }),
    );
    e.run(replaceAllFound("$1 at "));
    expect(e.text()).toBe("ann at x bob at y");
  });

  it("says why a pattern can't be read, and finds nothing", () => {
    const e = editor();
    e.run(openFind());
    e.run(
      setFind({
        query: "(one",
        options: { matchCase: false, wholeWord: false, regex: true },
      }),
    );
    expect(e.found().error).toBeTruthy();
    expect(e.found().matches).toEqual([]);
    expect(e.run(replaceAllFound("x"))).toBe(false);
  });

  it("never looks in the frontmatter", () => {
    const e = editor(docWithFrontmatter("title: one", p("one")));
    e.run(openFind());
    e.run(setFind({ query: "one" }));
    e.run(replaceAllFound("1"));
    expect(e.text()).toBe("1");
    expect(e.state.doc.attrs.frontmatter).toContain("title: one");
  });

  it("keeps each tab's search in its own state", () => {
    const first = editor(doc(p("alpha")));
    const second = editor(doc(p("beta")));
    first.run(openFind());
    first.run(setFind({ query: "alpha" }));
    second.run(setFind({ query: "beta" }));
    expect(first.found().query).toBe("alpha");
    expect(second.found().query).toBe("beta");
  });

  it("selects the current match when the panel closes with Esc", () => {
    const e = editor();
    e.run(openFind());
    e.run(setFind({ query: "two" }));
    e.run(closeFind(true));
    const { from, to } = e.state.selection;
    expect(e.state.doc.textBetween(from, to)).toBe("two");
  });

  it("keeps at most STORE_CAP matches, and says there are more", () => {
    const e = editor(doc(p("a".repeat(STORE_CAP + 5))));
    e.run(openFind());
    e.run(setFind({ query: "a" }));
    expect(e.found().matches).toHaveLength(STORE_CAP);
    expect(e.found().more).toBe(true);
  });

  it("paints a match in a node of code as the whole node", () => {
    const node = doc(p("one"));
    // without such a node, the match itself
    expect(paintedRange(node)(1, 4)).toEqual([1, 4]);
  });
});
