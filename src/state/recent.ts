import { shallowRef } from "vue";

import type { CommandIdentifier } from "../config";

// What the user used last, newest first, kept across restarts (see
// storage.ts): the commands, which the main menu shows under Recent and
// ranks first in its search, and the files, which it lists under Open
// recent. See .claude/rules/main-menu.md.

// how many of each are kept
export const RECENT_COMMANDS = 20;
export const RECENT_FILES = 10;

/**
 * pushRecent returns `list` with `item` first, without an earlier one of the
 * `same` thing and at most `cap` long; the same list if `item` is first
 * already (`equal` to it), so a command used again and again stores nothing
 */
export const pushRecent = <T>(
  list: readonly T[],
  item: T,
  cap: number,
  same: (a: T, b: T) => boolean = Object.is,
  equal: (a: T, b: T) => boolean = same,
): readonly T[] => {
  if (list.length > 0 && equal(list[0], item)) return list;
  return [item, ...list.filter((other) => !same(other, item))].slice(0, cap);
};

// a command that ran, and whether its key ran it (rather than a click)
export interface RecentCommand {
  id: CommandIdentifier;
  byKey: boolean;
}

export const recentCommands = shallowRef<readonly RecentCommand[]>([]);

/**
 * recordCommand remembers that the command `id` ran, by its key or not (see
 * recorded in src/editor/commandRun.ts, which leaves some out)
 */
export const recordCommand = (id: CommandIdentifier, byKey: boolean) => {
  recentCommands.value = pushRecent(
    recentCommands.value,
    { id, byKey },
    RECENT_COMMANDS,
    (a, b) => a.id === b.id,
    (a, b) => a.id === b.id && a.byKey === b.byKey,
  );
};

// the files opened or saved, by their own paths (canonical: absolute, links
// followed)
export const recentFiles = shallowRef<readonly string[]>([]);

/**
 * rememberFile puts the file at `path` first in the recent files
 */
export const rememberFile = (path: string) => {
  recentFiles.value = pushRecent(recentFiles.value, path, RECENT_FILES);
};

/**
 * forgetFile takes the file at `path` out of the recent files, e.g. once it
 * turned out to be gone
 */
export const forgetFile = (path: string) => {
  if (recentFiles.value.includes(path))
    recentFiles.value = recentFiles.value.filter((file) => file !== path);
};

/**
 * cleanRecentCommands returns what of `stored` is a recent command of the
 * commands `known`, e.g. without one a newer version dropped
 */
export const cleanRecentCommands = (
  stored: unknown,
  known: ReadonlySet<string>,
): RecentCommand[] =>
  Array.isArray(stored)
    ? stored
        .filter(
          (entry): entry is RecentCommand =>
            typeof entry === "object" &&
            entry !== null &&
            known.has((entry as RecentCommand).id) &&
            typeof (entry as RecentCommand).byKey === "boolean",
        )
        .map(({ id, byKey }) => ({ id, byKey }))
        .slice(0, RECENT_COMMANDS)
    : [];

/**
 * cleanRecentFiles returns the paths of `stored`
 */
export const cleanRecentFiles = (stored: unknown): string[] =>
  Array.isArray(stored)
    ? stored
        .filter((path): path is string => typeof path === "string" && !!path)
        .slice(0, RECENT_FILES)
    : [];
