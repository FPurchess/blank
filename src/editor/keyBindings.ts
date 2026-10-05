import { keydownHandler } from "prosemirror-keymap";
import type { Command } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

import {
  type Config,
  CommandIdentifier,
  config,
  getKeyBinding,
} from "../config";
import { canonicalBinding, normalizeBinding, splitBinding } from "../keyNames";
import { isMac } from "../platform";

/**
 * commandBinding returns the key bound to `command`, normalized for
 * prosemirror-keymap, for code that handles the key itself (e.g. the table
 * keys, which insert a table and switch table mode on and off)
 */
export const commandBinding = (command: CommandIdentifier) =>
  normalizeBinding(getKeyBinding(command));

// a handler of keydown events, as prosemirror-keymap's keydownHandler returns
type KeyHandler = (view: EditorView, event: KeyboardEvent) => boolean;

/**
 * liveKeys returns a keydown handler for the bindings `build` returns from
 * the keymap. It builds them again whenever the keymap changed (a change in
 * the settings replaces it), so the keys follow blank.json without a
 * restart; read the bindings in `build`, never before.
 */
export const liveKeys = (build: () => Record<string, Command>): KeyHandler => {
  let builtFor: Config["keymap"] | undefined;
  let handler: KeyHandler = () => false;
  return (view, event) => {
    if (config.value.keymap !== builtFor) {
      builtFor = config.value.keymap;
      handler = keydownHandler(build());
    }
    return handler(view, event);
  };
};

/**
 * commandKey returns a keydown handler that runs `run` on the key of
 * `command`, e.g. the key that opened a picker, which closes it again
 */
export const commandKey = (command: CommandIdentifier, run: Command) =>
  liveKeys(() => {
    const binding = commandBinding(command);
    return binding ? { [binding]: run } : {};
  });

/**
 * formatShortcut returns a key binding like "Mod-Shift-z" as the platform
 * shows it: "⇧⌘Z" on macOS, "Ctrl+Shift+Z" elsewhere
 */
export const formatShortcut = (binding: string) => {
  const { modifiers: parts, key } = splitBinding(binding);
  const mac = isMac();
  const names: Record<string, [string, string]> = {
    Mod: ["⌘", "Ctrl"],
    Ctrl: ["⌃", "Ctrl"],
    Alt: ["⌥", "Alt"],
    Shift: ["⇧", "Shift"],
    Meta: ["⌘", "Meta"],
  };
  const order = ["Ctrl", "Alt", "Shift", "Mod", "Meta"];
  const modifiers = parts
    .sort((a, b) => (mac ? order.indexOf(a) - order.indexOf(b) : 0))
    .map((part) => names[part]?.[mac ? 0 : 1] ?? part);
  const name = key.length === 1 ? key.toUpperCase() : key;
  return mac ? modifiers.join("") + name : [...modifiers, name].join("+");
};

/**
 * commandShortcut returns the key bound to `command`, as the platform shows
 * it, for tooltips and hints
 */
export const commandShortcut = (command: CommandIdentifier) => {
  const binding = getKeyBinding(command);
  // a command may have no key (an empty one in blank.json)
  return binding ? formatShortcut(binding) : undefined;
};

// the order aria-keyshortcuts names the modifiers in, as people say them
const ARIA_ORDER = ["Ctrl", "Alt", "Meta", "Shift"];

/**
 * ariaShortcut returns a key binding as aria-keyshortcuts writes it, e.g.
 * "Control+Shift+Z" for "Mod-Shift-z", or undefined if it can't be used
 */
export const ariaShortcut = (binding: string) => {
  const canonical = canonicalBinding(binding);
  if (canonical === undefined) return;
  const { modifiers, key } = splitBinding(canonical);
  const names = ARIA_ORDER.filter((name) => modifiers.includes(name)).map(
    (name) => (name === "Ctrl" ? "Control" : name),
  );
  return [...names, key.length === 1 ? key.toUpperCase() : key].join("+");
};
