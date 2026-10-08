import { EditorState, type Transaction } from "prosemirror-state";
import { describe, expect, it } from "vitest";

import { schema } from "../../../markdown";
import { findPanel } from "../../../state";
import { doc, p } from "../../../test/editor";
import { replaceAllFound, setFind } from "./commands";
import { find } from "./index";

// How long a keystroke takes while find is open, on a long document: it must
// stay under about 4 ms (see .claude/rules/find.md). Only with BENCH=1, on a
// quiet machine.
const SENTENCE =
  "The quick brown fox jumps over the lazy dog, and then the dog sleeps in the sun. ";

describe.runIf(process.env.BENCH)("find on a long document", () => {
  it.each(["the", "zebra"])(
    "follows typing quickly, looking for %s",
    (query) => {
      // about 300 pages of text
      const long = doc(
        ...Array.from({ length: 3000 }, () => p(SENTENCE.repeat(3))),
      );
      let state = EditorState.create({ schema, doc: long, plugins: [find()] });
      findPanel.value = { id: 1 };
      setFind({ query })(state, (tr) => (state = state.apply(tr)));
      const times: number[] = [];
      for (let i = 0; i < 60; i++) {
        const tr = state.tr.insertText("x", 50_000 + i);
        const start = performance.now();
        state = state.apply(tr);
        times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b);
      const median = times[Math.floor(times.length / 2)];
      console.log(
        `find "${query}": median ${median.toFixed(2)} ms, p90 ${times[54].toFixed(2)} ms`,
      );
      expect(median).toBeLessThan(4);
      findPanel.value = null;
    },
  );

  it("replaces thousands of matches quickly", () => {
    const long = doc(...Array.from({ length: 3000 }, () => p(SENTENCE)));
    let state = EditorState.create({ schema, doc: long, plugins: [find()] });
    findPanel.value = { id: 1 };
    const dispatch = (tr: Transaction) => (state = state.apply(tr));
    setFind({ query: "the" })(state, dispatch);
    const start = performance.now();
    replaceAllFound("a")(state, dispatch);
    const took = performance.now() - start;
    console.log(`replace all of 12000: ${took.toFixed(0)} ms`);
    expect(took).toBeLessThan(2000);
    findPanel.value = null;
  });
});
