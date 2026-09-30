import {
  joinBackward,
  lift,
  setBlockType,
  splitBlock,
  wrapIn,
} from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { Slice } from "prosemirror-model";
import { sinkListItem, wrapInList } from "prosemirror-schema-list";
import {
  type Command,
  EditorState,
  Selection,
  TextSelection,
  type Transaction,
} from "prosemirror-state";
import { describe, expect, it, vi } from "vitest";

import { trackChanges, type TrackedChanges } from "../editor/plugins/pageView";
import { documentFields } from "../layout/bands";
import { schema } from "../markdown";
import { blockquote, doc, h, li, p, table, td, tr, ul } from "../test/editor";
import { testEngine } from "../test/engine";
import { testLayout } from "../test/layout";
import type { PageEngine } from "./engine";
import * as flattening from "./flatten";
import { type FlatRecord, flatten } from "./flatten";

// The engine flattens again only the blocks a change touched. After any
// sequence of real edits, what it has must be what flattening the whole
// document gives, and its pages what a fresh engine lays out.

const noSizes = () => undefined;

// a seeded random number generator (mulberry32), so a failure repeats
const random = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const recordsOf = (engine: PageEngine) =>
  (engine as unknown as { records: FlatRecord[] }).records;

const start = () =>
  doc(
    h(1, "Title"),
    p("First paragraph with some words"),
    blockquote(p("quoted"), p("more quoted")),
    ul(li(p("one")), li(p("two"))),
    h(2, "Section"),
    h(3, "Subsection"),
    table(tr(td("a"), td("b")), tr(td("c"), td("d"))),
    p("Last paragraph"),
  );

/**
 * editor keeps a state and an engine in step, as the page view's plugin
 * does: it tracks the changes of each transaction, and syncs now and then
 */
const editor = () => {
  const layout = testLayout();
  let state = EditorState.create({
    schema,
    doc: start(),
    plugins: [history()],
  });
  const engine = testEngine();
  engine.setSettings(layout, documentFields(state.doc));
  engine.sync(state.doc, noSizes);
  let tracked: TrackedChanges = { from: state.doc, ranges: [] };
  const apply = (tr: Transaction) => {
    tracked = trackChanges(tr, tracked, state, engine.syncedDoc);
    state = state.apply(tr);
  };
  return {
    engine,
    layout,
    get state() {
      return state;
    },
    apply,
    run: (command: Command) => command(state, apply),
    sync: () =>
      engine.sync(state.doc, noSizes, {
        changes: tracked.from
          ? { from: tracked.from, ranges: tracked.ranges }
          : null,
      }),
  };
};

// the pages of an engine, each read again
const pagesOf = (engine: PageEngine) => {
  const versions = engine.versions();
  return Array.from({ length: engine.pages() }, (_, page) =>
    engine.display(page, versions[page]),
  );
};

// the same as a fresh engine lays it out
const expectFresh = ({ state, engine, layout }: ReturnType<typeof editor>) => {
  const records = recordsOf(engine);
  const expected = flatten(state.doc, noSizes);
  expect(records.map((record) => [record.pos, record.key])).toEqual(
    expected.map((record) => [record.pos, record.key]),
  );
  records.forEach((record, index) =>
    expect(record.node).toBe(expected[index].node),
  );
  const fresh = testEngine();
  fresh.setSettings(layout, documentFields(state.doc));
  fresh.sync(state.doc, noSizes);
  expect(pagesOf(engine)).toEqual(pagesOf(fresh));
  fresh.free();
};

// a text position somewhere in the document
const somewhere = (state: EditorState, next: () => number) =>
  Selection.near(
    state.doc.resolve(Math.floor(next() * state.doc.content.size)),
  );

