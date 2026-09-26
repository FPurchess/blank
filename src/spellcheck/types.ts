/**
 * Spellchecker checks words in one language. It is published through
 * `spellchecker` in state.ts once its dictionary is loaded.
 */
export interface Spellchecker {
  // the language tag, e.g. "de-CH"
  tag: string;
  // whether `word` is spelled correctly, or undefined if it hasn't been
  // checked yet, see `check`
  isCorrect(word: string): boolean | undefined;
  // checks the words `isCorrect` doesn't know yet
  check(words: string[]): Promise<void>;
  // returns the suggestions for a misspelled word, best first
  suggest(word: string): Promise<string[]>;
  // returns the entry of the personal dictionary that accepts `word`
  userEntry(word: string): string | undefined;
  addWord(word: string): Promise<void>;
  removeWord(entry: string): Promise<void>;
  replaceWord(entry: string, word: string): Promise<void>;
}

export type SpellcheckState =
  // turned off
  | "off"
  // loading the dictionary
  | "loading"
  // downloading the dictionary, see `progress`
  | "downloading"
  // checking spelling
  | "ready"
  // there is no dictionary for the language
  | "unavailable"
  // the dictionary couldn't be downloaded or loaded, see `message`
  | "error";

export interface SpellcheckStatus {
  state: SpellcheckState;
  // the language tag
  tag: string;
  // the share of the dictionary downloaded so far, from 0 to 1
  progress?: number;
  message?: string;
}
