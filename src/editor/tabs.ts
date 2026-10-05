import { path as tauriPath } from "@tauri-apps/api";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { sendNotification } from "@tauri-apps/plugin-notification";
import type { Node } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { onScopeDispose, type Ref, watch } from "vue";

import { forgetImages } from "../engine/images";
import { timed } from "../engine/perf";
import { errorMessage } from "../errors";
import { bootScope } from "../scope";
import type { Spellchecker } from "../spellcheck/types";
import {
  activeTabId,
  announce,
  currentViewAnchor,
  freeUntitledNumber,
  importedFrom,
  pageDropCaret,
  pageDropGap,
  pageHoverBlock,
  pageScrollRequest,
  path,
  spellchecker,
  type Tab,
  tabAnnouncement,
  tabLabel,
  tabs,
  tabSwitch,
  unsavedDialog,
  updateTab,
} from "../state";
import {
  backupTabDocument,
  loadSession,
  loadTabDocument,
  storeDocument,
} from "../storage";
import { _saveFile, type Options as SaveOptions } from "./commands/saveFile";
import {
  documentState,
  emptyDocument,
  type LoadedDocument,
  readDocument,
  showDocument,
  welcomeDocument,
} from "./document";
import { resetSpellcheck } from "./plugins/spellcheck";
import { closeRequests } from "./requests";

// The open documents, one EditorState per tab, shown in the one EditorView.
// The tab row and the commands go through the functions here; the tabs
// themselves (their names, order and dots) are in src/state/tabs.ts. See
// .claude/rules/tabs.md.

// a tab's document once it was loaded: restored tabs load when they are
// first shown
interface TabDocument {
  // the tab's state when it was left; the shown tab's is the view's
  state: EditorState;
  // the document as last opened or saved, to tell whether it changed since;
  // null while unknown, which counts as changed
  baseline: Node | null;
  // counts the baselines set, so a read of the file that started before a
  // save can't replace what the save set
  baselines: number;
  // the spell checker its underlines are from
  checker: Spellchecker | null;
}

const documents = new Map<string, TabDocument>();
// the tab last asked for, so a quick run of switches shows only the last
let wanted: string | null = null;
// the view the tabs are shown in, and a state with the editor's plugins,
// which every tab's state gets
let view: EditorView | null = null;
let base: EditorState | null = null;
// the files of the tabs closed this session, the last one last
const closedPaths: string[] = [];
const MAX_CLOSED = 20;
// stops listening for the files opened from outside
let unlisten: (() => void) | null = null;

// Changes to the tabs run one after another, in the order they were asked
// for, e.g. two files opened from the terminal at once. They start once the
// view is there (bootTabs). Inside a change, call the unqueued helpers below,
// or it waits for itself.
let started: () => void = () => {};
let queue: Promise<unknown> = new Promise<void>((resolve) => {
  started = resolve;
});
const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
  const run = queue.then(task);
  queue = run.catch((error) => console.error(error));
  return run;
};

const tabById = (id: string) => tabs.value.find((tab) => tab.id === id);
const stateOf = (doc: Node) => documentState(base!, doc);

/**
 * docOf returns the document of the tab `id` as it is now
 */
const docOf = (id: string): Node | undefined =>
  id === activeTabId.value && view
    ? view.state.doc
    : documents.get(id)?.state.doc;

/**
 * refresh sets whether the tab `id` has changes that aren't saved: its
 * document differs from the one last opened or saved, so undoing back to it
 * clears the dot
 */
const refresh = (id: string) => {
  const tab = tabById(id);
  const kept = documents.get(id);
  const doc = docOf(id);
  if (!tab || !kept || !doc) return;
  const unsaved = kept.baseline === null || !doc.eq(kept.baseline);
  if (unsaved !== tab.unsaved) updateTab(id, { unsaved });
};

/**
 * setBaseline makes `doc` what the tab `id` was last opened or saved as
 */
