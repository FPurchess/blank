import {
  type EditorState,
  Plugin,
  PluginKey,
  type TextSelection,
  type Transaction,
} from "prosemirror-state";
import type { Node } from "prosemirror-model";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";

import { config } from "../../config";
import { language, spellchecker } from "../../state";
import { words, type Word } from "../../spellcheck/tokenize";
import type { Spellchecker } from "../../spellcheck/types";

// set on transactions that replace the whole document, e.g. for a new file,
// which forgets the words ignored in the previous one. An opened file gets a
// fresh editor state, which forgets them anyway.
export const REPLACE_DOCUMENT = "replaceDocument";

// how long typing pauses before the changed text is checked
const DELAY = 150;

// textblocks tokenized before yielding to the browser
const CHUNK = 200;

type Range = [number, number];

interface SpellState {
  decorations: DecorationSet;
  // lowercased words ignored in this document
  ignored: Set<string>;
  // the word being typed, which isn't flagged until it is complete
  pending: Range | null;
  // ranges whose words need to be checked, or "all"
  dirty: Range[] | "all";
}

type Meta =
  // the spell checker changed, so everything is checked again
  | { type: "reset" }
  | { type: "ignore"; word: string }
  // the misspellings found in `ranges` when `dirty` needed checking
  | {
      type: "results";
      ranges: Range[] | "all";
      decorations: Decoration[];
      dirty: Range[] | "all";
    };

export const spellcheckKey = new PluginKey<SpellState>("spellcheck");

export interface Misspelling {
  from: number;
  to: number;
  word: string;
}

const tagOf = () => spellchecker.value?.tag ?? language.value;

/**
 * textblocks calls `fn` for every textblock overlapping `ranges`
 */
const textblocks = (
  doc: Node,
  ranges: Range[] | "all",
  fn: (block: Node, pos: number) => void,
) => {
  // dirty ranges overlap, e.g. for every typed char in a word
  const seen = new Set<number>();
  const visit = (from: number, to: number) =>
    doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isTextblock) return true;
      if (!seen.has(pos)) fn(node, pos);
      seen.add(pos);
      return false;
    });
  if (ranges === "all") visit(0, doc.content.size);
  else
    ranges.forEach(([from, to]) => visit(from, Math.min(to, doc.content.size)));
};

/**
 * changedRanges returns the ranges `tr` changed, in positions of its doc
 */
const changedRanges = (tr: Transaction): Range[] => {
  const ranges: Range[] = [];
  tr.mapping.maps.forEach((map, index) => {
    const rest = tr.mapping.slice(index + 1);
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      ranges.push([rest.map(newStart, -1), rest.map(newEnd, 1)]);
    });
  });
  return ranges;
};

/**
 * wordAtCursor returns the word the cursor is in or at the end of
 */
const wordAtCursor = (state: EditorState): Range | null => {
  const { $cursor } = state.selection as TextSelection;
  if (!$cursor || !$cursor.parent.isTextblock) return null;
  const found = words(
    $cursor.parent,
    $cursor.start(),
    tagOf(),
    config.value.spellcheck,
  ).find((word) => word.from <= $cursor.pos && $cursor.pos <= word.to);
  return found ? [found.from, found.to] : null;
};

const overlaps = ([from, to]: Range, ranges: Range[]) =>
  ranges.some(([a, b]) => from <= b && to >= a);

