import { commandLabel } from "../commandList";
import { commandShortcut } from "../editor/keyBindings";
import { CommandIdentifier } from "../config";
import { STAMP_KINDS, STAMP_NAMES, type StampKind } from "../pdf/stampModel";
import {
  signRefusal,
  type ToolContext,
  toolbarNote,
  toolRefusal,
} from "../pdf/toolRules";

// What the signing toolbar (SigningToolbar.vue) shows in a PDF tab, in
// place of the formatting toolbar: the tools that place stamps, each with
// why it's off when it is, then Sign…, and a note when no tool works.

export interface SigningTool {
  kind: StampKind;
  label: string;
  icon: string;
  // why it's off, its tooltip then; null while it's on
  refusal: string | null;
  // being placed with the mouse
  placing: boolean;
}

const ICONS: Record<StampKind, string> = {
  signature: "signature",
  initials: "initials",
  date: "clock",
  place: "pin",
};

export interface SigningToolbarState {
  tools: SigningTool[];
  // why Sign… is off, null while it's on
  signRefusal: string | null;
  // what the toolbar says when none of its tools works
  note: string | null;
}

/**
 * signingToolbar returns what the signing toolbar shows for `context`, the
 * tool `placing` being placed with the mouse
 */
export const signingToolbar = (
  context: ToolContext,
  placing: StampKind | null,
): SigningToolbarState => ({
  tools: STAMP_KINDS.map((kind) => ({
    kind,
    label: STAMP_NAMES[kind],
    icon: ICONS[kind],
    refusal: toolRefusal(kind, context),
    placing: placing === kind,
  })),
  signRefusal: signRefusal(context),
  note: toolbarNote(context),
});

/**
 * signTip returns the tooltip of Sign…: its name and key, or why it's off
 */
export const signTip = (refusal: string | null) =>
  refusal ?? commandLabel(CommandIdentifier.PDF_SIGN);

/**
 * signKey returns the key that signs in a PDF tab: Sign's own, else Save's
 */
export const signKey = () =>
  commandShortcut(CommandIdentifier.PDF_SIGN) ??
  commandShortcut(CommandIdentifier.FILE_SAVE);

/**
 * activatedByKeys tells whether a click came from the keyboard (Enter or
 * Space on a button), which places a stamp at its default spot rather than
 * waiting for a press on a page
 */
export const activatedByKeys = (event: MouseEvent) => event.detail === 0;
