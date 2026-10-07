import localforage from "localforage";
import { Node } from "prosemirror-model";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { type Ref, watch } from "vue";

import { invoke } from "@tauri-apps/api/core";

import {
  activeTabId,
  blocksPaneOpen,
  cleanRecentCommands,
  cleanRecentFiles,
  currentViewAnchor,
  language,
  outlinePinned,
  PAGE_VIEW_MODES,
  pageLayoutState,
  pageView,
  type PageViewMode,
  printSettings,
  pageZoom,
  isPageZoom,
  recentCommands,
  recentFiles,
  spellcheck,
  type Tab,
  tabs,
  transaction,
  isTheme,
  theme,
  themes,
} from "./state";
import {
  detectLanguage,
  isLanguageTag,
} from "./editor/plugins/autocomplete/languages/lookup";
import { CommandIdentifier } from "./config";
import { closeMarker, fenceFor, formatMarker, schema } from "./markdown";
import { isPrintSettings, PRINT_DEFAULTS } from "./print/printModel";
import { sendNotification } from "@tauri-apps/plugin-notification";

localforage.config({
  name: "Blank",
  version: 1,
});

// the documents and tabs are written at most this long after the first
// unsaved change
const maxWait = 1000;

// A tab as stored in the session: everything but its document, which is
// stored under `tab:<id>`
type StoredTab = Omit<Tab, "id">;

// The open tabs: their order, the active one, and each one's details
export interface Session {
  version: 1;
  order: string[];
  active: string;
  tabs: Record<string, StoredTab>;
}

const SESSION = "session";
const tabKey = (id: string) => `tab:${id}`;

// the documents waiting to be written, and the ones last written, by tab
const pendingDocs = new Map<string, Node>();
const storedDocs = new Map<string, Node>();
// the tabs closed since the last write, whose documents are removed then
const removedTabs = new Set<string>();
let sessionPending = false;
let pending = false;
let timer: ReturnType<typeof setTimeout> | undefined;
// the settings being written, which flush waits for too
const settling = new Set<Promise<void>>();
// the write under way, e.g. one the timer started, which flush waits for
// too: what it took is no longer pending
let writing: Promise<unknown> = Promise.resolve();

/**
 * sessionOf returns the session to store: the tabs as they are, with the
 * active one's spot in the view now
 */
const sessionOf = (): Session | null => {
  const list = tabs.value;
  if (list.length === 0) return null;
  // the first tab, for a moment where the active one is being replaced
  const active = list.some((tab) => tab.id === activeTabId.value)
    ? activeTabId.value!
    : list[0].id;
  const anchor = currentViewAnchor();
  return {
    version: 1,
    order: list.map((tab) => tab.id),
    active,
    tabs: Object.fromEntries(
      list.map(({ id, ...tab }) => [
        id,
        id === active && pageLayoutState.value
          ? { ...tab, viewAnchor: anchor }
          : tab,
      ]),
    ),
  };
};

/**
 * write stores what changed: first the tabs' documents, then the session,
 * then it removes the documents of closed tabs, so the stored session never
 * lists a tab whose document is missing. What fails stays pending for the
 * next write.
 */
const write = () => {
  const run = writeNow();
  writing = run.catch(() => {});
  return run;
};

const writeNow = async () => {
  clearTimeout(timer);
  timer = undefined;
  pending = false;
  const docs = [...pendingDocs];
  pendingDocs.clear();
  const session = sessionPending ? sessionOf() : null;
  sessionPending = false;
  const removed = [...removedTabs];
  removedTabs.clear();
  try {
    await Promise.all(
      docs.map(async ([id, doc]) => {
        await localforage.setItem(tabKey(id), doc.toJSON());
        storedDocs.set(id, doc);
      }),
    );
    if (session) await localforage.setItem(SESSION, session);
    await Promise.all(removed.map((id) => localforage.removeItem(tabKey(id))));
  } catch (error) {
    // unless a newer document came meanwhile
    for (const [id, doc] of docs) {
      if (!pendingDocs.has(id) && storedDocs.get(id) !== doc)
        pendingDocs.set(id, doc);
    }
    for (const id of removed) removedTabs.add(id);
    sessionPending ||= session !== null;
    pending = true;
    throw error;
  }
};

/**
 * schedule writes the pending changes at most `maxWait` after the first one,
 * so continuous typing is still stored every second
 */
const schedule = () => {
  pending = true;
  if (timer === undefined) {
    timer = setTimeout(() => {
      write().catch(console.warn);
    }, maxWait);
  }
};

// false when the session isn't kept: the storage can't be used, or another
// Blank keeps it (see bootStorage)
let sessionKept = true;

/**
 * storeDocument stores `doc` as the document of the tab `id` with the next
 * write, e.g. of a tab that was just opened
 */
