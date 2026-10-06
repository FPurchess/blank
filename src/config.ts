import { path } from "@tauri-apps/api";
import {
  exists,
  mkdir,
  readTextFile,
  rename,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { shallowRef } from "vue";

import { errorMessage } from "./errors";
import { sameBinding } from "./keyNames";

import {
  DEFAULT_PAGE,
  type PageSettings,
  pageSettingsJSON,
  readPageSettings,
} from "./layout/settings";
import type { Unit } from "./layout/units";

/**
 * configError is what the log says of an error reading blank.json: JSON's
 * own message quotes what it couldn't read, which may be a header's text
 */
const configError = (error: unknown) =>
  error instanceof SyntaxError ? "it isn't valid JSON" : error;

export enum CommandIdentifier {
  UNDO = "undo",
  REDO = "redo",
  BLOCKTYPE_PARAGRAPH = "blocktype.paragraph",
  BLOCKTYPE_HEADING1 = "blocktype.heading1",
  BLOCKTYPE_HEADING2 = "blocktype.heading2",
  BLOCKTYPE_HEADING3 = "blocktype.heading3",
  BLOCKTYPE_HEADING4 = "blocktype.heading4",
  BLOCKTYPE_HEADING5 = "blocktype.heading5",
  BLOCKTYPE_HEADING6 = "blocktype.heading6",
  BLOCKTYPE_BULLET_LIST = "blocktype.bullet_list",
  BLOCKTYPE_ORDERED_LIST = "blocktype.ordered_list",
  BLOCKTYPE_CODE_BLOCK = "blocktype.code_block",
  INSERT_HORIZONTAL_RULE = "insert.horizontal_rule",
  INSERT_IMAGE = "insert.image",
  INSERT_TABLE = "insert.table",
  INSERT_PAGE_BREAK = "insert.page_break",
  INSERT_BLOCK = "insert.block",
  FORMAT_INDENT = "format.indent",
  FORMAT_UNINDENT = "format.unindent",
  FORMAT_BOLD = "format.bold",
  FORMAT_ITALIC = "format.italic",
  FORMAT_UNDERLINE = "format.underline",
  FORMAT_CODE = "format.code",
  FORMAT_LINK = "format.link",
  FORMAT_BLOCKQUOTE = "format.blockquote",
  FORMAT_ALIGN_LEFT = "format.align_left",
  FORMAT_ALIGN_CENTER = "format.align_center",
  FORMAT_ALIGN_RIGHT = "format.align_right",
  FORMAT_ALIGN_JUSTIFY = "format.align_justify",
  FILE_NEW = "file.new",
  FILE_SAVE = "file.save",
  FILE_SAVE_AS = "file.save_as",
  FILE_OPEN = "file.open",
  FILE_PRINT = "file.print",
  TAB_CLOSE = "tab.close",
  TAB_NEXT = "tab.next",
  TAB_PREVIOUS = "tab.previous",
  TAB_REOPEN = "tab.reopen",
  TAB_MOVE_LEFT = "tab.move_left",
  TAB_MOVE_RIGHT = "tab.move_right",
  EXPORT_PDF = "export.pdf",
  EXPORT_DOCX = "export.docx",
  THEME_CYCLE = "theme.cycle",
  LANGUAGE_CHOOSE = "language.choose",
  SPELLCHECK_TOGGLE = "spellcheck.toggle",
  SPELLCHECK_NEXT = "spellcheck.next",
  SPELLCHECK_PREVIOUS = "spellcheck.previous",
  CONTEXT_MENU = "menu.context",
  PAGE_SETUP = "page.setup",
  EDIT_HEADER = "edit.header",
  EDIT_FOOTER = "edit.footer",
  VIEW_PAGES = "view.pages",
  VIEW_OUTLINE = "view.outline",
  VIEW_FOCUS_NEXT = "view.focus_next",
  VIEW_FOCUS_PREVIOUS = "view.focus_previous",
  VIEW_TOOLBAR_FOCUS = "view.toolbar_focus",
  VIEW_FOCUS_MODE = "view.focus",
  TOOLS_STATS = "tools.stats",
  APP_SETTINGS = "app.settings",
  VIEW_BLOCKS = "view.blocks",
  APP_SHORTCUTS = "app.shortcuts",
  APP_GUIDE = "app.guide",
  APP_ABOUT = "app.about",
  FILE_CLEAR_RECENT = "file.clear_recent",
}

// Replacements typed text → replacement, keyed by ISO 639-1 language code.
// "*" holds the replacements for every language.
export type Replacements = { [language: string]: { [key: string]: string } };

export interface AutocorrectConfig {
  arrows: boolean;
  dashes: boolean;
  symbols: boolean;
  formatting: boolean;
  links: boolean;
  quotes: boolean;
  capitalize: boolean;
  blocks: boolean;
  replace: Replacements;
}

export interface SpellcheckConfig {
  // leave words in ALL CAPS alone, e.g. acronyms
  ignoreUppercase: boolean;
  // leave words with digits alone, e.g. "B2B" or "mp3"
  ignoreWordsWithNumbers: boolean;
}

export interface EditorConfig {
  // the spaces Tab and Shift-Tab indent and outdent the lines of a code block
  // by, and how wide a tab is there
  indentSize: number;
}

// the indent sizes blank.json may set
export const MIN_INDENT = 1;
export const MAX_INDENT = 16;

export interface FocusModeConfig {
  // the seconds the pointer rests before the controls fade in focus mode; 0
  // fades them only when typing
  hideAfter: number;
}

// the rest times blank.json may set
const MIN_HIDE_AFTER = 0;
const MAX_HIDE_AFTER = 60;

export interface LayoutConfig {
  // the page setup of documents that don't have their own
  page: PageSettings;
}

export interface Config {
  keymap: { [key in CommandIdentifier]: string };
  autocorrect: AutocorrectConfig;
  spellcheck: SpellcheckConfig;
  editor: EditorConfig;
  focusMode: FocusModeConfig;
  layout: LayoutConfig;
}

const defaultConfig: Config = {
  keymap: {
    [CommandIdentifier.UNDO]: "Mod-z",
    [CommandIdentifier.REDO]: "Mod-Shift-z",
    [CommandIdentifier.BLOCKTYPE_PARAGRAPH]: "Mod-0",
    [CommandIdentifier.BLOCKTYPE_HEADING1]: "Mod-1",
    [CommandIdentifier.BLOCKTYPE_HEADING2]: "Mod-2",
    [CommandIdentifier.BLOCKTYPE_HEADING3]: "Mod-3",
    [CommandIdentifier.BLOCKTYPE_HEADING4]: "Mod-4",
    [CommandIdentifier.BLOCKTYPE_HEADING5]: "Mod-5",
    [CommandIdentifier.BLOCKTYPE_HEADING6]: "Mod-6",
    [CommandIdentifier.BLOCKTYPE_BULLET_LIST]: "Mod-8",
    [CommandIdentifier.BLOCKTYPE_ORDERED_LIST]: "Mod-9",
    // no key of its own: from the toolbar's style menu, or one set in
    // blank.json
    [CommandIdentifier.BLOCKTYPE_CODE_BLOCK]: "",
    [CommandIdentifier.INSERT_HORIZONTAL_RULE]: "Mod-h",
    [CommandIdentifier.INSERT_IMAGE]: "Mod-Alt-i",
    [CommandIdentifier.INSERT_TABLE]: "Mod-t",
    [CommandIdentifier.INSERT_PAGE_BREAK]: "Mod-Enter",
    [CommandIdentifier.INSERT_BLOCK]: "Mod-Alt-b",
    [CommandIdentifier.FORMAT_INDENT]: "Tab",
    [CommandIdentifier.FORMAT_UNINDENT]: "Shift-Tab",
    [CommandIdentifier.FORMAT_BOLD]: "Mod-b",
    [CommandIdentifier.FORMAT_ITALIC]: "Mod-i",
    [CommandIdentifier.FORMAT_UNDERLINE]: "Mod-u",
    [CommandIdentifier.FORMAT_CODE]: "Mod-e",
    [CommandIdentifier.FORMAT_LINK]: "Mod-Alt-k",
    [CommandIdentifier.FORMAT_BLOCKQUOTE]: "Mod-g",
    [CommandIdentifier.FORMAT_ALIGN_LEFT]: "Mod-Shift-l",
    [CommandIdentifier.FORMAT_ALIGN_CENTER]: "Mod-Shift-e",
    [CommandIdentifier.FORMAT_ALIGN_RIGHT]: "Mod-Shift-r",
    [CommandIdentifier.FORMAT_ALIGN_JUSTIFY]: "Mod-Shift-j",
    [CommandIdentifier.FILE_NEW]: "Mod-n",
    [CommandIdentifier.FILE_SAVE]: "Mod-s",
    [CommandIdentifier.FILE_SAVE_AS]: "Mod-Shift-s",
    [CommandIdentifier.FILE_OPEN]: "Mod-o",
    [CommandIdentifier.FILE_PRINT]: "Mod-p",
    [CommandIdentifier.TAB_CLOSE]: "Mod-w",
    [CommandIdentifier.TAB_NEXT]: "Ctrl-Tab",
    [CommandIdentifier.TAB_PREVIOUS]: "Ctrl-Shift-Tab",
    [CommandIdentifier.TAB_REOPEN]: "Mod-Shift-t",
    [CommandIdentifier.TAB_MOVE_LEFT]: "Ctrl-Shift-PageUp",
    [CommandIdentifier.TAB_MOVE_RIGHT]: "Ctrl-Shift-PageDown",
    [CommandIdentifier.EXPORT_PDF]: "Mod-Alt-p",
    [CommandIdentifier.EXPORT_DOCX]: "Mod-Alt-w",
    [CommandIdentifier.THEME_CYCLE]: "Mod-Alt-t",
    [CommandIdentifier.LANGUAGE_CHOOSE]: "Mod-Alt-l",
    [CommandIdentifier.SPELLCHECK_TOGGLE]: "Mod-Alt-s",
    [CommandIdentifier.SPELLCHECK_NEXT]: "Mod-Alt-n",
    [CommandIdentifier.SPELLCHECK_PREVIOUS]: "Mod-Alt-Shift-n",
    [CommandIdentifier.CONTEXT_MENU]: "Shift-F10",
    [CommandIdentifier.PAGE_SETUP]: "Mod-Alt-u",
    [CommandIdentifier.EDIT_HEADER]: "Mod-Alt-h",
    [CommandIdentifier.EDIT_FOOTER]: "Mod-Alt-f",
    [CommandIdentifier.VIEW_PAGES]: "Mod-Alt-v",
    [CommandIdentifier.VIEW_OUTLINE]: "Mod-Alt-o",
    [CommandIdentifier.VIEW_FOCUS_NEXT]: "F6",
    [CommandIdentifier.VIEW_FOCUS_PREVIOUS]: "Shift-F6",
    [CommandIdentifier.VIEW_TOOLBAR_FOCUS]: "Alt-F10",
    [CommandIdentifier.VIEW_FOCUS_MODE]: "Mod-Shift-f",
    [CommandIdentifier.TOOLS_STATS]: "Mod-Alt-c",
    [CommandIdentifier.APP_SETTINGS]: "Mod-,",
    // no keys of their own: from the main menu, or ones set in blank.json
    [CommandIdentifier.VIEW_BLOCKS]: "",
    [CommandIdentifier.APP_SHORTCUTS]: "",
    [CommandIdentifier.APP_GUIDE]: "",
    [CommandIdentifier.APP_ABOUT]: "",
    [CommandIdentifier.FILE_CLEAR_RECENT]: "",
  },
  autocorrect: {
    arrows: true,
    dashes: true,
    symbols: true,
    formatting: true,
    links: true,
    quotes: true,
    capitalize: true,
    blocks: true,
    replace: { "*": {} },
  },
  spellcheck: {
    ignoreUppercase: true,
    ignoreWordsWithNumbers: true,
  },
  editor: {
    indentSize: 4,
  },
  focusMode: {
    hideAfter: 3,
  },
  layout: {
    page: DEFAULT_PAGE,
  },
};

// config is the loaded blank.json, over the defaults. It is replaced whole,
// never changed in place.
export const config = shallowRef<Config>(defaultConfig);

// the defaults, e.g. for what a reset in the settings goes back to
export const defaults: Readonly<Config> = defaultConfig;

const configName = "blank.json";

/**
 * getConfigFile returns the path to the config file
 * @returns path to the config file
 */
const getConfigFile = async () =>
  await path.join(await path.appConfigDir(), configName);

/**
 * isRecord tells whether `value` is a plain object, i.e. not null, an array or
 * a primitive
 */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * isStringRecord tells whether `value` is an object with only string values
 */
const isStringRecord = (value: unknown): value is Record<string, string> =>
  isRecord(value) && Object.values(value).every((v) => typeof v === "string");

/**
 * mergeReplacements merges the user's replacements into the defaults per
 * language, so a user list for one language keeps the others. Invalid entries
 * are skipped and reported in `problems`.
 */
const mergeReplacements = (
  defaults: Replacements,
  user: unknown,
  problems: string[],
): Replacements => {
  const merged: Replacements = { ...defaults };
  if (user === undefined) return merged;
  if (!isRecord(user)) {
    problems.push("autocorrect.replace");
    return merged;
  }
  for (const [language, replacements] of Object.entries(user)) {
    // JSON.parse creates "__proto__" as an own key, which would replace the
    // prototype of `merged` when assigned
    if (language === "__proto__" || !isStringRecord(replacements)) {
      problems.push(`autocorrect.replace.${language}`);
      continue;
    }
    merged[language] = { ...merged[language], ...replacements };
  }
  return merged;
};

/**
 * getUserConfig reads the user config from the config file
 * @returns user config, or an empty object if there is none or it isn't one
 */
const getUserConfig = async (): Promise<Record<string, unknown>> => {
  const configFile = await getConfigFile();
  try {
    if (!(await exists(configFile))) return {};
  } catch (error) {
    console.warn("failed to check for config file", error);
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(await readTextFile(configFile));
    if (isRecord(parsed)) return parsed;
    console.error(`blank.json holds ${typeof parsed}, not settings`);
  } catch (error) {
    console.error("failed to read blank.json", configError(error));
  }
  return {};
};

/**
 * mergeKeymap takes the user's bindings of known commands that are strings
 * and keeps the defaults for the rest
 */
const mergeKeymap = (user: unknown, problems: string[]): Config["keymap"] => {
  const keymap = { ...defaultConfig.keymap };
  if (user === undefined) return keymap;
  if (!isRecord(user)) {
    problems.push("keymap");
    return keymap;
  }
  for (const [command, binding] of Object.entries(user)) {
    // a command Blank doesn't know, e.g. a typo, would bind nothing; own
    // keys only, since JSON.parse makes "__proto__" one
    if (
      typeof binding !== "string" ||
      !Object.hasOwn(defaultConfig.keymap, command)
    ) {
      problems.push(`keymap.${command}`);
      continue;
    }
    keymap[command as CommandIdentifier] = binding;
  }
  return keymap;
};

/**
 * mergeFlat takes the user's settings of a section whose type matches the
 * default and keeps the defaults for the rest. Settings it doesn't know are
 * unused, so they're simply skipped; `skip` lists those the caller merges.
 * @param name the section, for the problems
 */
const mergeFlat = <T extends object>(
  name: string,
  defaults: T,
  user: unknown,
  problems: string[],
  skip: readonly string[] = [],
): T => {
  const merged = { ...defaults };
  if (user === undefined) return merged;
  if (!isRecord(user)) {
    problems.push(name);
    return merged;
  }
  for (const [key, value] of Object.entries(user)) {
    if (skip.includes(key) || !Object.hasOwn(defaults, key)) continue;
    if (typeof value !== typeof (defaults as Record<string, unknown>)[key]) {
      problems.push(`${name}.${key}`);
      continue;
    }
    (merged as Record<string, unknown>)[key] = value;
  }
  return merged;
};

/**
 * mergeAutocorrect takes the user's autocorrect settings whose type matches
 * the default and keeps the defaults for the rest, and merges the user's
 * replacements into the defaults
 */
const mergeAutocorrect = (
  user: unknown,
  problems: string[],
): AutocorrectConfig => {
  const defaults = defaultConfig.autocorrect;
  const autocorrect = mergeFlat("autocorrect", defaults, user, problems, [
    "replace",
  ]);
  // a section that isn't an object keeps the default replacements
  if (user === undefined || isRecord(user)) {
    autocorrect.replace = mergeReplacements(
      defaults.replace,
      isRecord(user) ? user.replace : undefined,
      problems,
    );
  }
  return autocorrect;
};

/**
 * mergeSpellcheck takes the user's spell check settings whose type matches the
 * default and keeps the defaults for the rest
 */
const mergeSpellcheck = (user: unknown, problems: string[]) =>
  mergeFlat("spellcheck", defaultConfig.spellcheck, user, problems);

/**
 * wholeNumberIn tells whether `value` is a whole number from `min` to `max`,
 * e.g. an indent size
 */
export const wholeNumberIn = (
  value: unknown,
  min: number,
  max: number,
): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= min &&
  value <= max;

/**
 * mergeEditor takes the user's editor settings that are valid and keeps the
 * defaults for the rest: the indent size is a whole number of spaces from
 * MIN_INDENT to MAX_INDENT
 */
const mergeEditor = (user: unknown, problems: string[]): EditorConfig => {
  const editor = { ...defaultConfig.editor };
  if (user === undefined) return editor;
  if (!isRecord(user)) {
    problems.push("editor");
    return editor;
  }
  const size = user.indentSize;
  if (size === undefined) return editor;
  if (wholeNumberIn(size, MIN_INDENT, MAX_INDENT)) editor.indentSize = size;
  else problems.push("editor.indentSize");
  return editor;
};

/**
 * mergeFocusMode takes the user's focus mode settings that are valid and
 * keeps the defaults for the rest: the rest time is a whole number of seconds
 * from MIN_HIDE_AFTER to MAX_HIDE_AFTER
 */
const mergeFocusMode = (user: unknown, problems: string[]): FocusModeConfig => {
  const focusMode = { ...defaultConfig.focusMode };
  if (user === undefined) return focusMode;
  if (!isRecord(user)) {
    problems.push("focusMode");
    return focusMode;
  }
  const seconds = user.hideAfter;
  if (seconds === undefined) return focusMode;
  if (wholeNumberIn(seconds, MIN_HIDE_AFTER, MAX_HIDE_AFTER))
    focusMode.hideAfter = seconds;
  else problems.push("focusMode.hideAfter");
  return focusMode;
};

/**
 * mergeLayout reads the user's page setup over Blank's, like the frontmatter
 * of a document over the user's, see src/layout/resolve.ts
 */
const mergeLayout = (user: unknown, problems: string[]): LayoutConfig => {
  if (user === undefined) return defaultConfig.layout;
  if (!isRecord(user)) {
    problems.push("layout");
    return defaultConfig.layout;
  }
  return {
    page: readPageSettings(
      user.page,
      defaultConfig.layout.page,
      problems,
      "layout.page",
    ),
  };
};

/**
 * mergeConfig reads the settings of blank.json, `user`, over the defaults.
 * Invalid settings keep their default and are listed in `problems`.
 */
const mergeConfig = (user: Record<string, unknown>) => {
  const problems: string[] = [];
  const merged: Config = {
    ...defaultConfig,
    ...user,
    // merge keymaps so a partial user keymap keeps the remaining defaults
    keymap: mergeKeymap(user.keymap, problems),
    // merge autocorrect so a partial user config keeps the remaining defaults
    autocorrect: mergeAutocorrect(user.autocorrect, problems),
    // merge spell check settings the same way
    spellcheck: mergeSpellcheck(user.spellcheck, problems),
    editor: mergeEditor(user.editor, problems),
    focusMode: mergeFocusMode(user.focusMode, problems),
    layout: mergeLayout(user.layout, problems),
  };
  return { config: merged, problems };
};

/**
 * reportProblems tells the user which settings of blank.json can't be used
 */
const reportProblems = (problems: string[]) => {
  if (problems.length === 0) return;
  console.warn("ignored invalid settings in blank.json", problems);
  sendNotification(
    `Ignored invalid settings in blank.json: ${problems.join(", ")}`,
  );
};

/**
 * bootConfig initializes the config. Invalid settings are ignored with a
 * notification, so Blank still starts with the defaults.
 */
export const bootConfig = async () => {
  const { config: merged, problems } = mergeConfig(await getUserConfig());
  config.value = merged;
  reportProblems(problems);
};

/**
 * getKeyBinding returns the key binding for a command
 * @param command CommandIdentifier
 * @returns string
 */
export const getKeyBinding = (command: CommandIdentifier) =>
  config.value.keymap[command];

/**
 * deepEqual tells whether two values read from JSON are the same
 */
const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
  if (!isRecord(a) || !isRecord(b)) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && deepEqual(a[key], b[key]))
  );
};

