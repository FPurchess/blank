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

// Changes to the tabs run one after another, in the order they were asked
// for, e.g. two files opened from the terminal at once. They start once the
// view is there (bootTabs).
let started: () => void = () => {};
let queue: Promise<unknown> = new Promise<void>((resolve) => {
  started = resolve;
});
const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
  const run = queue.then(task);
  queue = run.catch((error) => console.error(error));
  return run;
};

const newId = () => crypto.randomUUID();
const tabById = (id: string) => tabs.value.find((tab) => tab.id === id);
const shown = () => view!.state;
const stateOf = (doc: Node) => documentState(base!, doc);

/**
 * docOf returns the document of the tab `id` as it is now
 */
const docOf = (id: string): Node | undefined =>
  id === activeTabId.value && view ? shown().doc : documents.get(id)?.state.doc;

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
 * kept returns what a tab keeps of `state`: the document it starts with
 * counts as saved unless `saved` is false
 */
const kept = (state: EditorState, saved = true): TabDocument => ({
  state,
  baseline: saved ? state.doc : null,
  checker: spellchecker.value,
});

/**
 * newTab returns a tab for `file`, with what it keeps
 */
const newTab = (
  loaded: LoadedDocument,
  extra: Partial<Tab> = {},
): [Tab, TabDocument] => {
  const state = stateOf(loaded.doc);
  // an import isn't saved until it is saved as markdown
  const saved = loaded.importedFrom === null;
  const tab: Tab = {
    id: newId(),
    path: loaded.path,
    importedFrom: loaded.importedFrom,
    untitledNumber: null,
    unsaved: !saved,
    viewAnchor: null,
    ...extra,
  };
  return [tab, kept(state, saved)];
};

/**
 * untitledTab returns a new, empty tab named after the lowest free number
 */
const untitledTab = (list: readonly Tab[]) =>
  newTab(
    { doc: emptyDocument(), path: null, importedFrom: null },
    { untitledNumber: freeUntitledNumber(list) },
  );

/**
 * read reads the document at `file`, see readDocument, and reports a file
 * that can't even be looked at, e.g. one it isn't allowed to
 */
const read = async (file: string, silent = false) => {
  try {
    return await readDocument(file, silent);
  } catch (error) {
    console.error(`failed to open ${file}`, error);
    if (!silent)
      sendNotification(`Failed to open file: ${errorMessage(error)}`);
  }
};

/**
 * readBaseline reads the file of the tab `id` in the background, to tell
 * whether its restored changes still differ from it. A file that has gone
 * keeps the tab's text, unsaved, and says so.
 */