const apply = (
  tr: Transaction,
  value: SpellState,
  _old: EditorState,
  state: EditorState,
): SpellState => {
  let { decorations, ignored, pending, dirty } = value;
  const meta = tr.getMeta(spellcheckKey) as Meta | undefined;

  if (tr.getMeta(REPLACE_DOCUMENT)) {
    return {
      decorations: DecorationSet.empty,
      ignored: new Set(),
      pending: null,
      dirty: "all",
    };
  }

  if (tr.docChanged) {
    decorations = decorations.map(tr.mapping, tr.doc);
    const changed = changedRanges(tr);
    if (dirty !== "all") {
      dirty = [
        ...dirty.map(([from, to]): Range => [
          tr.mapping.map(from, -1),
          tr.mapping.map(to, 1),
        ]),
        ...changed,
      ];
    }
    const typed = wordAtCursor(state);
    pending = typed && overlaps(typed, changed) ? typed : null;
  } else if (pending && tr.selectionSet) {
    const word = wordAtCursor(state);
    const moved = !word || word[0] !== pending[0] || word[1] !== pending[1];
    if (moved) {
      // the word is complete, so check it
      if (dirty !== "all") dirty = [...dirty, pending];
      pending = null;
    }
  }

  // the word being typed isn't flagged
  if (pending) {
    decorations = decorations.remove(decorations.find(pending[0], pending[1]));
  }

  if (meta?.type === "reset") {
    decorations = DecorationSet.empty;
    dirty = "all";
  } else if (meta?.type === "ignore") {
    const word = meta.word.toLowerCase();
    ignored = new Set([...ignored, word]);
    decorations = decorations.remove(
      decorations.find(
        undefined,
        undefined,
        (spec) => (spec.word as string).toLowerCase() === word,
      ),
    );
  } else if (meta?.type === "results") {
    const stale =
      meta.ranges === "all"
        ? decorations.find()
        : meta.ranges.flatMap(([from, to]) => decorations.find(from, to));
    decorations = decorations.remove(stale).add(
      tr.doc,
      meta.decorations.filter(
        (d) => !pending || d.to < pending[0] || d.from > pending[1],
      ),
    );
    // unless more needs checking since the check started
    if (dirty === meta.dirty) dirty = [];
  }

  return { decorations, ignored, pending, dirty };
};

/**
 * misspelled returns the parts of `word` spelled wrong: none if the whole word
 * or all of its parts are spelled correctly. Words not checked yet count as
 * correct.
 */
const misspelled = (word: Word, checker: Spellchecker): Word[] => {
  const wrong = (w: Word) => checker.isCorrect(w.text) === false;
  if (!wrong(word)) return [];
  if (!word.parts?.length) return [word];
  const parts = word.parts.filter(wrong);
  return parts;
};

const decoration = (word: Word) =>
  Decoration.inline(
    word.from,
    word.to,
    { class: "spelling-error", "aria-invalid": "spelling" },
    { word: word.text },
  );

const yieldToBrowser = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * check checks the dirty ranges of `view` with `checker` and dispatches the
 * misspellings found, unless the document changed meanwhile
 */
const check = async (view: EditorView, checker: Spellchecker) => {
  const state = view.state;
  const { dirty, ignored } = spellcheckKey.getState(state)!;
  if (dirty !== "all" && !dirty.length) return;

  const found: Word[] = [];
  const blockRanges: Range[] = [];
  let count = 0;
  const blocks: [Node, number][] = [];
  textblocks(state.doc, dirty, (block, pos) => blocks.push([block, pos]));
  for (const [block, pos] of blocks) {
    found.push(...words(block, pos + 1, checker.tag, config.value.spellcheck));
    blockRanges.push([pos, pos + block.nodeSize]);
    if (++count % CHUNK === 0) await yieldToBrowser();
  }

  const unknown = found
    .flatMap((word) => [word, ...(word.parts ?? [])])
    .map((word) => word.text)
    .filter((text) => checker.isCorrect(text) === undefined);
  if (unknown.length) await checker.check([...new Set(unknown)]);

  // a newer check takes over if the text or the spell checker changed
  if (view.state.doc !== state.doc || spellchecker.value !== checker) return;
  const decorations = found
    .filter((word) => !ignored.has(word.text.toLowerCase()))
    .flatMap((word) => misspelled(word, checker))
    .map(decoration);
  view.dispatch(
    view.state.tr
      .setMeta(spellcheckKey, {
        type: "results",
        ranges: dirty === "all" ? "all" : blockRanges,
        decorations,
        dirty,
      } satisfies Meta)
      .setMeta("addToHistory", false),
  );
};