const setBaseline = (id: string, kept: TabDocument, doc: Node | null) => {
  kept.baseline = doc;
  kept.baselines++;
  refresh(id);
};

/**
 * kept returns what a tab keeps of `state`: the document it starts with
 * counts as saved unless `saved` is false
 */
const kept = (state: EditorState, saved = true): TabDocument => ({
  state,
  baseline: saved ? state.doc : null,
  baselines: 0,
  checker: spellchecker.value,
});

/**
 * newTab returns a new tab for the document `loaded`, with what it keeps
 */
const newTab = (
  loaded: LoadedDocument,
  extra: Partial<Tab> = {},
): [Tab, TabDocument] => {
  // an import isn't saved until it is saved as markdown
  const saved = loaded.importedFrom === null;
  const tab: Tab = {
    id: crypto.randomUUID(),
    path: loaded.path,
    importedFrom: loaded.importedFrom,
    untitledNumber: null,
    unsaved: !saved,
    viewAnchor: null,
    ...extra,
  };
  return [tab, kept(stateOf(loaded.doc), saved)];
};

const blank = (doc: Node): LoadedDocument => ({
  doc,
  path: null,
  importedFrom: null,
});

/**
 * untitledTab returns a new, empty tab named after the lowest free number
 */
const untitledTab = (list: readonly Tab[]) =>
  newTab(blank(emptyDocument()), {
    untitledNumber: freeUntitledNumber(list),
  });

/**
 * welcomeTab returns the tab of the document Blank starts with the first time
 */
const welcomeTab = () => newTab(blank(welcomeDocument()), { welcome: true });

/**
 * adopt keeps the documents of new tabs, and stores them with the next write
 */
const adopt = (added: readonly [Tab, TabDocument][]) => {
  for (const [tab, document] of added) {
    documents.set(tab.id, document);
    storeDocument(tab.id, document.state.doc);
  }
};

/**
 * readBaseline reads the file of the tab `id` in the background, to tell
 * whether its restored changes still differ from it. A file that has gone
 * keeps the tab's text, unsaved, and says so.
 */
const readBaseline = (id: string, file: string) => {
  const known = documents.get(id);
  const asked = known?.baselines;
  void readDocument(file, true).then((loaded) => {
    const tab = tabById(id);
    if (!tab || !known || documents.get(id) !== known) return;
    // saved meanwhile, which knows better
    if (known.baselines !== asked) return;
    if (loaded && loaded.path === tab.path) {
      setBaseline(id, known, stateOf(loaded.doc).doc);
    } else if (!loaded) {
      sendNotification(
        `${file} can't be found, so “${tabLabel(tab)}” keeps the text Blank had kept. Save it to keep it.`,
      );
    }
  });
};

/**
 * storedDocument returns the document stored for `tab`. One that can't be
 * read is backed up and left out, so it can't be lost.
 */
const storedDocument = async (tab: Tab): Promise<Node | undefined> => {
  try {
    return await loadTabDocument(tab.id);
  } catch (error) {
    console.error("failed to restore a stored document", error);
    const backedUp = await backupTabDocument(tab.id);
    const copy = backedUp ? ` A copy was kept as "tab-backup:${tab.id}".` : "";
    sendNotification(
      `“${tabLabel(tab)}” couldn't be restored.${copy} ${errorMessage(error)}`,
    );
  }
};

/**
 * loadTab builds the document of a restored tab: a file without changes
 * from the file, which is the truth, and everything else from what was
 * stored
 */
