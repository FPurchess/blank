import { path } from "@tauri-apps/api";
import {
  exists,
  mkdir,
  readTextFile,
  rename,
  writeTextFile,
} from "@tauri-apps/plugin-fs";

import { baseLanguage } from "../editor/plugins/autocomplete/languages/lookup";

// The personal dictionaries: one plain text file per language in the app
// config dir, e.g. dictionaries/de.txt for de, de-AT and de-CH, holding one
// word per line.

/**
 * dictionaryKey returns the name of the personal dictionary for `tag`
 */
export const dictionaryKey = (tag: string) => {
  const base = baseLanguage(tag);
  // Norwegian Bokmål goes by both codes
  return base === "nb" ? "no" : base;
};

const fileOf = async (key: string) =>
  await path.join(await path.appConfigDir(), "dictionaries", `${key}.txt`);

/**
 * readWords returns the words of the personal dictionary `key`, or undefined if
 * the file exists but can't be read, which must not be overwritten
 */
export const readWords = async (key: string): Promise<string[] | undefined> => {
  const file = await fileOf(key);
  try {
    if (!(await exists(file))) return [];
    return (await readTextFile(file))
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    console.warn(`failed to read the dictionary ${file}`, error);
    return undefined;
  }
};

/**
 * writeWords saves `words` sorted and without duplicates as the personal
 * dictionary `key`. The file is replaced as a whole, so it is never left
 * half written.
 */
export const writeWords = async (key: string, words: string[]) => {
  const file = await fileOf(key);
  const content = [...new Set(words)].sort().join("\n");
  await mkdir(await path.dirname(file), { recursive: true });
  await writeTextFile(`${file}.tmp`, content ? content + "\n" : "");
  await rename(`${file}.tmp`, file);
};

/**
 * forms returns the spellings a personal dictionary entry accepts, following
 * Hunspell: a lowercase entry also matches when capitalized or in capitals,
 * any other entry only as written or in capitals ("iPhone", "IPHONE")
 */
export const forms = (entry: string): string[] => {
  const upper = entry.toUpperCase();
  if (entry !== entry.toLowerCase()) return [entry, upper];
  const capitalized = entry.charAt(0).toUpperCase() + entry.slice(1);
  return [entry, capitalized, upper];
};
