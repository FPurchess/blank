import localforage from "localforage";
import { Node } from "prosemirror-model";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { type Ref, watch } from "vue";

import {
  importedFrom,
  language,
  outlinePinned,
  PAGE_VIEW_MODES,
  pageView,
  type PageViewMode,
  path,
  spellcheck,
  transaction,
  isTheme,
  theme,
  themes,
} from "./state";
import {
  detectLanguage,
  isLanguageTag,
} from "./editor/plugins/autocomplete/languages/lookup";
import { schema } from "./markdown";
import { sendNotification } from "@tauri-apps/plugin-notification";

localforage.config({
  name: "Blank",
  version: 1,
});

// the document is written at most this long after the first unsaved change
const maxWait = 1000;

let latestDoc: Node | null = null;
let latestPath: string | null = null;
let latestImportedFrom: string | null = null;
let pending = false;
let timer: ReturnType<typeof setTimeout> | undefined;
// the settings being written, which flush waits for too
const settling = new Set<Promise<void>>();

/**
 * write stores the latest path and document together, so the stored path
 * never points at a file while the stored document belongs to another one.
 * The Word document an untitled document was imported from belongs to it too.
 */
const write = () => {
  clearTimeout(timer);
  timer = undefined;
  // nothing to pair the path with yet: keep the stored pair as it is
  if (latestDoc === null) return Promise.resolve();
  pending = false;
  return Promise.all([
    localforage.setItem("path", latestPath),
    localforage.setItem("importedFrom", latestImportedFrom),
    localforage.setItem("doc", latestDoc.toJSON()),
  ]).then(() => undefined);
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

/**
 * flush writes pending changes right away
 * @returns a promise that settles once they and the settings changed before
 * are stored
 */
export const flush = (): Promise<void> =>
  Promise.all([pending ? write() : undefined, ...settling]).then(
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
const isPageViewMode = (value: unknown): value is PageViewMode =>
  PAGE_VIEW_MODES.includes(value as PageViewMode);

// false when the storage can't be used, so nothing is restored or persisted
let storageAvailable = true;

export const bootStorage = async () => {
  try {
    await localforage.ready();
  } catch (error) {
    storageAvailable = false;
    language.value = detectLanguage();
    console.error("storage is unavailable", error);
    sendNotification(
      `Blank can't use its storage, so your text won't be restored on the next start: ${error}`,
    );
    return;
  }

  watch(
    path,
    (value) => {
      latestPath = value;
      schedule();
    },
    { flush: "sync" },
  );

  watch(
    importedFrom,
    (value) => {
      latestImportedFrom = value;
      schedule();
    },
    { flush: "sync" },
  );

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

  watch(
    transaction,
    (tx) => {
      if (tx === null) return;
      latestDoc = tx.doc;
      latestPath = path.value;
      latestImportedFrom = importedFrom.value;
      schedule();
    },
    { flush: "sync" },
  );

  // store the last edits before the window closes. A failing or hanging
  // storage must never keep the window open
  try {
    await getCurrentWindow().onCloseRequested(async () => {
      await Promise.race([flush(), timeout(maxWait)]).catch(console.warn);
    });
  } catch (err) {
    console.warn(err);
  }
};

export const getDocumentFromStorage = async (): Promise<Node | undefined> => {
  if (!storageAvailable) return;
  const node = await localforage.getItem("doc");
  return node === null ? undefined : Node.fromJSON(schema, node);
};

export const getPathfromStorage = async () =>
  storageAvailable
    ? await localforage.getItem<string | null>("path")
    : undefined;

export const getImportedFromStorage = async () =>
  storageAvailable
    ? await localforage.getItem<string | null>("importedFrom")
    : undefined;
