import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { history, undo } from "prosemirror-history";
import { schema } from "prosemirror-markdown";

import { doc, p } from "../../test/editor";
import { spellchecker } from "../../state";
import type { Spellchecker } from "../../spellcheck/types";
import newFile from "../commands/newFile";
import {
  ignoreAll,
  misspellingAt,
  nextMisspelling,
  occurrences,
  spellcheck,
  spellcheckKey,
} from "./spellcheck";

const DICTIONARY = new Set([
  "this",
  "is",
  "a",
  "text",
  "and",
  "the",
  "well",
  "known",
  "well-known",
  "l’homme",
]);

/**
 * fakeChecker accepts the words in DICTIONARY, regardless of the first letter's
 * case, and counts the words it is asked to check
 */
const fakeChecker = (tag = "en") => {
  const results = new Map<string, boolean>();
  const checked: string[][] = [];
  const checker: Spellchecker = {
    tag,
    isCorrect: (word) => results.get(word),
    check: vi.fn(async (words: string[]) => {
      checked.push(words);
      for (const word of words) {
        const lower = word.charAt(0).toLowerCase() + word.slice(1);
        results.set(word, DICTIONARY.has(word) || DICTIONARY.has(lower));
      }
    }),
    suggest: vi.fn(async () => []),
    userEntry: () => undefined,
    addWord: vi.fn(),
    removeWord: vi.fn(),
    replaceWord: vi.fn(),
  };
  return { checker, checked };
};

let view: EditorView;

const setup = (node = doc(p("this is wrng"))) => {
  const state = EditorState.create({
    schema,
    doc: node,
    plugins: [history(), spellcheck()],
  });
  view = new EditorView(document.createElement("div"), { state });
  return view;
};

const flagged = () =>
  spellcheckKey
    .getState(view.state)!
    .decorations.find()
    .map((d) => view.state.doc.textBetween(d.from, d.to));

const settle = async () => {
  await vi.runAllTimersAsync();
};

const typeAt = (text: string, pos = view.state.doc.content.size - 1) => {
  for (const char of text) {
    view.dispatch(
      view.state.tr
        .setSelection(TextSelection.create(view.state.doc, pos))
        .insertText(char),
    );
    pos += char.length;
  }
};