const readBaseline = (id: string, file: string) => {
  void read(file, true).then((loaded) => {
    const tab = tabById(id);
    const known = documents.get(id);
    if (!tab || !known) return;
    if (loaded && loaded.path === tab.path) {
      known.baseline = stateOf(loaded.doc).doc;
      refresh(id);
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
    const loaded = await read(tab.path, true);
    if (loaded) return kept(stateOf(loaded.doc));
  }
  const stored = await storedDocument(tab);
  if (tab.path !== null) {
    // changes kept from the last time, or a file that has gone: the file
    // tells in the background whether they differ from it
    if (!tab.unsaved) updateTab(tab.id, { unsaved: true });
    readBaseline(tab.id, tab.path);
    return kept(stateOf(stored ?? emptyDocument()), false);
  }
  if (tab.importedFrom !== null) {
    if (stored) return kept(stateOf(stored), false);
    const loaded = await read(tab.importedFrom, true);
    return kept(stateOf(loaded?.doc ?? emptyDocument()), false);
  }
  const start = tab.welcome ? welcomeDocument() : emptyDocument();
  const document = kept(stateOf(start));
  if (stored) document.state = stateOf(stored);
  return document;
};

/**
 * ensureLoaded returns what the tab `id` keeps, loading it if it wasn't yet
 */
const ensureLoaded = async (tab: Tab): Promise<TabDocument> => {
  let document = documents.get(tab.id);
  if (!document) {
    document = await loadTab(tab);
    documents.set(tab.id, document);
  }
  return document;
};

/**
 * showTab shows the tab `id` in the view. The shown document's globals
 * change before the view gets the new state: the page view lays it out right
 * then, with its path, and storage files it under the new tab.
 */
const showTab = (id: string, next: TabDocument, keepLeaving = true) => {
  const v = view!;
  closeRequests();
  const leaving = activeTabId.value;
  const left = leaving === null ? undefined : documents.get(leaving);
  if (keepLeaving && leaving !== null && left) {
    left.state = v.state;
    left.checker = spellchecker.value;
    updateTab(leaving, { viewAnchor: currentViewAnchor() });
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
  const index = tabs.value.indexOf(tab);
  const unsaved = tab.unsaved ? ", unsaved changes" : "";
  announce(
    `${tabLabel(tab)}, tab ${index + 1} of ${tabs.value.length}${unsaved}`,
    { quiet: true },
  );
};

/**
 * leaveComposition ends what the input method is composing, so its text
 * lands in the tab it was typed in
 */
const leaveComposition = async () => {
  if (!view?.composing) return;
  view.dom.blur();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

/**
 * switchTo shows the tab `id`, loading it first if needed
 */
const switchTo = async (id: string) => {
  const tab = tabById(id);
  if (!tab || id === activeTabId.value) return;
  const document = await ensureLoaded(tab);
  await leaveComposition();
  if (tabById(id)) showTab(id, document);
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
    const [tab, document] = untitledTab(tabs.value);
    documents.set(tab.id, document);
    storeDocument(tab.id, document.state.doc);
    tabs.value = [...tabs.value, tab];
    await leaveComposition();
    showTab(tab.id, document);
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
    const loaded = await read(canonical);
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
const untouched = (tab: Tab | null) =>
  tab !== null && tab.untitledNumber !== null && !tab.unsaved;

/**
 * insertTabs returns `list` with the tabs `added` right of the active tab,
 * which they replace if it's untouched
 */
const insertTabs = (list: readonly Tab[], added: readonly Tab[]) => {
  const active = list.findIndex((tab) => tab.id === activeTabId.value);
  const replace = added.length > 0 && untouched(list[active] ?? null);
  const at = active < 0 ? list.length : active + 1;
  return [...list.slice(0, replace ? active : at), ...added, ...list.slice(at)];
};

/**
 * openPaths opens the files at `files`, each in a new tab right of the
 * active one, and shows the last. A file that is open already just has its
 * tab shown, and an untouched "Untitled" makes room for them.
 */
export const openPaths = (files: string[]) =>
  enqueue(async () => {
    const { added, last } = await readTabs(tabs.value, files);
    // an image may have changed on disk since it was loaded
    if (added.length > 0) forgetImages();
    const before = tabs.value;
    const list = insertTabs(
      before,
      added.map(([tab]) => tab),
    );
    for (const [tab, document] of added) {
      documents.set(tab.id, document);
      storeDocument(tab.id, document.state.doc);
    }
    const replaced = before.find((tab) => !list.includes(tab));
    if (replaced) documents.delete(replaced.id);
    tabs.value = list;
    if (last === null) return;
    if (replaced) {
      const document = await ensureLoaded(tabById(last)!);
      await leaveComposition();
      showTab(last, document, false);
    } else {
      await switchTo(last);
    }
  });

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
 * then, or the one to its left; the last one leaves a new "Untitled".
 */
const removeTab = async (id: string) => {
  const list = tabs.value;
  const index = list.findIndex((tab) => tab.id === id);
  if (index < 0) return;
  const tab = list[index];
  const rest = list.filter((other) => other.id !== id);
  if (tab.path !== null) {
    closedPaths.push(tab.path);
    if (closedPaths.length > MAX_CLOSED) closedPaths.shift();
  }
  if (id !== activeTabId.value) {
    documents.delete(id);
    tabs.value = rest;
    return;
  }
  let next = rest[index] ?? rest[index - 1];
  let document: TabDocument;
  if (next) {
    document = await ensureLoaded(next);
  } else {
    [next, document] = untitledTab(rest);
    rest.push(next);
    documents.set(next.id, document);
    storeDocument(next.id, document.state.doc);
  }
  await leaveComposition();
  documents.delete(id);
  tabs.value = rest;
  showTab(next.id, document, false);
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
export const moveTab = (id: string, by: number) => {
  const list = [...tabs.value];
  const from = list.findIndex((tab) => tab.id === id);
  if (from < 0) return;
  const to = Math.min(Math.max(from + by, 0), list.length - 1);
  if (to === from) return;
  const [tab] = list.splice(from, 1);
  list.splice(to, 0, tab);
  tabs.value = list;
};

/**
 * reopenTab opens the file of the tab closed last again
 */
export const reopenTab = () => {
  const file = closedPaths.pop();
  return file === undefined ? Promise.resolve() : openPaths([file]);
};

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
    id === activeTabId.value ? (state ?? shown()) : document.state;
  const target = await _saveFile(current, tab, options);
  if (target === null) return false;
  // what was typed while the save dialog was open is still unsaved
  document.baseline = current.doc;
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
  refresh(id);
  // another tab still showing the file as it was before
  const other = tabs.value.find((tab) => tab.id !== id && tab.path === target);
  if (other && !other.unsaved) {
    await removeTab(other.id);
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
    await listen<string[]>("open-paths", (event) => {
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
  for (const [tab, document] of added) {
    documents.set(tab.id, document);
    storeDocument(tab.id, document.state.doc);
  }
  list = insertTabs(
    list,
    added.map(([tab]) => tab),
  );
  active = last ?? active;
  if (list.length === 0) {
    const [tab, document] = newTab(
      { doc: welcomeDocument(), path: null, importedFrom: null },
      { welcome: true },
    );
    documents.set(tab.id, document);
    storeDocument(tab.id, document.state.doc);
    list = [tab];
  }
  const tab = list.find(({ id }) => id === active) ?? list[0];
  tabs.value = list;
  const document = await ensureLoaded(tab);
  activeTabId.value = tab.id;
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
