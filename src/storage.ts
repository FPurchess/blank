import localforage from "localforage";
import { Node } from "prosemirror-model";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { type Ref, watch } from "vue";

import {
  importedFrom,
  language,
  PAGE_VIEW_MODES,
  pageView,
  type PageViewMode,
  path,
  spellcheck,
  transaction,
  theme,
  themeType,
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
 * @returns a promise that settles once they are stored
 */
export const flush = (): Promise<void> =>
  pending ? write() : Promise.resolve();

const timeout = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * persist stores the value of `ref` under `key` whenever it changes
 */
const persist = <T>(ref: Readonly<Ref<T>>, key: string) =>
  watch(
    ref,
    (value) => {
      localforage.setItem(key, value).catch(console.warn);
    },
    { flush: "sync" },
  );

// false when the storage can't be used, so nothing is restored or persisted
let storageAvailable = true;

export const bootStorage = async () => {
  try {
    await localforage.ready();
    storageAvailable = true;
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

  const _theme = await localforage.getItem("theme");
  theme.value = themes.includes(_theme as string)
    ? (_theme as themeType)
    : themes[0];

  persist(theme, "theme");

  // the system language on first start, the chosen one afterwards
  const _language = await localforage.getItem("language");
  language.value = isLanguageTag(_language) ? _language : detectLanguage();
  if (_language !== language.value) {
    await localforage.setItem("language", language.value).catch(console.warn);
  }

  persist(language, "language");

  // off until the user turns it on
  spellcheck.value = (await localforage.getItem("spellcheck")) === true;
  persist(spellcheck, "spellcheck");

  // the page view the user chose last, "page ends" at first
  const _pageView = await localforage.getItem("pageView");
  pageView.value = PAGE_VIEW_MODES.includes(_pageView as PageViewMode)
    ? (_pageView as PageViewMode)
    : "page-ends";
  persist(pageView, "pageView");

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
