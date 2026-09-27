import { CommandIdentifier, getKeyBinding } from "../config";

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
 * normalizeBinding maps modifier aliases such as `Option` or `Command` to the
 * names prosemirror-keymap understands
 * @param binding key binding like "Command-Shift-s"
 * @returns the normalized binding, or undefined if it can't be used
 */
export const normalizeBinding = (binding: string): string | undefined => {
  if (typeof binding !== "string" || binding === "") return;
  // split like prosemirror-keymap does, so "Mod--" binds the minus key
  const parts = binding.split(/-(?!$)/);
  const key = parts.pop() as string;
  const modifiers: string[] = [];
  for (const part of parts) {
    const modifier = modifierAliases[part.toLowerCase()] ?? part;
    if (!knownModifier.test(modifier)) return;
    modifiers.push(modifier);
  }
  return [...modifiers, key].join("-");
};

/**
 * tableKeyBinding returns the key that inserts a table, and switches table
 * mode on and off, normalized for prosemirror-keymap
 */
export const tableKeyBinding = () =>
  normalizeBinding(getKeyBinding(CommandIdentifier.INSERT_TABLE));
