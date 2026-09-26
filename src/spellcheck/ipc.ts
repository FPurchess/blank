import { Channel, invoke } from "@tauri-apps/api/core";

// The commands of the spell check engine in src-tauri/src/spellcheck/.

export interface Status {
  // there is a dictionary for the language
  available: boolean;
  // it can be loaded without a download
  installed: boolean;
  // a newer version than the installed one is available
  outdated: boolean;
}

export const status = (tag: string) =>
  invoke<Status>("spellcheck_status", { tag });

/**
 * install downloads the dictionary for `tag`, reporting the bytes received so
 * far and the total size to `onProgress`
 */
export const install = (
  tag: string,
  onProgress: (received: number, total: number) => void,
) => {
  const channel = new Channel<{ received: number; total: number }>();
  channel.onmessage = ({ received, total }) => onProgress(received, total);
  return invoke<void>("spellcheck_install", { tag, onProgress: channel });
};

export const load = (tag: string, userWords: string[]) =>
  invoke<void>("spellcheck_load", { tag, userWords });

export const unload = () => invoke<void>("spellcheck_unload");

export const check = (words: string[]) =>
  invoke<boolean[]>("spellcheck_check", { words });

export const suggest = (word: string) =>
  invoke<string[]>("spellcheck_suggest", { word });

export const add = (word: string) => invoke<void>("spellcheck_add", { word });

export const remove = (word: string) =>
  invoke<void>("spellcheck_remove", { word });
