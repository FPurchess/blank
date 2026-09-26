import { sendNotification } from "@tauri-apps/plugin-notification";

import { language, spellcheck, spellchecker, spellcheckStatus } from "../state";
import * as ipc from "./ipc";
import type { Spellchecker } from "./types";
import { dictionaryKey, forms, readWords, writeWords } from "./userDictionary";

// words checked per call to the engine at most
const BATCH_SIZE = 5000;

/**
 * languageName returns the English name of `tag`, e.g. "German (Switzerland)"
 */
export const languageName = (tag: string) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * matchCase returns `suggestion` in the case of `word`: in capitals if the
 * word is, capitalized if the word is
 */
export const matchCase = (word: string, suggestion: string) => {
  if (word.length > 1 && word === word.toUpperCase()) {
    return suggestion.toUpperCase();
  }
  if (word.charAt(0) !== word.charAt(0).toLowerCase()) {
    return suggestion.charAt(0).toUpperCase() + suggestion.slice(1);
  }
  return suggestion;
};

const isCapitalized = (word: string) =>
  word.length > 1 &&
  word.charAt(0) !== word.charAt(0).toLowerCase() &&
  word.slice(1) === word.slice(1).toLowerCase();

// the engine holds one dictionary at a time, so loads and unloads run in order
let engine = Promise.resolve();
const queue = (task: () => Promise<void>) => {
  const run = engine.then(task);
  engine = run.catch(() => {});
  return run;
};

// incremented on every change of the language or the spell check setting, so
// work for a previous one is dropped
let generation = 0;

/**
 * createSpellchecker returns a Spellchecker for the loaded dictionary. `words`
 * is the personal dictionary, or undefined if its file couldn't be read, in
 * which case added words are kept for the session only.
 */
const createSpellchecker = (
  tag: string,
  words: string[] | undefined,
  run: number,
): Spellchecker => {
  const key = dictionaryKey(tag);
  const saved = words !== undefined;
  let entries = [...(words ?? [])];
  let accepted = new Set(entries.flatMap(forms));
  const results = new Map<string, boolean>();
  const suggestions = new Map<string, Promise<string[]>>();

  const current = () => run === generation;

  // publish replaces the spellchecker, so the editor checks the text again
  const publish = () => {
    accepted = new Set(entries.flatMap(forms));
    suggestions.clear();
    if (current()) spellchecker.value = createView();
  };

  const save = async () => {
    if (!saved) {
      sendNotification(
        "Your dictionary file couldn't be read, so this change is only kept until Blank is closed",
      );
      return;
    }
    try {
      await writeWords(key, entries);
    } catch (error) {
      sendNotification(
        `Failed to save your dictionary: ${errorMessage(error)}`,
      );
    }
  };

  const suggest = async (word: string) => {
    const found = await ipc.suggest(word);
    // the engine suggests poorly for capitalized words, e.g. "Eh" for "Teh",
    // so also ask for the lowercase word
    const lower = isCapitalized(word)
      ? await ipc.suggest(word.toLowerCase())
      : [];
    return [
      ...new Set([...lower, ...found].map((s) => matchCase(word, s))),
    ].filter((s) => s !== word);
  };

  const createView = (): Spellchecker => ({
    tag,
    isCorrect: (word) => (accepted.has(word) ? true : results.get(word)),
    async check(list) {
      const unknown = [
        ...new Set(list.filter((w) => !accepted.has(w) && !results.has(w))),
      ];
      for (let i = 0; i < unknown.length && current(); i += BATCH_SIZE) {
        const batch = unknown.slice(i, i + BATCH_SIZE);
        const correct = await ipc.check(batch);
        if (!current()) return;
        batch.forEach((word, index) => results.set(word, correct[index]));
      }
    },
    suggest(word) {
      let found = suggestions.get(word);
      if (!found) {
        found = suggest(word);
        suggestions.set(word, found);
        found.catch(() => suggestions.delete(word));
      }
      return found;
    },
    userEntry: (word) => entries.find((entry) => forms(entry).includes(word)),
    async addWord(word) {
      if (!current() || entries.includes(word)) return;
      entries = [...entries, word];
      await ipc.add(word);
      publish();
      await save();
    },
    async removeWord(entry) {
      if (!current() || !entries.includes(entry)) return;
      entries = entries.filter((e) => e !== entry);
      await ipc.remove(entry);
      // words of other forms may have been accepted because of the entry
      results.clear();
      publish();
      await save();
    },
    async replaceWord(entry, word) {
      if (!current() || entry === word) return;
      entries = [...entries.filter((e) => e !== entry && e !== word), word];
      await ipc.remove(entry);
      await ipc.add(word);
      results.clear();
      publish();
      await save();
    },
  });

  return createView();
};

/**
 * update loads the dictionary for the current language if spell check is on,
 * downloading it first if needed, and publishes the spell checker
 */
export const update = async () => {
  const run = ++generation;
  const stale = () => run !== generation;
  const tag = language.value;
  spellchecker.value = null;

  if (!spellcheck.value) {
    spellcheckStatus.value = { state: "off", tag };
    await queue(ipc.unload).catch(console.warn);
    return;
  }

  try {
    const status = await ipc.status(tag);
    if (stale()) return;
    if (!status.available) {
      spellcheckStatus.value = { state: "unavailable", tag };
      return;
    }

    if (!status.installed || status.outdated) {
      spellcheckStatus.value = { state: "downloading", tag, progress: 0 };
      try {
        await ipc.install(tag, (received, total) => {
          if (stale()) return;
          const progress = total ? received / total : 0;
          spellcheckStatus.value = { state: "downloading", tag, progress };
        });
      } catch (error) {
        // an update that fails keeps the installed version working
        if (!status.installed) throw error;
        console.warn("failed to update the dictionary", error);
      }
      if (stale()) return;
    }

    spellcheckStatus.value = { state: "loading", tag };
    const words = await readWords(dictionaryKey(tag));
    await queue(async () => {
      if (!stale()) await ipc.load(tag, words ?? []);
    });
    if (stale()) return;
    spellchecker.value = createSpellchecker(tag, words, run);
    spellcheckStatus.value = { state: "ready", tag };
  } catch (error) {
    if (stale()) return;
    const message = errorMessage(error);
    spellcheckStatus.value = { state: "error", tag, message };
    sendNotification(
      `Spell check for ${languageName(tag)} failed: ${
        message === "Integrity"
          ? "the downloaded dictionary is damaged"
          : message
      }`,
    );
  }
};

/**
 * bootSpellcheck checks spelling in the current language while spell check is
 * on. It doesn't wait for the dictionary, so a download never delays the start.
 */
export const bootSpellcheck = () => {
  spellcheck.subscribe(() => void update());
  language.subscribe(() => void update());
  void update();
};
