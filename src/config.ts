import { path } from "@tauri-apps/api";
import { exists, readTextFile } from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { Observable } from "observable.ts";

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

export interface Config {
  keymap: { [key in CommandIdentifier]: string };
  autocorrect: AutocorrectConfig;
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
};

// configInitialized is an observable that indicates whether the config has been initialized
export const configInitialized = new Observable<boolean>(false);

// config is an observable that contains the config
export const config = new Observable<Config>(defaultConfig);

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
 * mergeKeymap takes the user's bindings that are strings and keeps the
 * defaults for the rest
 */
const mergeKeymap = (user: unknown, problems: string[]): Config["keymap"] => {
  const keymap = { ...defaultConfig.keymap };
  if (user === undefined) return keymap;
  if (!isRecord(user)) {
    problems.push("keymap");
    return keymap;
  }
  for (const [command, binding] of Object.entries(user)) {
    if (typeof binding !== "string") {
      problems.push(`keymap.${command}`);
      continue;
    }
    keymap[command as CommandIdentifier] = binding;
  }
  return keymap;
};

/**
 * mergeAutocorrect takes the user's autocorrect settings whose type matches
 * the default and keeps the defaults for the rest
 */
const mergeAutocorrect = (
  user: unknown,
  problems: string[],
): AutocorrectConfig => {
  const defaults = defaultConfig.autocorrect;
  const autocorrect = { ...defaults };
  if (user !== undefined && !isRecord(user)) {
    problems.push("autocorrect");
    return autocorrect;
  }
  const settings = user ?? {};
  for (const [key, value] of Object.entries(settings)) {
    // unknown settings are unused, so they're simply skipped
    if (
      key === "replace" ||
      !Object.prototype.hasOwnProperty.call(defaults, key)
    )
      continue;
    const defaultValue = defaults[key as keyof AutocorrectConfig];
    if (typeof value !== typeof defaultValue) {
      problems.push(`autocorrect.${key}`);
      continue;
    }
    (autocorrect as Record<string, unknown>)[key] = value;
  }
  autocorrect.replace = mergeReplacements(
    defaults.replace,
    settings.replace,
    problems,
  );
  return autocorrect;
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
  };
  if (problems.length > 0) {
    console.warn("ignored invalid settings in blank.json", problems);
    sendNotification(
      `Ignored invalid settings in blank.json: ${problems.join(", ")}`,
    );
  }
  configInitialized.value = true;
};

/**
 * getKeyBinding returns the key binding for a command
 * @param command CommandIdentifier
 * @returns string
 */
export const getKeyBinding = (command: CommandIdentifier) =>
  config.value.keymap[command];
