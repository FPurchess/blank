import { path } from "@tauri-apps/api";
import {
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { shallowRef } from "vue";

import {
  DEFAULT_PAGE,
  type PageSettings,
  pageSettingsJSON,
  readPageSettings,
} from "./layout/settings";
import type { Unit } from "./layout/units";

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
  INSERT_HORIZONTAL_RULE = "insert.horizontal_rule",
  INSERT_IMAGE = "insert.image",
  INSERT_TABLE = "insert.table",
  INSERT_PAGE_BREAK = "insert.page_break",
  FORMAT_INDENT = "format.indent",
  FORMAT_UNINDENT = "format.unindent",
  FORMAT_BOLD = "format.bold",
  FORMAT_ITALIC = "format.italic",
  FORMAT_CODE = "format.code",
  FORMAT_LINK = "format.link",
  FORMAT_BLOCKQUOTE = "format.blockquote",
  FILE_NEW = "file.new",
  FILE_SAVE = "file.save",
  FILE_SAVE_AS = "file.save_as",
  FILE_OPEN = "file.open",
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

export interface LayoutConfig {
  // the page setup of documents that don't have their own
  page: PageSettings;
}

export interface Config {
  keymap: { [key in CommandIdentifier]: string };
  autocorrect: AutocorrectConfig;
  spellcheck: SpellcheckConfig;
  editor: EditorConfig;
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
    [CommandIdentifier.INSERT_HORIZONTAL_RULE]: "Mod-h",
    [CommandIdentifier.INSERT_IMAGE]: "Mod-Alt-i",
    [CommandIdentifier.INSERT_TABLE]: "Mod-t",
    [CommandIdentifier.INSERT_PAGE_BREAK]: "Mod-Enter",
    [CommandIdentifier.FORMAT_INDENT]: "Tab",
    [CommandIdentifier.FORMAT_UNINDENT]: "Shift-Tab",
    [CommandIdentifier.FORMAT_BOLD]: "Mod-b",
    [CommandIdentifier.FORMAT_ITALIC]: "Mod-i",
    [CommandIdentifier.FORMAT_CODE]: "Mod-e",
    [CommandIdentifier.FORMAT_LINK]: "Mod-k",
    [CommandIdentifier.FORMAT_BLOCKQUOTE]: "Mod-g",
    [CommandIdentifier.FILE_NEW]: "Mod-n",
    [CommandIdentifier.FILE_SAVE]: "Mod-s",
    [CommandIdentifier.FILE_SAVE_AS]: "Mod-Shift-s",
    [CommandIdentifier.FILE_OPEN]: "Mod-o",
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
  layout: {
    page: DEFAULT_PAGE,
  },
};

// config is the loaded blank.json, over the defaults. It is replaced whole,
// never changed in place.
export const config = shallowRef<Config>(defaultConfig);

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
    console.error("config file is not an object", parsed);
  } catch (error) {
    console.error("failed to read config file", error);
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
  if (
    typeof size !== "number" ||
    !Number.isInteger(size) ||
    size < MIN_INDENT ||
    size > MAX_INDENT
  )
    problems.push("editor.indentSize");
  else editor.indentSize = size;
  return editor;
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
 * bootConfig initializes the config. Invalid settings are ignored with a
 * notification, so Blank still starts with the defaults.
 */
export const bootConfig = async () => {
  const userConfig = await getUserConfig();
  const problems: string[] = [];
  config.value = {
    ...defaultConfig,
    ...userConfig,
    // merge keymaps so a partial user keymap keeps the remaining defaults
    keymap: mergeKeymap(userConfig.keymap, problems),
    // merge autocorrect so a partial user config keeps the remaining defaults
    autocorrect: mergeAutocorrect(userConfig.autocorrect, problems),
    // merge spell check settings the same way
    spellcheck: mergeSpellcheck(userConfig.spellcheck, problems),
    editor: mergeEditor(userConfig.editor, problems),
    layout: mergeLayout(userConfig.layout, problems),
  };
  if (problems.length > 0) {
    console.warn("ignored invalid settings in blank.json", problems);
    sendNotification(
      `Ignored invalid settings in blank.json: ${problems.join(", ")}`,
    );
  }
};

/**
 * getKeyBinding returns the key binding for a command
 * @param command CommandIdentifier
 * @returns string
 */
export const getKeyBinding = (command: CommandIdentifier) =>
  config.value.keymap[command];

/**
 * saveDefaultPage makes `page` the page setup of documents that don't have
 * their own, in blank.json. The file's other settings stay as they are.
 * @param page the page setup
 * @param unit the unit to write lengths in
 * @throws if blank.json can't be read or written
 */
export const saveDefaultPage = async (page: PageSettings, unit: Unit) => {
  const configFile = await getConfigFile();
  let settings: Record<string, unknown> = {};
  if (await exists(configFile)) {
    const parsed: unknown = JSON.parse(await readTextFile(configFile));
    // overwriting would lose what the user wrote
    if (!isRecord(parsed)) throw new Error("blank.json holds no settings");
    settings = parsed;
  }
  const layout = isRecord(settings.layout) ? settings.layout : {};
  settings.layout = { ...layout, page: pageSettingsJSON(page, unit) };

  await mkdir(await path.appConfigDir(), { recursive: true });
  await writeTextFile(configFile, `${JSON.stringify(settings, null, 2)}\n`);
  config.value = {
    ...config.value,
    layout: { ...config.value.layout, page },
  };
};