const loadTab = async (tab: Tab): Promise<TabDocument> => {
  if (tab.path !== null && !tab.unsaved) {
    const loaded = await readDocument(tab.path, true);
    if (loaded) return kept(stateOf(loaded.doc));
  }
  const stored = await storedDocument(tab);
  if (tab.path !== null) {
    // changes kept from the last time, or a file that has gone: the file
    // tells in the background whether they differ from it
    if (!tab.unsaved) updateTab(tab.id, { unsaved: true });
    return kept(stateOf(stored ?? emptyDocument()), false);
  }
  if (tab.importedFrom !== null) {
    if (stored) return kept(stateOf(stored), false);
    const loaded = await readDocument(tab.importedFrom, true);
    return kept(stateOf(loaded?.doc ?? emptyDocument()), false);
  }
  const document = kept(
    stateOf(tab.welcome ? welcomeDocument() : emptyDocument()),
  );
  if (stored) document.state = stateOf(stored);
  return document;
};

/**
 * ensureLoaded returns what `tab` keeps, loading it if it wasn't yet
 */
const ensureLoaded = async (tab: Tab): Promise<TabDocument> => {
  let document = documents.get(tab.id);
  if (!document) {
    document = await loadTab(tab);
    documents.set(tab.id, document);
    if (tab.path !== null && document.baseline === null)
      readBaseline(tab.id, tab.path);
  }
  return document;
};

/**
 * leaveComposition ends what the input method is composing, so its text
 * lands in the tab it was typed in
 */
const leaveComposition = async () => {
  const dom = view?.dom;
  if (!view?.composing || !dom) return;
  const ended = new Promise((resolve) =>
    dom.addEventListener("compositionend", resolve, { once: true }),
  );
  dom.blur();
  // a webview that ends it without the event goes on after a moment
  await Promise.race([ended, new Promise((r) => setTimeout(r, 100))]);
};

/**
 * showTab shows the tab `id` in the view. The shown document's globals
 * change before the view gets the new state: the page view lays it out right
 * then, with its path, and storage files it under the new tab.
 */
const showTab = (id: string, next: TabDocument, keepLeaving = true) => {
  const v = view!;
  // closing them may still change the leaving tab, e.g. the header strip
  // keeps what was typed into it
  closeRequests();
  const leaving = activeTabId.value;
  const left = leaving === null ? undefined : documents.get(leaving);
  if (keepLeaving && leaving !== null && left) {
    left.state = v.state;
    left.checker = spellchecker.value;
    updateTab(leaving, { viewAnchor: currentViewAnchor() });
    refresh(leaving);
  }
  // what pointed into the document that leaves
  pageScrollRequest.value = null;
  pageDropCaret.value = null;
  pageDropGap.value = null;
  pageHoverBlock.value = null;

  const tab = tabById(id)!;
  wanted = id;
  activeTabId.value = id;
  tabSwitch.value = { id, anchor: tab.viewAnchor };
  showDocument(next.state, tab);
  timed("switch", () => v.updateState(next.state));
  if (next.checker !== spellchecker.value) {
    next.checker = spellchecker.value;
    v.dispatch(resetSpellcheck(v.state.tr));
  }
  announce(tabAnnouncement(tab, tabs.value.indexOf(tab), tabs.value.length), {
    quiet: true,
  });
};

/**
 * present shows the tab `id` with the row `change` makes of the tabs as
 * they are then, once the input method is done: the row and the shown tab
 * change together, with nothing awaited in between
 * @param keepLeaving whether the tab shown now stays, to keep its state
 */
const present = async (
  id: string,
  next: TabDocument,
  change: (list: readonly Tab[]) => readonly Tab[] = (list) => list,
  keepLeaving = true,
) => {
  await leaveComposition();
  tabs.value = change(tabs.value);
  if (tabById(id)) showTab(id, next, keepLeaving);
};

/**
 * switchTo shows the tab `id`, loading it first if needed
 */
const switchTo = async (id: string) => {
  const tab = tabById(id);
  if (!tab || id === activeTabId.value) return;
  await present(id, await ensureLoaded(tab));
};

/**
 * activateTab shows the tab `id`
 */
export const activateTab = (id: string) => {
  wanted = id;
  return enqueue(async () => {
    if (wanted === id) await switchTo(id);
  });
};

