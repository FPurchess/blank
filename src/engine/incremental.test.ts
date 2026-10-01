import {
  joinBackward,
  lift,
  setBlockType,
  splitBlock,
  toggleMark,
  wrapIn,
} from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { Slice } from "prosemirror-model";
import { canSplit } from "prosemirror-transform";
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
      // two places apart in one transaction, e.g. a replace of all
      () => {
        const [from, to] = span();
        const tr = ed.state.tr.insertText("b", to);
        tr.insertText("a", from);
        ed.apply(tr);
      },
      // a new block at one place and text at another, in one transaction
      () => {
        const [from, to] = span();
        const tr = ed.state.tr.insertText("b", to);
        if (canSplit(tr.doc, from)) tr.split(from);
        ed.apply(tr);
      },
      // bold over a range, which changes marks only
      () => {
        const [from, to] = span();
        ed.apply(
          ed.state.tr.setSelection(
            TextSelection.create(ed.state.doc, from, to),
          ),
        );
        ed.run(toggleMark(schema.marks.strong));
      },
      // an attribute of a block: a table's caption, a heading's level
      () => {
        const blocks: number[] = [];
        ed.state.doc.forEach((node, offset) => {
          if (node.type.name === "table" || node.type.name === "heading")
            blocks.push(offset);
        });
        if (!blocks.length) return;
        const pos = blocks[Math.floor(next() * blocks.length)];
        const node = ed.state.doc.nodeAt(pos)!;
        ed.apply(
          node.type.name === "table"
            ? ed.state.tr.setNodeAttribute(
                pos,
                "caption",
                `Caption ${Math.floor(next() * 9)}`,
              )
            : ed.state.tr.setNodeAttribute(
                pos,
                "level",
                1 + Math.floor(next() * 3),
              ),
        );
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

  it("hands changes apart to the engine in one call", () => {
    const node = doc(
      ...Array.from({ length: 100 }, (_, index) => p(`Paragraph ${index}`)),
    );
    const state = EditorState.create({ schema, doc: node });
    const engine = testEngine();
    engine.setSettings(testLayout(), documentFields(node));
    engine.sync(node, noSizes);
    const tr = state.tr.insertText("far ", node.content.size - 3);
    tr.insertText("near ", 3);
    const tracked = trackChanges(
      tr,
      { from: null, ranges: [] },
      state,
      engine.syncedDoc,
    );
    const next = state.apply(tr).doc;
    const many = vi.spyOn(engine.raw, "updateMany");
    const flattened = vi.spyOn(flattening, "flattenBlocks");

    engine.sync(next, noSizes, {
      changes: { from: tracked.from!, ranges: tracked.ranges },
    });

    expect(many).toHaveBeenCalledTimes(1);
    expect(JSON.parse(many.mock.calls[0][0])).toHaveLength(2);
    expect(flattened).toHaveBeenCalledTimes(2);
    const fresh = testEngine();
    fresh.setSettings(testLayout(), documentFields(next));
    fresh.sync(next, noSizes);
    expect(pagesOf(engine)).toEqual(pagesOf(fresh));
    expect(recordsOf(engine).map((record) => record.pos)).toEqual(
      flatten(next, noSizes).map((record) => record.pos),
    );
  });

  describe("the pages the first edits change", () => {
    const LONG =
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";
    // the pages whose body versions differ
    const changed = (before: Uint32Array, after: Uint32Array) =>
      [...after].flatMap((version, page) =>
        version === before[page] ? [] : [page],
      );

    // a heading and 300 paragraphs, laid out as the page view does
    const opened = (progressive: boolean) => {
      const node = doc(
        h(1, "Title"),
        ...Array.from({ length: 300 }, () => p(LONG)),
      );
      const engine = testEngine();
      engine.setSettings(testLayout(), documentFields(node));
      engine.sync(node, noSizes, { progressive });
      let state = EditorState.create({ schema, doc: node });
      // types in the first paragraph, whose text starts at 8
      const type = (text: string) => {
        const tr = state.tr.insertText(text, 12);
        const tracked = trackChanges(
          tr,
          { from: null, ranges: [] },
          state,
          engine.syncedDoc,
        );
        state = state.apply(tr);
        const before = engine.bodyVersions();
        engine.sync(state.doc, noSizes, {
          changes: { from: tracked.from!, ranges: tracked.ranges },
        });
        return changed(before, engine.bodyVersions());
      };
      return { engine, type };
    };

    it("are only the page typed on, from the first edit on", () => {
      const { type } = opened(false);
      expect(type("x")).toEqual([0]);
      expect(type("y")).toEqual([0]);
    });

    it("are also the pages laid out for the first time, while the rest of a long document is still to lay out", () => {
      vi.useFakeTimers();
      const { engine, type } = opened(true);
      const first = engine.pages();
      // the edit lays out the rest first: the last page laid out goes on,
      // and the pages after it are new; those before it stay as they were
      const pages = type("x");
      expect(pages[0]).toBe(0);
      expect(pages).not.toContain(1);
      expect(pages.slice(1)).toEqual(
        Array.from(
          { length: engine.pages() - first + 1 },
          (_, index) => first - 1 + index,
        ),
      );
      expect(type("y")).toEqual([0]);
      vi.useRealTimers();
    });
  });

  it("lays out marks and attributes, whose steps move nothing", () => {
    const ed = editor();
    ed.apply(ed.state.tr.addMark(10, 15, schema.marks.strong.create()));
    ed.sync();
    expectFresh(ed);
    let pos = 0;
    ed.state.doc.forEach((node, offset) => {
      if (node.type.name === "table") pos = offset;
    });
    ed.apply(ed.state.tr.setNodeAttribute(pos, "caption", "Totals"));
    ed.sync();
    expectFresh(ed);
    ed.run(undo);
    ed.sync();
    expectFresh(ed);
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