export const storeDocument = (id: string, doc: Node) => {
  if (!sessionKept) return;
  if (storedDocs.get(id) === doc || pendingDocs.get(id) === doc) return;
  pendingDocs.set(id, doc);
  schedule();
};

/**
 * flush writes pending changes right away
 * @returns a promise that settles once they and the settings changed before
 * are stored
 */
export const flush = (): Promise<void> =>
  Promise.all([writing, pending ? write() : undefined, ...settling]).then(
    () => undefined,
  );

/**
 * exposeStorage lets E2E tests store what is pending before they restart
 * the app, as closing its window does (see onCloseRequested below), through
 * `window.blankFlushStorage`
 */
export const exposeStorage = () => {
  Object.assign(window, { blankFlushStorage: flush });
};

const timeout = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * persist stores the value of `ref` under `key` whenever it changes
 */
const persist = <T>(ref: Readonly<Ref<T>>, key: string) =>
  watch(
    ref,
    (value) => {
      const stored = localforage
        .setItem(key, value)
        .then(() => undefined, console.warn)
        .finally(() => settling.delete(stored));
      settling.add(stored);
    },
    { flush: "sync" },
  );

/**
 * restore sets `ref` to what is stored under `key`, or to `fallback` when
 * nothing valid is, and then persists it
 */
const restore = async <T>(
  key: string,
  ref: Ref<T>,
  valid: (value: unknown) => value is T,
  fallback: T,
) => {
  const stored = await localforage.getItem(key);
  ref.value = valid(stored) ? stored : fallback;
  persist(ref, key);
};

const isTrue = (value: unknown): value is boolean => value === true;
const isList = (value: unknown): value is never[] => Array.isArray(value);
// a list as `clean` keeps it, the same one if it keeps all of it, so
// nothing is written back
const cleaned = <T>(list: readonly T[], kept: readonly T[]) =>
  kept.length === list.length ? list : kept;
const COMMAND_IDS = new Set<string>(Object.values(CommandIdentifier));
const isPageViewMode = (value: unknown): value is PageViewMode =>
  PAGE_VIEW_MODES.includes(value as PageViewMode);

/**
 * ownSession takes the lock on the session, which only one Blank holds at a
 * time. Without it, this Blank was started next to one that keeps the
 * session. A lock that can't be checked counts as taken by this one.
 */
const ownSession = async () => {
  try {
    return await invoke<boolean>("session_lock");
  } catch (error) {
    console.warn("can't check the session lock", error);
    return true;
  }
};

/**
 * watchSession stores the active tab's document as it changes, and the
 * session as tabs open, close, move or change
 */
const watchSession = () => {
  watch(
    transaction,
    (tx) => {
      const id = activeTabId.value;
      if (tx !== null && id !== null) storeDocument(id, tx.doc);
    },
    { flush: "sync" },
  );
  let known = new Set<string>();
  watch(
    [tabs, activeTabId],
    ([list]) => {
      const ids = new Set(list.map((tab) => tab.id));
      for (const id of known) {
        if (ids.has(id)) continue;
        removedTabs.add(id);
        pendingDocs.delete(id);
        storedDocs.delete(id);
      }
      known = ids;
      sessionPending = true;
      schedule();
    },
    { flush: "sync" },
  );
};

export const bootStorage = async () => {
  try {
    await localforage.ready();
  } catch (error) {
    sessionKept = false;
    language.value = detectLanguage();
    console.error("storage is unavailable", error);
    sendNotification(
      `Blank can't use its storage, so your text won't be restored on the next start: ${error}`,
    );
    return;
  }

  await restore("theme", theme, isTheme, themes[0]);

  // the system language on first start, the chosen one afterwards
  const _language = await localforage.getItem("language");
  language.value = isLanguageTag(_language) ? _language : detectLanguage();
  if (_language !== language.value) {
    await localforage.setItem("language", language.value).catch(console.warn);
  }

  persist(language, "language");

  // off until the user turns it on
  await restore("spellcheck", spellcheck, isTrue, false);
  // the page view the user chose last, "page ends" at first
  await restore("pageView", pageView, isPageViewMode, "page-ends");
  // the outline closed until the user keeps it open
  await restore("outline", outlinePinned, isTrue, false);
  // the blocks pane closed until the user opens it
  await restore("blocksPane", blocksPaneOpen, isTrue, false);
  // what the print dialog chose last, the printer at first
  await restore("print", printSettings, isPrintSettings, PRINT_DEFAULTS);
  // the pages fit to the window until the user zooms
  await restore("pageZoom", pageZoom, isPageZoom, "fit");
  // the commands and files used last, without what Blank no longer knows
  await restore("recentCommands", recentCommands, isList, []);
  await restore("recentFiles", recentFiles, isList, []);
  recentCommands.value = cleaned(
    recentCommands.value,
    cleanRecentCommands(recentCommands.value, COMMAND_IDS),
  );
  recentFiles.value = cleaned(
    recentFiles.value,
    cleanRecentFiles(recentFiles.value),
  );

  sessionKept = await ownSession();
  if (sessionKept) {
    watchSession();
  } else {
    sendNotification(
      "Blank is already open in another window, so this window won't remember its tabs",
    );
  }

  // store the last edits before the window closes. A failing or hanging
  // storage must never keep the window open
  try {
    await getCurrentWindow().onCloseRequested(async () => {
      // with where the view is now, even if only that changed
      if (sessionKept) sessionPending = pending = true;
      await Promise.race([flush(), timeout(maxWait)]).catch(console.warn);
    });
  } catch (err) {
    console.warn(err);
  }
};

