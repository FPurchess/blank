import type { PdfRules } from "../signing/ipc";
import type { OpenedPdf } from "./ipc";
import type { StampKind } from "./stampModel";

// What the signing tools of a PDF tab may do (the plan's §6.3), and why not
// when they may not: one sentence per reason, the tools' tooltips and the
// toolbar's note. Pure; signingToolbarModel.ts builds the toolbar on it, and
// pdf.sign asks it before it runs.

export interface ToolContext {
  // the PDF as it opened, null while it opens or can't be
  opened: OpenedPdf | null;
  // what it lets the tools place, null while it's being read
  rules: PdfRules | null;
  // whether Blank's layout engine runs, which lays out the stamps
  engine: boolean;
  // where the user signs, which a place stamp shows ("" while unknown)
  place: string;
}

export const NEEDS_LAYOUT = "Stamps need the page layout, which didn't start";
export const RESTRICTED =
  "This PDF has restrictions set by its author. Blank can't sign it yet.";
export const DAMAGED = "This PDF is damaged, so Blank can't add to it";
export const NO_CHANGES =
  "This PDF doesn't allow any changes, not even signatures";
export const CHECKING = "Blank is checking what this PDF allows";
export const NOT_OPEN = "The PDF isn't open";
export const NO_PLACE = "Blank learns your place once you've signed somewhere";

// what a stamp on a signed PDF would do, by tool (signatures go into a
// signature field's appearance there, so they stay)
const SIGNED: Partial<Record<StampKind, string>> = {
  initials: "Initials would change pages the earlier signers signed.",
  date: "A date would change pages the earlier signers signed.",
  place: "A place would change pages the earlier signers signed.",
};

/**
 * blocked says why nothing can be added to the PDF, neither stamps nor a
 * signature, or null when something can
 */
export const blocked = ({ opened, rules }: ToolContext): string | null => {
  if (!opened) return NOT_OPEN;
  if (opened.encrypted || rules?.encrypted) return RESTRICTED;
  if (opened.repaired || rules?.damaged) return DAMAGED;
  if (rules?.docmdp === 1) return NO_CHANGES;
  return null;
};

/**
 * toolbarNote returns what the signing toolbar says next to its tools when
 * none of them works, or null
 */
export const toolbarNote = (context: ToolContext): string | null => {
  const reason = blocked(context);
  if (reason && reason !== NOT_OPEN) return reason;
  if (!reason && !context.engine) return NEEDS_LAYOUT;
  return null;
};

/**
 * toolRefusal says why the tool `kind` can't place its stamp on the PDF,
 * or null when it can
 */
export const toolRefusal = (
  kind: StampKind,
  context: ToolContext,
): string | null => {
  const reason = blocked(context);
  if (reason) return reason;
  if (!context.engine) return NEEDS_LAYOUT;
  if (!context.rules) return CHECKING;
  const signed = context.rules.signed || context.rules.docmdp !== null;
  if (signed && SIGNED[kind]) return SIGNED[kind]!;
  if (kind === "place" && !context.place.trim()) return NO_PLACE;
  return null;
};

/**
 * signRefusal says why the PDF can't be signed, or null when it can
 */
export const signRefusal = (context: ToolContext): string | null => {
  const reason = blocked(context);
  if (reason) return reason;
  if (!context.rules) return CHECKING;
  return null;
};
