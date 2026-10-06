import { isMac } from "./platform";

// Key bindings as blank.json writes them, e.g. "Mod-Shift-z": what they are
// made of and when two of them are the same key. Nothing here reads the
// config, so src/config.ts can use it too.

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
export const splitBinding = (binding: string) => {
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

// the modifiers by the names a binding may give them, as prosemirror-keymap
// reads them; "mod" depends on the platform
const canonicalModifiers: Record<string, string> = {
  a: "Alt",
  alt: "Alt",
  c: "Ctrl",
  ctrl: "Ctrl",
  control: "Ctrl",
  m: "Meta",
  meta: "Meta",
  cmd: "Meta",
  s: "Shift",
  shift: "Shift",
};
const MODIFIER_ORDER = ["Alt", "Ctrl", "Meta", "Shift"];

/**
 * canonicalBinding returns the key `binding` means on the platform, written
 * one way only: Mod resolved (Cmd on macOS, Ctrl elsewhere), the modifiers in
 * prosemirror-keymap's order and a letter in lowercase, e.g. "Ctrl-Shift-z"
 * for "Shift-Mod-Z" on Linux
 * @returns the binding, or undefined for none ("") or one that can't be used
 */
export const canonicalBinding = (binding: string, mac = isMac()) => {
  const normalized = normalizeBinding(binding);
  if (normalized === undefined) return;
  const { modifiers, key } = splitBinding(normalized);
  const names = new Set(
    modifiers.map((modifier) => {
      const name = modifier.toLowerCase();
      if (name === "mod") return mac ? "Meta" : "Ctrl";
      return canonicalModifiers[name];
    }),
  );
  const ordered = MODIFIER_ORDER.filter((name) => names.has(name));
  return [...ordered, key.length === 1 ? key.toLowerCase() : key].join("-");
};

/**
 * sameBinding tells whether two bindings are the same key on the platform,
 * e.g. "Mod-Shift-z" and "Shift-Ctrl-Z" on Linux. No key ("") is never the
 * same as another.
 */
export const sameBinding = (a: string, b: string, mac = isMac()) => {
  const first = canonicalBinding(a, mac);
  return first !== undefined && first === canonicalBinding(b, mac);
};