/**
 * cycleTab shows the tab `by` places to the right, or the left for a
 * negative `by`, wrapping around at the ends
 */
export const cycleTab = (by: number) => {
  const list = tabs.value;
  const current = tabById(wanted ?? "") ? wanted : activeTabId.value;
  const from = list.findIndex((tab) => tab.id === current);
  const next = list[(from + by + list.length) % list.length];
  return next ? activateTab(next.id) : Promise.resolve();
};

/**
 * openNewTab opens an empty "Untitled" tab at the end of the row
 */
export const openNewTab = () =>
  enqueue(async () => {
    const added = untitledTab(tabs.value);
    adopt([added]);
    await present(added[0].id, added[1], (list) => [...list, added[0]]);
  });

/**
 * canonicalPath returns the file's own path: absolute, with symbolic links
 * followed, so two ways to name one file find its tab
 */
const canonicalPath = async (file: string): Promise<string> => {
  try {
    const canonical = await invoke<string | null>("canonical_path", {
      path: file,
    });
    if (canonical) return canonical;
  } catch {
    // e.g. in a browser, without Tauri
  }
  return tauriPath.resolve(file).catch(() => file);
};

/**
 * openTabOf returns the tab of `file` that is already open
 */
const openTabOf = (list: readonly Tab[], file: string) =>
  list.find(
    (tab) =>
      tab.path === file || (tab.path === null && tab.importedFrom === file),
  );

/**
 * readTabs reads the files at `files` into new tabs, leaving out the ones
 * open in `list` already
 * @returns the new tabs, and the tab of the last file that is open
 */
const readTabs = async (list: readonly Tab[], files: string[]) => {
  const added: [Tab, TabDocument][] = [];
  let last: string | null = null;
  for (const file of files) {
    const canonical = await canonicalPath(file);
    const open = openTabOf([...list, ...added.map(([tab]) => tab)], canonical);
    if (open) {
      last = open.id;
      continue;
    }
    const loaded = await readDocument(canonical);
    if (!loaded) continue;
    const opened = newTab(loaded);
    added.push(opened);
    last = opened[0].id;
  }
  return { added, last };
};

/**
 * untouched is whether `tab` is a new "Untitled" nothing was typed into,
 * which an opened file takes the place of
 */
const untouched = (tab: Tab | undefined) =>
  tab !== undefined && tab.untitledNumber !== null && !tab.unsaved;

/**
 * insertTabs returns `list` with the tabs `added` right of the active tab,
 * which they replace if it's untouched
 */
const insertTabs = (list: readonly Tab[], added: readonly Tab[]) => {
  const active = list.findIndex((tab) => tab.id === activeTabId.value);
  const replace = added.length > 0 && untouched(list[active]);
  const at = active < 0 ? list.length : active + 1;
  return [...list.slice(0, replace ? active : at), ...added, ...list.slice(at)];
};

/**
 * openPathsNow opens the files at `files`, see openPaths
 */
const openPathsNow = async (files: string[]) => {
  const { added, last } = await readTabs(tabs.value, files);
  if (last === null) return;
  // an image may have changed on disk since it was loaded
  if (added.length > 0) forgetImages();
  adopt(added);
  const insert = (list: readonly Tab[]) =>
    insertTabs(
      list,
      added.map(([tab]) => tab),
    );
  const active = activeTabId.value;
  if (last === active) {
    tabs.value = insert(tabs.value);
    return;
  }
  const replace = added.length > 0 && untouched(tabById(active ?? ""));
  const next = tabById(last) ?? added.find(([tab]) => tab.id === last)![0];
  const document = await ensureLoaded(next);
  if (replace && active !== null) documents.delete(active);
  await present(last, document, insert, !replace);
};

/**
 * openPaths opens the files at `files`, each in a new tab right of the
 * active one, and shows the last. A file that is open already just has its
 * tab shown, and an untouched "Untitled" makes room for them.
 */
