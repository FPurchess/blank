import type { Node } from "prosemirror-model";
import { shallowRef } from "vue";

import { forgetVector, putVector, VECTOR } from "../engine/vectors";
import { fnv1a } from "./hash";
import {
  type Rendered,
  sourceKind,
  type SourceKind,
  type VectorData,
} from "./registry";

// What sources make, rendered once per source and kept: a diagram typed
// back to what it was shows at once. Rendering that takes time (Mermaid)
// runs one at a time, and while a source is being typed, only once the
// typing pauses. A drawing goes into the vectors (src/engine/vectors.ts),
// where the page view and the exports find it by its key.

// how many sources are kept rendered: the oldest goes first, but never one
// of the document shown or of the last export, however many they hold
const KEPT = 200;

// what a kind waits after typing before it renders, while the block is open
const DEBOUNCE = 250;

const results = new Map<string, Rendered<unknown>>();
// the sources that couldn't be rendered because what renders them can't run
// here, shown as such until a render is asked again
const unavailable = new Map<string, Rendered<unknown>>();
// when each was found so, which isn't tried again sooner than RETRY after
const unavailableAt = new Map<string, number>();
const RETRY = 10_000;
const pending = new Map<string, Promise<void>>();
// the last of the renders that take time, which run one after the other
let tail: Promise<void> | null = null;
// a kind's next render while its source is typed
const timers = new Map<string, ReturnType<typeof setTimeout>>();

// the keys of the sources of the document shown, and of the last export
let shown = new Set<string>();
let exported = new Set<string>();

// bumped whenever a source is rendered, so what shows them follows
export const renderStates = shallowRef(0);

/**
 * keyOf returns the key a kind's source is rendered under, also the src of
 * its drawing
 */
export const keyOf = (kind: string, source: string) =>
  `${VECTOR}${kind}:${fnv1a(source)}-${source.length}`;

/**
 * sourceKeyOf returns the key of the source a node holds
 */
export const sourceKeyOf = (node: Node) =>
  keyOf(node.type.name, node.textContent);

/**
 * renderedOf returns what the source of `node` made, if it was rendered
 */
export const renderedOf = (node: Node): Rendered | undefined => {
  const key = sourceKeyOf(node);
  return (results.get(key) ?? unavailable.get(key)) as Rendered | undefined;
};

const isVector = (data: unknown): data is VectorData =>
  !!data &&
  typeof data === "object" &&
  typeof (data as VectorData).svg === "string";

const keep = (key: string, rendered: Rendered<unknown>) => {
  // what can't run now, e.g. Mermaid's chunk that didn't load, is tried
  // again next time, not remembered
  if (rendered.ok === "unavailable") {
    unavailable.set(key, rendered);
    unavailableAt.set(key, Date.now());
    renderStates.value++;
    return;
  }
  unavailable.delete(key);
  unavailableAt.delete(key);
  results.delete(key);
  results.set(key, rendered);
  if (rendered.ok === true && isVector(rendered.data)) {
    putVector(key, rendered.data);
  }
  for (const old of results.keys()) {
    if (results.size <= KEPT) break;
    if (shown.has(old) || exported.has(old)) continue;
    results.delete(old);
    forgetVector(old);
  }
  renderStates.value++;
};

const run = (
  kind: SourceKind<unknown>,
  key: string,
  source: string,
): Promise<void> => {
  const known = pending.get(key);
  if (known) return known;
  const failed = (error: unknown): Rendered<unknown> => ({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  });
  const done = (rendered: Rendered<unknown>) => {
    pending.delete(key);
    keep(key, rendered);
  };
  const start = () => {
    try {
      return kind.render(source);
    } catch (error) {
      return failed(error);
    }
  };
  // a render that takes time goes after the one running, so Mermaid draws
  // one at a time
  const track = (rendered: Promise<Rendered<unknown>>) => {
    const mine: Promise<void> = rendered
      .then(done, (error: unknown) => done(failed(error)))
      .finally(() => {
        if (tail === mine) tail = null;
      });
    tail = mine;
    pending.set(key, mine);
    return mine;
  };
  if (tail) return track(tail.then(start));
  const rendered = start();
  if (rendered instanceof Promise) return track(rendered);
  done(rendered);
  return Promise.resolve();
};

/**
 * requestRender renders the source of `node` if it isn't yet: at once, or,
 * while it's being typed (`typing`), once the typing pauses
 */
export const requestRender = (node: Node, typing = false) => {
  const kind = sourceKind(node.type.name);
  if (!kind) return;
  const source = node.textContent;
  const key = keyOf(node.type.name, source);
  const known = results.get(key);
  if (known) {
    // seen again: it's the newest, and the last to be forgotten
    results.delete(key);
    results.set(key, known);
    return;
  }
  if (pending.has(key)) return;
  if (Date.now() - (unavailableAt.get(key) ?? -Infinity) < RETRY) return;
  const delay = typing ? (kind.debounce ?? DEBOUNCE) : 0;
  clearTimeout(timers.get(kind.node));
  if (delay === 0) {
    timers.delete(kind.node);
    void run(kind, key, source);
    return;
  }
  timers.set(
    kind.node,
    setTimeout(() => {
      timers.delete(kind.node);
      // an export may have rendered it meanwhile
      if (!results.has(key)) void run(kind, key, source);
    }, delay),
  );
};

/**
 * sourcesOf returns the source blocks of `doc` by their keys
 */
const sourcesOf = (doc: Node) => {
  const found = new Map<string, Node>();
  doc.descendants((node) => {
    if (!sourceKind(node.type.name)) return !node.isTextblock;
    found.set(sourceKeyOf(node), node);
    return false;
  });
  return found;
};

/**
 * renderShown renders the sources of the document shown that aren't yet,
 * the one being typed (`typing`) once the typing pauses, and keeps them all
 */
export const renderShown = (doc: Node, typing: Node | null) => {
  const sources = sourcesOf(doc);
  shown = new Set(sources.keys());
  for (const node of sources.values()) {
    if (node !== typing) requestRender(node);
  }
  if (typing) requestRender(typing, true);
};

/**
 * renderAll renders every source of `doc` that isn't yet, e.g. before an
 * export, waits for them, and keeps them until the next export
 */
export const renderAll = async (doc: Node) => {
  const sources = sourcesOf(doc);
  exported = new Set(sources.keys());
  const waiting: Promise<void>[] = [];
  for (const [key, node] of sources) {
    const kind = sourceKind(node.type.name)!;
    if (!results.has(key)) waiting.push(run(kind, key, node.textContent));
  }
  await Promise.all(waiting);
};

/**
 * forgetRendered forgets every rendered source, e.g. between tests
 */
export const forgetRendered = () => {
  for (const key of results.keys()) forgetVector(key);
  results.clear();
  unavailable.clear();
  unavailableAt.clear();
  pending.clear();
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  tail = null;
  shown = new Set();
  exported = new Set();
};

/**
 * sourceWarning describes the sources of `doc` that couldn't be drawn, which
 * an export shows as their source instead: none, or one sentence
 */
export const sourceWarning = (doc: Node, where: string): string[] => {
  let count = 0;
  doc.descendants((node) => {
    const kind = sourceKind(node.type.name);
    if (!kind) return true;
    const rendered = results.get(sourceKeyOf(node));
    if (rendered?.ok !== true) count++;
    return false;
  });
  if (count === 0) return [];
  const what = count === 1 ? "1 diagram" : `${count} diagrams`;
  return [
    `${what} couldn't be drawn and ${count === 1 ? "is" : "are"} written as ${count === 1 ? "its" : "their"} source in ${where}`,
  ];
};
