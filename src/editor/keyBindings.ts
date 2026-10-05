import { CommandIdentifier, getKeyBinding } from "../config";
import { isMac } from "./plugins/openLink";

// modifier names people know from their OS, mapped to the ones
// prosemirror-keymap understands
const modifierAliases: { [alias: string]: string } = {
  option: "Alt",
  command: "Meta",
  cmd: "Meta",
  super: "Meta",
};

// the modifiers prosemirror-keymap accepts, see normalizeKeyName there
const knownModifier = /^(mod|s|shift|a|alt|c|ctrl|control|m|meta|cmd)$/i;

/**
 * splitBinding splits a key binding into its modifiers and its key, as
 * prosemirror-keymap does, so "Mod--" is the minus key
 */
const splitBinding = (binding: string) => {
  const parts = binding.split(/-(?!$)/);
  const key = parts.pop() as string;
  return { modifiers: parts, key };
};

/**
 * normalizeBinding maps modifier aliases such as `Option` or `Command` to the
 * names prosemirror-keymap understands
 * @param binding key binding like "Command-Shift-s"
 * @returns the normalized binding, or undefined if it can't be used
 */
export const normalizeBinding = (binding: string): string | undefined => {
  if (typeof binding !== "string" || binding === "") return;
  const { modifiers: parts, key } = splitBinding(binding);
  const modifiers: string[] = [];
  for (const part of parts) {
    const modifier = modifierAliases[part.toLowerCase()] ?? part;
    if (!knownModifier.test(modifier)) return;
    modifiers.push(modifier);
  }
  return [...modifiers, key].join("-");
};

/**
 * commandBinding returns the key bound to `command`, normalized for
 * prosemirror-keymap, for code that handles the key itself (e.g. the table
 * keys, which insert a table and switch table mode on and off)
 */
export const commandBinding = (command: CommandIdentifier) =>
  normalizeBinding(getKeyBinding(command));

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

// the names aria-keyshortcuts gives the modifiers, by the names a binding may
// use; Mod is Meta on macOS, Control elsewhere
const ariaModifiers: Record<string, string> = {
  shift: "Shift",
  s: "Shift",
  alt: "Alt",
  a: "Alt",
  ctrl: "Control",
  control: "Control",
  c: "Control",
  meta: "Meta",
  cmd: "Meta",
  m: "Meta",
};

/**
 * ariaShortcut returns a key binding as aria-keyshortcuts writes it, e.g.
 * "Control+Shift+Z" for "Mod-Shift-z", or undefined if it can't be used
 */
export const ariaShortcut = (binding: string) => {
  const normalized = normalizeBinding(binding);
  if (normalized === undefined) return;
  const { modifiers, key } = splitBinding(normalized);
  const names = modifiers.map((modifier) => {
    const name = modifier.toLowerCase();
    if (name === "mod") return isMac() ? "Meta" : "Control";
    return ariaModifiers[name];
  });
  return [...names, key.length === 1 ? key.toUpperCase() : key].join("+");
};
