import { base, keyName } from "w3c-keyname";

import { commandLabel } from "../../commandList";
import {
  type CommandIdentifier,
  type Config,
  defaults,
  type SettingChange,
} from "../../config";
import { formatShortcut } from "../../editor/keyBindings";
import { sameBinding } from "../../keyNames";
import { isMac } from "../../platform";

// The keyboard shortcuts of the settings: what a key pressed while recording
// becomes, which keys are refused and why, and moving a key that another
// command has (ShortcutsSection.vue).

type Keymap = Config["keymap"];

// keys that only modify others, which recording waits past
const MODIFIER_KEYS = new Set([
  "Shift",
  "Control",
  "Alt",
  "AltGraph",
  "Meta",
  "OS",
  "Super",
  "Hyper",
  "Fn",
  "CapsLock",
]);

const F_KEY = /^F([1-9]|1\d|2[0-4])$/;

// what a key pressed while recording means
type Recorded =
  | { binding: string }
  | { error: string }
  | "cancel"
  | "remove"
  // a modifier on its own: recording goes on
  | undefined;

/**
 * keyOf returns the name of the key of `event` as prosemirror-keymap matches
 * it: with Ctrl, Alt or Cmd held, a character is the key's own (keyCode), so
 * Ctrl+Shift+Z on a German keyboard is "z" and Cmd+Option+P on a Mac is "p",
 * not "π"; a single character in lowercase
 */
const keyOf = (event: KeyboardEvent) => {
  let name = keyName(event);
  if (
    name.length === 1 &&
    (event.altKey || event.metaKey || event.ctrlKey) &&
    base[event.keyCode]
  )
    name = base[event.keyCode];
  return name.length === 1 ? name.toLowerCase() : name;
};

/**
 * recordedKey returns what the key of `event` means while a shortcut is
 * recorded: the binding in blank.json's syntax (Ctrl is Mod, but on macOS,
 * where Cmd is Mod and Ctrl stays Ctrl), cancel (Esc), remove (Backspace), or
 * why it can't be one
 */
export const recordedKey = (event: KeyboardEvent, mac = isMac()): Recorded => {
  const commandKeys = event.ctrlKey || event.altKey || event.metaKey;
  if (event.key === "Escape" && !commandKeys && !event.shiftKey)
    return "cancel";
  if (event.key === "Backspace" && !commandKeys) return "remove";
  if (MODIFIER_KEYS.has(event.key)) return;
  const key = keyOf(event);
  if (!commandKeys && !F_KEY.test(key))
    return {
      error: mac
        ? "Use ⌘, ⌃ or ⌥ with a key, or an F key."
        : "Use Ctrl or Alt with a key, or an F key.",
    };
  const modifiers = [
    (mac ? event.metaKey : event.ctrlKey) && "Mod",
    mac && event.ctrlKey && "Ctrl",
    !mac && event.metaKey && "Meta",
    event.altKey && "Alt",
    event.shiftKey && "Shift",
  ].filter(Boolean);
  return { binding: [...modifiers, key].join("-") };
};

// keys a command can't have, as what they do instead, on every platform or
// on macOS or the others only
interface Refused {
  keys: string[];
  does: string;
  only?: "mac" | "others";
  // the commands that may have them, since they're theirs
  except?: CommandIdentifier[];
}
const REFUSED: Refused[] = [
  { keys: ["Mod-a"], does: "selects all everywhere" },
  { keys: ["Mod-c"], does: "copies everywhere" },
  { keys: ["Mod-v"], does: "pastes everywhere" },
  { keys: ["Mod-x"], does: "cuts everywhere" },
  { keys: ["Mod-Backspace", "Mod-Delete"], does: "deletes a word" },
  {
    // the fixed keys of the tabs (FIXED_KEYS in keymap.ts), which another
    // command would take silently
    keys: ["Ctrl-PageDown", "Ctrl-PageUp"],
    does: "switches tabs",
    except: ["tab.next", "tab.previous"] as CommandIdentifier[],
  },
  {
    // the other key of Zoom in, for keyboards that type + without Shift
    keys: ["Mod-+"],
    does: "zooms in",
    except: ["view.zoom_in"] as CommandIdentifier[],
  },
  { keys: ["Alt-F4"], does: "closes the window", only: "others" },
  {
    // prosemirror's text keys on macOS (baseKeymap)
    keys: [
      "Ctrl-a",
      "Ctrl-e",
      "Ctrl-h",
      "Ctrl-d",
      "Ctrl-Alt-Backspace",
      "Alt-Backspace",
      "Alt-Delete",
      "Alt-d",
    ],
    does: "moves or deletes in the text",
    only: "mac",
  },
];

/**
 * refusal returns why `binding` can't be the key of `id`, or undefined if it
 * can, e.g. "Ctrl+C copies everywhere. Choose another."
 */