/**
 * keepUnchanged returns `next` with the sections that equal those of
 * `previous` taken from it, so what follows a section, e.g. the page layout
 * or the keymap, only runs again when that section changed
 */
const keepUnchanged = (previous: Config, next: Config): Config => {
  const kept: Record<string, unknown> = { ...next };
  for (const key of Object.keys(next) as (keyof Config)[])
    if (deepEqual(previous[key], next[key])) kept[key] = previous[key];
  return kept as unknown as Config;
};

// A change of blank.json: the setting at `path`, e.g. ["autocorrect",
// "dashes"], set to `value`, or back to its default without one
export interface SettingChange {
  path: readonly string[];
  value?: unknown;
}

/**
 * defaultAt returns the default of the setting at `path`, or undefined for
 * one without a default, e.g. the replacements of a language
 */
const defaultAt = (path: readonly string[]): unknown =>
  path.reduce<unknown>(
    (value, key) =>
      isRecord(value) && Object.hasOwn(value, key) ? value[key] : undefined,
    defaultConfig,
  );

/**
 * isDefault tells whether `value` is what the setting at `path` is without
 * it, so blank.json can leave it out: a key binding that is the default key,
 * however it's written, or a value that equals the default
 */
const isDefault = (path: readonly string[], value: unknown) => {
  const fallback = defaultAt(path);
  if (path[0] === "keymap" && path.length === 2)
    return (
      typeof value === "string" &&
      typeof fallback === "string" &&
      (value === fallback || sameBinding(value, fallback))
    );
  return deepEqual(value, fallback);
};