interface StoredNode {
  type: string;
  content?: StoredNode[];
}

/**
 * restorable makes a document a newer Blank stored one this Blank can open: a
 * block at its top of a type this Blank doesn't know becomes a content block
 * it can't show, which keeps the block's JSON, so nothing of it is lost
 */
export const restorable = (stored: unknown): unknown => {
  const doc = stored as StoredNode | null;
  if (!doc || !Array.isArray(doc.content)) return stored;
  if (doc.content.every((node) => node.type in schema.nodes)) return stored;
  return {
    ...doc,
    content: doc.content.map((node) => {
      if (node.type in schema.nodes) return node;
      const json = JSON.stringify(node, null, 2);
      const fence = fenceFor(json);
      const raw = [
        formatMarker({ name: "stored", format: 1, args: { type: node.type } }),
        `${fence}json\n${json}\n${fence}`,
        closeMarker("stored"),
      ].join("\n\n");
      return { type: "unknown_block", attrs: { raw } };
    }),
  };
};

const isSession = (value: unknown): value is Session => {
  const session = value as Session | null;
  return (
    session?.version === 1 &&
    Array.isArray(session.order) &&
    session.order.length > 0 &&
    session.order.every((id) => typeof session.tabs?.[id] === "object")
  );
};

/**
 * migrate turns the one document an earlier Blank stored into the first tab:
 * the old keys go only once the new ones are written. The tab counts as
 * unsaved, since that Blank didn't know whether it was, until the file says
 * otherwise (see src/editor/tabs.ts).
 */
const migrate = async (): Promise<Session | null> => {
  const doc = await localforage.getItem("doc");
  if (doc === null) return null;
  const id = crypto.randomUUID();
  const tab = {
    path: (await localforage.getItem<string | null>("path")) ?? null,
    importedFrom:
      (await localforage.getItem<string | null>("importedFrom")) ?? null,
  };
  const session: Session = {
    version: 1,
    order: [id],
    active: id,
    tabs: {
      [id]: {
        ...tab,
        // an untitled one is numbered, as new ones are
        untitledNumber:
          tab.path === null && tab.importedFrom === null ? 1 : null,
        unsaved: true,
        viewAnchor: null,
      },
    },
  };
  await localforage.setItem(tabKey(id), doc);
  await localforage.setItem(SESSION, session);
  await Promise.all(
    ["doc", "path", "importedFrom"].map((key) => localforage.removeItem(key)),
  );
  return session;
};

/**
 * loadSession returns the stored session, or null when there is none or this
 * Blank doesn't keep it
 */
export const loadSession = async (): Promise<Session | null> => {
  if (!sessionKept) return null;
  const stored = await localforage.getItem(SESSION);
  if (isSession(stored)) {
    const active = stored.order.includes(stored.active)
      ? stored.active
      : stored.order[0];
    return { ...stored, active };
  }
  if (stored === null) return migrate();
  // e.g. one a newer Blank wrote: kept, so going back to it loses nothing
  console.warn("ignoring a session this Blank can't read", stored);
  await localforage.setItem("session-backup", stored).catch(console.warn);
  sendNotification(
    'Your last tabs couldn\'t be restored, so Blank starts afresh. They were kept as "session-backup".',
  );
  return null;
};

/**
 * loadTabDocument returns the stored document of the tab `id`, or undefined
 * when none is stored. It throws when the stored one can't be read.
 */
export const loadTabDocument = async (
  id: string,
): Promise<Node | undefined> => {
  if (!sessionKept) return;
  const stored = await localforage.getItem(tabKey(id));
  if (stored === null) return;
  const doc = Node.fromJSON(schema, restorable(stored));
  storedDocs.set(id, doc);
  return doc;
};

/**
 * backupTabDocument copies the stored document of the tab `id` to
 * `tab-backup:<id>`, so autosave can't overwrite the only copy of a document
 * that can't be restored
 * @returns whether a copy was kept
 */
export const backupTabDocument = async (id: string): Promise<boolean> => {
  try {
    const raw = await localforage.getItem(tabKey(id));
    if (raw === null) return false;
    await localforage.setItem(`tab-backup:${id}`, raw);
    return true;
  } catch (error) {
    console.error("failed to back up the stored document", error);
    return false;
  }
};
