import { commandInfo } from "../commandList";
import { rankCommands } from "../commandSearch";
import { CommandIdentifier as C, getKeyBinding } from "../config";
import { basename, dirname } from "../paths";
import {
  type MenuItem,
  type MenuLine,
  type MenuSearch,
  type RecentCommand,
  type ThemeName,
  themeLabel,
  themes,
  ZOOM_NEEDS_PAGES,
} from "../state";
import type { MenuEntry } from "./menuModel";

// The main menu behind the logo (LogoButton.vue): what it lists, and what
// its search finds. See .claude/rules/main-menu.md.

// how many recently used commands it lists
const RECENT_SHOWN = 3;

// the File section, top to bottom: "recent" is Open recent ▸ and "export"
// Export ▸. Print joins it after Export once it's there.
export const FILE_COMMANDS = [
  C.FILE_NEW,
  C.FILE_OPEN,
  "recent",
  C.FILE_SAVE,
  C.FILE_SAVE_AS,
  "export",
] as const;

const EDIT_ROW = [C.UNDO, C.REDO, C.EDIT_FIND] as const;
const VIEW_ROW = [
  C.VIEW_BLOCKS,
  C.VIEW_OUTLINE,
  C.VIEW_PAGES,
  C.VIEW_FOCUS_MODE,
] as const;
const ZOOM_COMMANDS: ReadonlySet<C> = new Set([
  C.VIEW_ZOOM_OUT,
  C.VIEW_ZOOM_FIT,
  C.VIEW_ZOOM_IN,
]);
const APP_COMMANDS = [
  C.APP_SETTINGS,
  C.APP_SHORTCUTS,
  C.APP_GUIDE,
  C.APP_ABOUT,
] as const;
const EXPORTS = [C.EXPORT_PDF, C.EXPORT_DOCX] as const;

// the commands the menu shows anyway, which Recent leaves out
export const MENU_SHOWN: ReadonlySet<C> = new Set<C>([
  ...FILE_COMMANDS.filter((id) => id !== "recent" && id !== "export"),
  ...EXPORTS,
  ...EDIT_ROW,
  ...VIEW_ROW,
  ...ZOOM_COMMANDS,
  ...APP_COMMANDS,
]);

// the groups whose commands are typing, more than choosing: Recent leaves
// them out when their key ran them
const TYPING_GROUPS: ReadonlySet<string> = new Set(["Edit", "Format", "Tabs"]);

// what the search never offers: the menu itself, the context menu, and
// clearing the recent files, which only Open recent offers
export const MAIN_MENU_UNSEARCHED: ReadonlySet<C> = new Set([
  C.MENU_MAIN,
  C.CONTEXT_MENU,
  C.FILE_CLEAR_RECENT,
]);

// what the menu reads and does, from the window as it is
export interface MainMenuDeps {
  // whether a command can run now
  can(id: C): boolean;
  // runs a command; `stays` for one the menu stays open for
  run(id: C, stays: boolean): void;
  recent: readonly RecentCommand[];
  files: readonly string[];
  openFile(path: string): void;
  // the zoom as it shows, and whether there are pages to zoom
  zoom: string;
  pages: boolean;
  theme: ThemeName;
  chooseTheme(name: ThemeName): void;
  // which of the view's switches are on
  on: Partial<Record<C, boolean>>;
}

/**
 * recentForMenu returns the commands Recent lists: the ones used last that
 * can run now, without those the menu shows anyway and typing done by key
 */
export const recentForMenu = (
  recent: readonly RecentCommand[],
  can: (id: C) => boolean,
) =>
  recent
    .filter(
      ({ id, byKey }) =>
        !MENU_SHOWN.has(id) &&
        !MAIN_MENU_UNSEARCHED.has(id) &&
        !(byKey && TYPING_GROUPS.has(commandInfo(id).group)) &&
        can(id),
    )
    .map(({ id }) => id)
    .slice(0, RECENT_SHOWN);

/**
 * commandEntry returns the item of a command, with its label, icon and key,
 * disabled where it can't run now
 */