/**
 * applyChange sets the setting at `path` in `settings`, the parsed
 * blank.json, or removes it when it's the default. Objects that are left
 * empty go too: every setting reads an empty object like a missing one.
 */
const applyChange = (
  settings: Record<string, unknown>,
  { path, value }: SettingChange,
) => {
  // JSON.parse makes "__proto__" an own key, but assigning it would replace
  // the prototype
  if (path.length === 0 || path.includes("__proto__")) return;
  const parents = [settings];
  for (const key of path.slice(0, -1)) {
    const parent = parents[parents.length - 1];
    // a value that isn't an object there was invalid and ignored anyway
    if (!isRecord(parent[key])) parent[key] = {};
    parents.push(parent[key] as Record<string, unknown>);
  }
  const last = path[path.length - 1];
  const target = parents[parents.length - 1];
  const empty = isRecord(value) && Object.keys(value).length === 0;
  if (value === undefined || empty || isDefault(path, value))
    delete target[last];
  else target[last] = value;
  for (let i = parents.length - 1; i > 0; i--)
    if (Object.keys(parents[i]).length === 0)
      delete parents[i - 1][path[i - 1]];
};

// the changes to make, or a function that returns them from what blank.json
// holds, for a change that builds on it (e.g. adding to a list)
export type SettingChanges =
  SettingChange[] | ((settings: Record<string, unknown>) => SettingChange[]);