/**
 * spellcheck underlines misspelled words while `spellchecker` holds a spell
 * checker
 */
export const spellcheck = () =>
  new Plugin<SpellState>({
    key: spellcheckKey,
    state: {
      init: () => ({
        decorations: DecorationSet.empty,
        ignored: new Set(),
        pending: null,
        dirty: "all",
      }),
      apply,
    },
    props: {
      decorations: (state) => spellcheckKey.getState(state)?.decorations,
      // the webview's own spell checker would underline words a second time
      attributes: { spellcheck: "false" },
    },
    view(view) {
      let timer: number | undefined;
      let running = false;
      let again = false;

      const run = async () => {
        const checker = spellchecker.value;
        if (!checker) return;
        if (running) {
          again = true;
          return;
        }
        running = true;
        try {
          await check(view, checker);
        } catch (error) {
          console.warn("spell check failed", error);
        } finally {
          running = false;
        }
        if (again) {
          again = false;
          schedule();
        }
      };

      const schedule = (delay = DELAY) => {
        window.clearTimeout(timer);
        timer = window.setTimeout(run, delay);
      };

      const unsubscribe = spellchecker.subscribe(() => {
        view.dispatch(
          view.state.tr
            .setMeta(spellcheckKey, { type: "reset" } satisfies Meta)
            .setMeta("addToHistory", false),
        );
        schedule(0);
      });

      // a spell checker that is already there checks the text right away
      if (spellchecker.value) schedule(0);

      return {
        update(view, previous) {
          const state = spellcheckKey.getState(view.state)!;
          const changed =
            state !== spellcheckKey.getState(previous) &&
            (state.dirty === "all" || state.dirty.length > 0);
          if (changed) schedule();
        },
        destroy() {
          unsubscribe();
          window.clearTimeout(timer);
        },
      };
    },
  });

/**
 * misspellingAt returns the misspelled word at `pos`
 */
export const misspellingAt = (
  state: EditorState,
  pos: number,
): Misspelling | undefined => {
  const found = spellcheckKey
    .getState(state)
    ?.decorations.find(pos, pos)
    .find((d) => d.from <= pos && pos <= d.to);
  return found && { from: found.from, to: found.to, word: found.spec.word };
};

/**
 * nextMisspelling returns the next misspelled word after `pos`, or with
 * `direction` -1 the previous one before it, wrapping around the document
 */
export const nextMisspelling = (
  state: EditorState,
  pos: number,
  direction: 1 | -1,
): Misspelling | undefined => {
  const all = spellcheckKey.getState(state)?.decorations.find() ?? [];
  if (!all.length) return;
  all.sort((a, b) => a.from - b.from);
  const found =
    direction === 1
      ? (all.find((d) => d.from > pos) ?? all[0])
      : ([...all].reverse().find((d) => d.to < pos) ?? all[all.length - 1]);
  return { from: found.from, to: found.to, word: found.spec.word };
};

/**
 * ignoreAll returns a transaction that stops flagging `word` in this document
 */
export const ignoreAll = (state: EditorState, word: string) =>
  state.tr
    .setMeta(spellcheckKey, { type: "ignore", word } satisfies Meta)
    .setMeta("addToHistory", false);

/**
 * occurrences returns the ranges of `word` in the document, regardless of
 * case, outside code
 */
export const occurrences = (state: EditorState, word: string): Word[] => {
  const lower = word.toLowerCase();
  const found: Word[] = [];
  textblocks(state.doc, "all", (block, pos) => {
    // the config that skips words mustn't hide occurrences
    const all = { ignoreUppercase: false, ignoreWordsWithNumbers: false };
    found.push(
      ...words(block, pos + 1, tagOf(), all).filter(
        (w) => w.text.toLowerCase() === lower,
      ),
    );
  });
  return found;
};