const commandEntry = (
  deps: MainMenuDeps,
  id: C,
  item: Partial<MenuEntry> = {},
): MenuEntry => {
  const info = commandInfo(id);
  const stays = item.stays ?? false;
  const zoom = ZOOM_COMMANDS.has(id) && !deps.pages;
  return {
    id,
    label: info.label,
    icon: info.icon,
    shortcut: getKeyBinding(id) || undefined,
    command: id,
    disabled: zoom || !deps.can(id),
    ...(zoom && { tip: ZOOM_NEEDS_PAGES }),
    run: () => deps.run(id, stays),
    ...item,
  };
};

/**
 * recentFilesItems returns the items of Open recent: one per file, its
 * folder after its name, and Clear list; or that there are none
 */
const recentFilesItems = (deps: MainMenuDeps): MenuItem[] =>
  deps.files.length === 0
    ? [{ id: "recent:none", label: "No recent files", disabled: true }]
    : [
        ...deps.files.map((path): MenuItem => ({
          id: `recent:${path}`,
          label: basename(path),
          detail: dirname(path),
          run: () => deps.openFile(path),
        })),
        "separator",
        commandEntry(deps, C.FILE_CLEAR_RECENT, {
          label: "Clear list",
          icon: undefined,
        }),
      ];

/**
 * fileItem returns the item of the File section `id` stands for
 */
const fileItem = (
  deps: MainMenuDeps,
  id: (typeof FILE_COMMANDS)[number],
): MenuEntry => {
  if (id === "recent")
    return {
      id: "file.recent",
      label: "Open recent",
      icon: "clock",
      children: recentFilesItems(deps),
    };
  if (id === "export")
    return {
      id: "file.export",
      label: "Export",
      icon: "export",
      children: EXPORTS.map((command) => commandEntry(deps, command)),
    };
  return commandEntry(deps, id);
};

/**
 * mainMenuItems returns what the main menu lists, top to bottom: Recent,
 * File, rows of Edit, View, Zoom and Theme, and Blank's settings and help
 */
export const mainMenuItems = (deps: MainMenuDeps): MenuLine[] => {
  const recent = recentForMenu(deps.recent, deps.can);
  // a switch in a row: its icon, on or off, the menu staying open
  const toggle = (id: C) =>
    commandEntry(deps, id, { checked: !!deps.on[id], stays: true });
  return [
    ...(recent.length > 0
      ? [
          { kind: "head" as const, label: "Recent", shown: true },
          ...recent.map((id) => commandEntry(deps, id)),
          "separator" as const,
        ]
      : []),
    { kind: "head", label: "File", shown: false },
    ...FILE_COMMANDS.map((id) => fileItem(deps, id)),
    "separator",
    {
      kind: "row",
      id: "row:edit",
      label: "Edit",
      items: EDIT_ROW.map((id) => commandEntry(deps, id)),
    },
    "separator",
    { kind: "row", id: "row:view", label: "View", items: VIEW_ROW.map(toggle) },
    {
      kind: "row",
      id: "row:zoom",
      label: "Zoom",
      items: [
        commandEntry(deps, C.VIEW_ZOOM_OUT, { stays: true }),
        commandEntry(deps, C.VIEW_ZOOM_FIT, {
          label: deps.zoom,
          icon: undefined,
          look: "value",
          stays: true,
        }),
        commandEntry(deps, C.VIEW_ZOOM_IN, { stays: true }),
      ],
    },
    {
      kind: "row",
      id: "row:theme",
      label: "Theme",
      items: themes.map((name) => ({
        id: `theme:${name}`,
        label: themeLabel(name),
        swatch: name,
        radio: true,
        checked: name === deps.theme,
        stays: true,
        run: () => deps.chooseTheme(name),
      })),
    },
    "separator",
    { kind: "head", label: "Blank", shown: false },
    ...APP_COMMANDS.map((id) => commandEntry(deps, id)),
  ];
};

/**
 * mainMenuSearch returns the main menu's search: the commands it finds, as
 * items with the part that matched marked, their group and key, the ones
 * used last first
 */
export const mainMenuSearch = (deps: MainMenuDeps): MenuSearch => ({
  results: (query) =>
    rankCommands(
      query,
      deps.recent.map(({ id }) => id),
      MAIN_MENU_UNSEARCHED,
    ).map(({ info, match }) =>
      commandEntry(deps, info.id, {
        detail: info.group,
        ...(match && { match }),
      }),
    ),
  empty: (query) =>
    `No command for “${query.trim()}”. Try “pdf”, “table” or “theme”.`,
});