/**
 * writeSettings makes `changes` in blank.json, see saveSettings
 * @returns what went wrong, or undefined once they are saved
 */
const writeSettings = async (
  changes: SettingChanges,
): Promise<string | undefined> => {
  const configFile = await getConfigFile();
  let settings: unknown = {};
  try {
    if (await exists(configFile))
      settings = JSON.parse(await readTextFile(configFile));
  } catch (error) {
    console.error("failed to read blank.json", configError(error));
    return "Blank couldn't read blank.json, so it left the file as it is";
  }
  // overwriting would lose what the user wrote
  if (!isRecord(settings))
    return "blank.json holds no settings, so Blank left it as it is";

  for (const change of typeof changes === "function"
    ? changes(settings)
    : changes)
    applyChange(settings, change);

  await mkdir(await path.appConfigDir(), { recursive: true });
  // a new file renamed over the old one, so an interrupted write never leaves
  // half of it
  await writeTextFile(
    `${configFile}.tmp`,
    `${JSON.stringify(settings, null, 2)}\n`,
  );
  await rename(`${configFile}.tmp`, configFile);

  // what was written by hand since the start applies now too
  const { config: merged, problems } = mergeConfig(settings);
  reportProblems(problems);
  config.value = keepUnchanged(config.value, merged);
};