export const openPaths = (files: string[]) =>
  enqueue(() => openPathsNow(files));

/**
 * askToSave asks whether to save the changes of `tab` before it closes
 */
const askToSave = (tab: Tab) =>
  new Promise<"save" | "discard" | "cancel">((resolve) => {
    unsavedDialog.value = {
      label: tabLabel(tab),
      save: () => resolve("save"),
      discard: () => resolve("discard"),
      cancel: () => resolve("cancel"),
    };
  });

/**
 * removeTab takes the tab `id` out of the row. The tab to its right shows
 * then, or the one to its left, unless `next` names another; the last one
 * leaves a new "Untitled".
 * @param remember whether Mod+Shift+T may open its file again
 */
const removeTab = async (
  id: string,
  {
    remember = true,
    next: wantedNext,
  }: { remember?: boolean; next?: string } = {},
) => {
  const tab = tabById(id);
  if (!tab) return;
  const without = (list: readonly Tab[]) =>
    list.filter((other) => other.id !== id);
  if (remember && tab.path !== null) {
    closedPaths.push(tab.path);
    if (closedPaths.length > MAX_CLOSED) closedPaths.shift();
  }
  if (id !== activeTabId.value) {
    documents.delete(id);
    tabs.value = without(tabs.value);
    return;
  }
  const index = tabs.value.indexOf(tab);
  const rest = without(tabs.value);
  let next =
    (wantedNext && tabById(wantedNext)) || rest[index] || rest[index - 1];
  let document: TabDocument;
  let change = without;
  if (next) {
    document = await ensureLoaded(next);
  } else {
    const added = untitledTab(rest);
    [next, document] = added;
    adopt([added]);
    change = (list) => [...without(list), added[0]];
  }
  documents.delete(id);
  await present(next.id, document, change, false);
};

/**
 * closeTab closes the tab `id`, asking first whether to save its changes
 * @returns whether it closed, false if the user cancelled
 */
const closeTab = async (id: string): Promise<boolean> => {
  const tab = tabById(id);
  if (!tab) return true;
  if (tab.unsaved) {
    await switchTo(id);
    const choice = await askToSave(tab);
    if (choice === "cancel") return false;
    if (choice === "save" && !(await saveTabNow(id, {}))) return false;
  }
  await removeTab(id);
  return true;
};

/**
 * closeTabs closes the tabs `ids` one after another, asking for each one
 * with changes, and stops when the user cancels
 */
export const closeTabs = (ids: readonly string[]) =>
  enqueue(async () => {
    for (const id of ids) if (!(await closeTab(id))) return;
  });

/**
 * moveTab moves the tab `id` `by` places to the right, or the left for a
 * negative `by`, up to the ends of the row
 */
export const moveTab = (id: string, by: number) =>
  enqueue(async () => {
    const list = [...tabs.value];
    const from = list.findIndex((tab) => tab.id === id);
    if (from < 0) return;
    const to = Math.min(Math.max(from + by, 0), list.length - 1);
    if (to === from) return;
    const [tab] = list.splice(from, 1);
    list.splice(to, 0, tab);
    tabs.value = list;
  });

/**
 * reopenTab opens the file of the tab closed last again
 */
export const reopenTab = () =>
  enqueue(async () => {
    const file = closedPaths.pop();
    if (file !== undefined) await openPathsNow([file]);
  });

/**
 * saveTabNow saves the tab `id`, see saveTab
 */
