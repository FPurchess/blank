import { computed, shallowRef } from "vue";

import { languageName } from "../../spellcheck/service";
import {
  dictionaryKey,
  forms,
  readWords,
  writeWords,
} from "../../spellcheck/userDictionary";
import {
  announce,
  spellcheck,
  spellchecker,
  spellcheckStatus,
} from "../../state";
import { count } from "./settingsModel";

// Your dictionary in the settings (DictionaryPage.vue): the words of the
// language `tag` that spell check accepts. While spell check runs in that
// language, the words go through the spell checker, which saves them and
// checks the text again; otherwise straight to the file.

/**
 * dictionaryOf returns the personal dictionary of `tag`: its words, sorted,
 * whether it can't be changed now (`busy`, while spell check loads it) or at
 * all (`unreadable`), and `add` and `remove`. Call `load` to read the file; while the
 * spell checker runs in the language, the words are its own.
 */
export const dictionaryOf = (tag: string) => {
  const key = dictionaryKey(tag);
  // the words as the file holds them, undefined if it couldn't be read
  const saved = shallowRef<string[] | undefined>([]);
  // the spell checker, while it checks this language
  const live = computed(() => {
    const checker = spellchecker.value;
    return checker && dictionaryKey(checker.tag) === key ? checker : undefined;
  });
  const words = computed(() =>
    [...(live.value ? live.value.words() : (saved.value ?? []))].sort((a, b) =>
      a.localeCompare(b),
    ),
  );
  // the spell checker is loading this dictionary: what's added to the file
  // now would be missing from it, and lost when it saves
  const busy = computed(() => {
    const { state, tag: loading } = spellcheckStatus.value;
    return (
      spellcheck.value &&
      !live.value &&
      (state === "loading" || state === "downloading") &&
      dictionaryKey(loading) === key
    );
  });
  // the file couldn't be read, and writing it would lose what it holds
  const unreadable = computed(() => !live.value && saved.value === undefined);

  const load = async () => {
    saved.value = await readWords(key);
  };

  // changes the file as it is now, which the spell checker may have changed
  // since it was read; a file that can't be read is left alone
  const change = async (edit: (words: string[]) => string[]) => {
    await load();
    if (saved.value === undefined) return false;
    const next = edit(saved.value);
    await writeWords(key, next);
    saved.value = next;
    return true;
  };

  const add = async (word: string) => {
    if (busy.value) return;
    if (live.value) await live.value.addWord(word);
    else if (!(await change((words) => [...words, word]))) return;
    announce(`${word} added to your dictionary`);
  };
  const remove = async (word: string) => {
    if (busy.value) return;
    if (live.value) await live.value.removeWord(word);
    else if (!(await change((words) => words.filter((w) => w !== word))))
      return;
    announce(`${word} removed from your dictionary`);
  };

  return { words, busy, unreadable, load, add, remove };
};

/**
 * validateWord returns what is wrong with adding `word` to `words`, or
 * undefined: one word at a time, and none that is in already in one of its
 * forms (a word in lowercase also counts capitalized)
 */
export const validateWord = (word: string, words: readonly string[]) => {
  if (/\s/.test(word)) return "Add one word at a time.";
  if (words.some((entry) => forms(entry).includes(word)))
    return `${word} is already in your dictionary.`;
};

/**
 * dictionarySummary says how many words the dictionary of `tag` holds, e.g.
 * "12 words in English"
 */
export const dictionarySummary = (words: number, tag: string) =>
  `${words === 0 ? "No words" : count(words, "word")} in ${languageName(tag)}`;