// the writes of blank.json, one after the other, so fast changes can't
// interleave
let writes: Promise<unknown> = Promise.resolve();

/**
 * write queues `changes` after the writes before
 * @returns what went wrong, or undefined once they are saved
 */
const write = (changes: SettingChanges) => {
  const written = writes
    .then(() => writeSettings(changes))
    .catch((error: unknown) => {
      console.error("failed to save blank.json", error);
      return `Blank couldn't save blank.json: ${errorMessage(error)}`;
    });
  writes = written;
  return written;
};

/**
 * saveSettings makes `changes` in blank.json and applies them at once. The
 * file's other settings stay as they are, and a setting that is the default
 * is left out, so the file keeps only what the user changed. A file that
 * isn't a JSON object is left as it is. What goes wrong is told in a
 * notification.
 * @returns whether the settings were saved
 */
export const saveSettings = async (changes: SettingChanges) => {
  const failure = await write(changes);
  if (failure) sendNotification(failure);
  return failure === undefined;
};

/**
 * saveDefaultPage makes `page` the page setup of documents that don't have
 * their own, in blank.json. The file's other settings stay as they are.
 * @param page the page setup
 * @param unit the unit to write lengths in
 * @throws if blank.json can't be read or written, with what went wrong
 */
export const saveDefaultPage = async (page: PageSettings, unit: Unit) => {
  const failure = await write([
    { path: ["layout", "page"], value: pageSettingsJSON(page, unit) },
  ]);
  if (failure) throw new Error(failure);
};