export const refusal = (
  binding: string,
  id: CommandIdentifier,
  mac = isMac(),
): string | undefined => {
  for (const { keys, does, only, except } of REFUSED) {
    if (only === "mac" ? !mac : only === "others" && mac) continue;
    if (except?.includes(id)) continue;
    if (keys.some((key) => sameBinding(key, binding, mac)))
      return `${formatShortcut(binding)} ${does}. Choose another.`;
  }
  // on a Mac, Option with a letter or digit types a character, e.g. é
  if (mac && /^(Shift-)?Alt-(Shift-)?[a-z0-9]$/.test(binding))
    return `${formatShortcut(binding)} types a character. Add ⌘ or ⌃.`;
};

/**
 * ownerOf returns the command other than `except` that has `binding`, if any
 */
const ownerOf = (binding: string, except: CommandIdentifier, keymap: Keymap) =>
  (Object.keys(keymap) as CommandIdentifier[]).find(
    (id) => id !== except && sameBinding(keymap[id], binding),
  );

// a key another command has, which a second press moves
export interface Pending {
  id: CommandIdentifier;
  binding: string;
  other: CommandIdentifier;
}

export type Assigned =
  | { changes: SettingChange[]; message: string }
  | { pending: Pending; message: string };

// the name of a command in a sentence or a list, without the … of a dialog
export const commandName = (id: CommandIdentifier) =>
  commandLabel(id).replace(/…$/, "");

/**
 * shortcutText returns a binding as the settings show it, "None" for no key
 */
export const shortcutText = (binding: string) =>
  binding ? formatShortcut(binding) : "None";

/**
 * assign returns the changes that give `id` the key `binding`. If another
 * command has it, the first time it returns `pending` and asks to press it
 * again; with that `pending`, the key moves and the other command is left
 * without one, so no two commands ever share a key.
 * @param reset whether `binding` is the default of `id`, which then goes back
 *   to it (leaves blank.json)
 */
export const assign = (
  id: CommandIdentifier,
  binding: string,
  keymap: Keymap,
  pending?: Pending,
  reset = false,
): Assigned => {
  const own: SettingChange = {
    path: ["keymap", id],
    value: reset ? undefined : binding,
  };
  const message = reset
    ? `${commandName(id)} reset to ${shortcutText(binding)}`
    : `Shortcut of ${commandName(id)} set to ${shortcutText(binding)}`;
  const other = binding ? ownerOf(binding, id, keymap) : undefined;
  if (!other) return { changes: [own], message };
  if (
    pending?.id === id &&
    pending.other === other &&
    sameBinding(pending.binding, binding)
  )
    return {
      changes: [own, { path: ["keymap", other], value: "" }],
      message,
    };
  return {
    pending: { id, binding, other },
    message: `${formatShortcut(binding)} is used by ${commandName(other)}. Press it again to move it here.`,
  };
};

/**
 * reset returns what resetting the key of `id` to its default does, see
 * assign: a default that another command has now is moved on a second press
 */
export const reset = (
  id: CommandIdentifier,
  keymap: Keymap,
  pending?: Pending,
) => assign(id, defaults.keymap[id], keymap, pending, true);

/**
 * remove returns the change that leaves `id` without a key
 */
export const remove = (id: CommandIdentifier) => ({
  changes: [{ path: ["keymap", id], value: "" }] as SettingChange[],
  message: `Shortcut of ${commandName(id)} removed`,
});

/**
 * isChanged tells whether the key of `id` isn't its default
 */
export const isChanged = (id: CommandIdentifier, keymap: Keymap) =>
  keymap[id] !== defaults.keymap[id] &&
  !sameBinding(keymap[id], defaults.keymap[id]);

/**
 * keyButton returns what the button of a command's key shows and how screen
 * readers name it, while recording or not
 */
export const keyButton = (
  id: CommandIdentifier,
  binding: string,
  recording: boolean,
) =>
  recording
    ? {
        text: "Press keys…",
        label: `Press the new keys for ${commandName(id)}`,
      }
    : {
        text: shortcutText(binding),
        label: `${commandName(id)}: ${shortcutText(binding)}`,
      };

// what a key pressed while recording does: nothing yet (a modifier), cancel
// the recording, say why it can't be, or the changes and pending key of
// assign
export type RecordingAction =
  | { kind: "wait" }
  | { kind: "cancel" }
  | { kind: "say"; text: string }
  | Assigned;

/**
 * recordingAction returns what the key of `event` does while the key of `id`
 * is recorded, see RecordingAction
 */
export const recordingAction = (
  event: KeyboardEvent,
  id: CommandIdentifier,
  keymap: Keymap,
  pending?: Pending,
  mac = isMac(),
): RecordingAction => {
  const key = recordedKey(event, mac);
  if (key === undefined) return { kind: "wait" };
  if (key === "cancel") return { kind: "cancel" };
  if (key === "remove") return remove(id);
  if ("error" in key) return { kind: "say", text: key.error };
  const refused = refusal(key.binding, id, mac);
  if (refused) return { kind: "say", text: refused };
  return assign(id, key.binding, keymap, pending);
};