const saveTabNow = async (
  id: string,
  options: SaveOptions,
  state?: EditorState,
): Promise<boolean> => {
  const tab = tabById(id);
  if (!tab) return false;
  const document = await ensureLoaded(tab);
  const current =
    id === activeTabId.value ? (state ?? view!.state) : document.state;
  const written = await _saveFile(current, tab, options);
  if (written === null) return false;
  // the name other ways to the file are compared by
  const target = await canonicalPath(written);
  updateTab(id, {
    path: target,
    importedFrom: null,
    untitledNumber: null,
    welcome: false,
  });
  if (id === activeTabId.value) {
    path.value = target;
    importedFrom.value = null;
  }
  // what was typed while the save dialog was open is still unsaved
  setBaseline(id, document, current.doc);
  // another tab still showing the file as it was before
  const other = tabs.value.find((tab) => tab.id !== id && tab.path === target);
  if (other && !other.unsaved) {
    await removeTab(other.id, { remember: false, next: id });
  } else if (other) {
    sendNotification(
      `${target} is also open in another tab, with changes that aren't saved`,
    );
  }
  return true;
};

/**
 * saveTab saves the document of the tab `id` to its file, or where the user
 * chooses, and moves the tab to that file once it's written
 * @param state the shown tab's state, if a command has it
 * @returns whether it was saved
 */
export const saveTab = (
  id: string,
  options: SaveOptions,
  state?: EditorState,
): Promise<boolean> => enqueue(() => saveTabNow(id, options, state));

/**
 * openedPaths starts listening for the files opened from outside while Blank
 * runs (see src-tauri/src/open.rs), which open as tabs, and returns the
 * files it was started with. It listens before it asks, so none is missed.
 */
const openedPaths = async (): Promise<string[]> => {
  try {
    unlisten?.();
    unlisten = await listen<string[]>("open-paths", (event) => {
      void openPaths(event.payload);
    });
    return (await invoke<string[] | null>("take_open_paths")) ?? [];
  } catch (error) {
    // e.g. in a browser, without Tauri
    console.warn("can't learn which files to open", error);
    return [];
  }
};

/**
 * restoreTabs brings back the tabs of the last session, adds the files
 * Blank was started with, and returns the state of the tab to show first.
 * Only that one is loaded; the others load when they are first shown.
 * Without either, Blank starts with the welcome document.
 * @param start a state with the editor's plugins
 */
export const restoreTabs = async (start: EditorState): Promise<EditorState> => {
  base = start;
  let list: Tab[] = [];
  let active: string | null = null;
  try {
    const session = await loadSession();
    if (session) {
      list = session.order.map((id) => ({ id, ...session.tabs[id] }));
      active = session.active;
    }
  } catch (error) {
    console.error("failed to restore the tabs", error);
    sendNotification(
      `Your last documents couldn't be restored: ${errorMessage(error)}`,
    );
  }
  activeTabId.value = active;
  const { added, last } = await readTabs(list, await openedPaths());
  adopt(added);
  list = insertTabs(
    list,
    added.map(([tab]) => tab),
  );
  if (list.length === 0) {
    const welcome = welcomeTab();
    adopt([welcome]);
    list = [welcome[0]];
  }
  const tab = list.find(({ id }) => id === (last ?? active)) ?? list[0];
  tabs.value = list;
  activeTabId.value = tab.id;
  const document = await ensureLoaded(tab);
  showDocument(document.state, tabById(tab.id)!);
  return document.state;
};

/**
 * bootTabs starts the tabs in `editor`, once it shows the first one: their
 * dots follow its changes, and the changes asked for meanwhile run
 * @param state the view's state, which the editor handle keeps current
 * @returns dispose, which stops it and forgets the tabs, e.g. in tests
 */
export const bootTabs = (
  editor: EditorView,
  state: Readonly<Ref<EditorState>>,
) =>
  bootScope(() => {
    view = editor;
    let checked: Node | null = null;
    watch(state, ({ doc }) => {
      const id = activeTabId.value;
      if (id === null || doc === checked) return;
      checked = doc;
      refresh(id);
    });
    started();
    onScopeDispose(() => {
      unlisten?.();
      unlisten = null;
      view = null;
      base = null;
      wanted = null;
      documents.clear();
      closedPaths.length = 0;
      queue = new Promise<void>((resolve) => {
        started = resolve;
      });
    });
  });