describe("plugin.spellcheck", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    spellchecker.value = null;
  });

  afterEach(() => {
    view?.destroy();
    spellchecker.value = null;
  });

  it("flags nothing without a spell checker", async () => {
    setup();
    await settle();

    expect(flagged()).toEqual([]);
    expect(view.dom.getAttribute("spellcheck")).toBe("false");
  });

  it("flags misspelled words once there is a spell checker", async () => {
    setup();
    spellchecker.value = fakeChecker().checker;
    await settle();

    expect(flagged()).toEqual(["wrng"]);
    const [decoration] = spellcheckKey.getState(view.state)!.decorations.find();
    expect(decoration.spec.word).toBe("wrng");
  });

  it("clears the flags when the spell checker goes away", async () => {
    setup();
    spellchecker.value = fakeChecker().checker;
    await settle();

    spellchecker.value = null;
    await settle();

    expect(flagged()).toEqual([]);
  });

  it("doesn't flag the word being typed until it is complete", async () => {
    setup(doc(p("this ")));
    spellchecker.value = fakeChecker().checker;
    await settle();

    typeAt("wrng");
    await settle();
    expect(flagged()).toEqual([]);

    typeAt(" ");
    await settle();
    expect(flagged()).toEqual(["wrng"]);
  });

  it("flags the typed word once the cursor leaves it", async () => {
    setup(doc(p("this ")));
    spellchecker.value = fakeChecker().checker;
    await settle();

    typeAt("wrng");
    await settle();
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)),
    );
    await settle();

    expect(flagged()).toEqual(["wrng"]);
  });

  it("checks only the changed text", async () => {
    setup(doc(p("this is wrng"), p("a text")));
    const { checker, checked } = fakeChecker();
    spellchecker.value = checker;
    await settle();
    checked.length = 0;

    typeAt(" tset", view.state.doc.content.size - 1);
    typeAt(" ");
    await settle();

    expect(checked.flat()).toEqual(["tset"]);
    expect(flagged()).toEqual(["wrng", "tset"]);
  });

  it("checks hyphenated words whole and by part", async () => {
    setup(doc(p("a well-known well-knwon wel-known")));
    spellchecker.value = fakeChecker().checker;
    await settle();

    expect(flagged()).toEqual(["knwon", "wel"]);
  });

  it("ignores a word everywhere until the document is replaced", async () => {
    setup(doc(p("wrng and Wrng")));
    spellchecker.value = fakeChecker().checker;
    await settle();
    expect(flagged()).toEqual(["wrng", "Wrng"]);

    view.dispatch(ignoreAll(view.state, "wrng"));
    expect(flagged()).toEqual([]);
    typeAt(" wrng ");
    await settle();
    expect(flagged()).toEqual([]);

    newFile()(view.state, view.dispatch);
    typeAt("wrng ", 1);
    await settle();
    expect(flagged()).toEqual(["wrng"]);
  });

  it("checks everything again for a new spell checker", async () => {
    setup();
    spellchecker.value = fakeChecker().checker;
    await settle();

    const { checker, checked } = fakeChecker("de");
    spellchecker.value = checker;
    await settle();

    expect(checked.flat()).toEqual(["this", "is", "wrng"]);
    expect(flagged()).toEqual(["wrng"]);
  });

  it("drops results for text that changed during the check", async () => {
    setup();
    const { checker } = fakeChecker();
    let finish = () => {};
    vi.mocked(checker.check).mockImplementationOnce(
      (words) =>
        new Promise<void>((resolve) => {
          // answers nothing, like a check of a text that is gone
          finish = () => resolve(void words);
        }),
    );
    spellchecker.value = checker;
    await vi.advanceTimersByTimeAsync(0);

    // the text changes while the check runs
    const tr = view.state.tr.insertText("x", 1);
    view.dispatch(tr.setSelection(TextSelection.atEnd(tr.doc)));
    finish();
    await settle();

    expect(flagged()).toEqual(["xthis", "wrng"]);
  });

  it("keeps undo free of its own transactions", async () => {
    setup(doc(p("this ")));
    spellchecker.value = fakeChecker().checker;
    await settle();

    typeAt("wrng ");
    await settle();
    undo(view.state, view.dispatch);

    expect(view.state.doc.textContent).toBe("this ");
  });

  it("finds the misspelling at a position and the next one", async () => {
    setup(doc(p("wrng this tset")));
    spellchecker.value = fakeChecker().checker;
    await settle();

    expect(misspellingAt(view.state, 3)).toEqual({
      from: 1,
      to: 5,
      word: "wrng",
    });
    expect(misspellingAt(view.state, 7)).toBeUndefined();
    expect(nextMisspelling(view.state, 1, 1)?.word).toBe("tset");
    // wraps around
    expect(nextMisspelling(view.state, 12, 1)?.word).toBe("wrng");
    expect(nextMisspelling(view.state, 12, -1)?.word).toBe("wrng");
    expect(nextMisspelling(view.state, 1, -1)?.word).toBe("tset");
  });

  it("finds nothing next without misspellings", () => {
    setup(doc(p("this")));

    expect(nextMisspelling(view.state, 1, 1)).toBeUndefined();
  });

  it("finds all occurrences of a word outside code", () => {
    const code = schema.marks.code.create();
    setup(
      doc(
        p("wrng and Wrng"),
        schema.node("paragraph", null, [schema.text("wrng", [code])]),
      ),
    );

    expect(occurrences(view.state, "WRNG").map((w) => w.text)).toEqual([
      "wrng",
      "Wrng",
    ]);
  });
});
