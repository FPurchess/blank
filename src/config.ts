import { path } from "@tauri-apps/api";
import { exists, readTextFile } from "@tauri-apps/plugin-fs";
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
  FORMAT_BLOCKQUOTE = "format.blockquote",
  FILE_NEW = "file.new",
  FILE_SAVE = "file.save",
  FILE_SAVE_AS = "file.save_as",
  FILE_OPEN = "file.open",
  EXPORT_PDF = "export.pdf",
  THEME_CYCLE = "theme.cycle",
}

export interface Config {
  keymap: { [key in CommandIdentifier]: string };
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
    [CommandIdentifier.FORMAT_CODE]: "Mod-c",
    [CommandIdentifier.FORMAT_BLOCKQUOTE]: "Mod-g",
    [CommandIdentifier.FILE_NEW]: "Mod-n",
    [CommandIdentifier.FILE_SAVE]: "Mod-s",
    [CommandIdentifier.FILE_SAVE_AS]: "Mod-Shift-s",
    [CommandIdentifier.FILE_OPEN]: "Mod-o",
    [CommandIdentifier.EXPORT_PDF]: "Mod-Alt-p",
    [CommandIdentifier.THEME_CYCLE]: "Mod-Alt-t",
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
 * getUserConfig reads the user config from the config file
 * @returns user config
 */
const getUserConfig = async (): Promise<Partial<Config>> => {
  const configFile = await getConfigFile();
  try {
    if (!(await exists(configFile))) return {};
  } catch (error) {
    console.warn("failed to check for config file", error);
    return {};
  }

  try {
    return JSON.parse(await readTextFile(configFile));
  } catch (error) {
    console.error("failed to read config file", error);
  }
  return {};
};

/**
 * bootConfig initializes the config
 */
export const bootConfig = async () => {
  config.value = { ...defaultConfig, ...(await getUserConfig()) };
  configInitialized.value = true;
};

/**
 * getKeyBinding returns the key binding for a command
 * @param command CommandIdentifier
 * @returns string
 */
export const getKeyBinding = (command: CommandIdentifier) =>
  config.value.keymap[command];