describe("incremental layout", () => {
  it("equals a fresh layout after random edits", { timeout: 60_000 }, () => {
    const next = random(20260930);
    const ed = editor();
    const select = () =>
      ed.apply(ed.state.tr.setSelection(somewhere(ed.state, next)));
    // two positions in order
    const span = () => {
      const a = somewhere(ed.state, next).from;
      const b = somewhere(ed.state, next).from;
      return [Math.min(a, b), Math.max(a, b)] as const;
    };
    const edits: (() => void)[] = [
      () => {
        select();
        ed.apply(ed.state.tr.insertText("typed "));
      },
      () => {
        select();
        ed.run(splitBlock);
      },
      () => {
        select();
        const { $head } = ed.state.selection;
        ed.apply(
          ed.state.tr.setSelection(
            TextSelection.create(ed.state.doc, $head.start()),
          ),
        );
        ed.run(joinBackward);
      },
      () => {
        select();
        ed.run(wrapIn(schema.nodes.blockquote));
      },
      () => {
        select();
        ed.run(lift);
      },
      () => {
        select();
        ed.run(wrapInList(schema.nodes.bullet_list));
      },
      () => {
        select();
        ed.run(sinkListItem(schema.nodes.list_item));
      },
      // a paste over several blocks
      () => {
        const [from, to] = span();
        const pasted = schema.nodes.doc.create(null, [p("pasted"), p("twice")]);
        ed.apply(
          ed.state.tr.replaceRange(from, to, new Slice(pasted.content, 1, 1)),
        );
      },
      // a delete across blocks
      () => {
        const [from, to] = span();
        ed.apply(ed.state.tr.delete(from, to));
      },
      // a heading changes the space above the heading after it
      () => {
        select();
        ed.run(setBlockType(schema.nodes.heading, { level: 2 }));
      },
      () => {
        select();
        ed.run(setBlockType(schema.nodes.paragraph));
      },
      () => ed.run(undo),
      () => ed.run(redo),
      // the frontmatter, which isn't flattened
      () =>
        ed.apply(
          ed.state.tr.setDocAttribute(
            "frontmatter",
            `title: ${Math.floor(next() * 100)}`,
          ),
        ),
    ];
    for (let step = 0; step < 200; step++) {
      edits[Math.floor(next() * edits.length)]();
      // now and then a few edits at once, as with appended transactions
      if (next() < 0.8) {
        ed.sync();
        expectFresh(ed);
      }
    }
    ed.sync();
    expectFresh(ed);
  });

  it("flattens only the block typed in", () => {
    const node = doc(
      ...Array.from({ length: 200 }, (_, index) => p(`Paragraph ${index}`)),
    );
    const state = EditorState.create({ schema, doc: node });
    const engine = testEngine();
    engine.setSettings(testLayout(), documentFields(node));
    engine.sync(node, noSizes);
    const tr = state.tr.insertText("x", 5);
    const tracked = trackChanges(
      tr,
      { from: null, ranges: [] },
      state,
      engine.syncedDoc,
    );
    const flattened = vi.spyOn(flattening, "flattenBlocks");

    expect(
      engine.sync(state.apply(tr).doc, noSizes, {
        changes: { from: tracked.from!, ranges: tracked.ranges },
      }),
    ).toBe(true);

    expect(flattened).toHaveBeenCalledTimes(1);
    const [, from, to] = flattened.mock.calls[0];
    expect([from, to]).toEqual([0, 1]);
  });

  it("flattens the heading after a block that became a heading", () => {
    let state = EditorState.create({
      schema,
      doc: doc(p("one"), p("two"), h(2, "three"), p("four")),
    });
    const engine = testEngine();
    engine.setSettings(testLayout(), documentFields(state.doc));
    engine.sync(state.doc, noSizes);
    const tr = state.tr.setBlockType(6, 6, schema.nodes.heading, { level: 2 });
    const tracked = trackChanges(
      tr,
      { from: null, ranges: [] },
      state,
      engine.syncedDoc,
    );
    state = state.apply(tr);
    engine.sync(state.doc, noSizes, {
      changes: { from: tracked.from!, ranges: tracked.ranges },
    });
    const keys = (records: FlatRecord[]) => records.map((record) => record.key);
    expect(keys(recordsOf(engine))).toEqual(keys(flatten(state.doc, noSizes)));
  });

  it("flattens it all when the changes count from another document", () => {
    const node = doc(p("one"), p("two"));
    const engine = testEngine();
    engine.setSettings(testLayout(), documentFields(node));
    engine.sync(node, noSizes);
    const flattened = vi.spyOn(flattening, "flattenBlocks");
    const other = doc(p("one"), p("two!"));
    engine.sync(other, noSizes, { changes: { from: other, ranges: [] } });
    expect(flattened).toHaveBeenCalledWith(other, 0, 2, noSizes, null);
  });
});
