import type { PdfRules } from "../signing/ipc";
import type { OpenedPdf } from "./ipc";
import { fillOf, type Place } from "./places";
import type { StampKind } from "./stampModel";
import { STAMPS_NEED_LAYOUT } from "./stamps";

// What the signing tools of a PDF tab may do (see .claude/rules/pdf.md,
// "Stamps"), and why not when they may not: one sentence per reason, the
// tools' tooltips and the toolbar's note. Pure; signingToolbarModel.ts
// builds the toolbar on it, the places and fields ask it, and pdf.sign asks
// it before it runs. The sentences of what the signer refuses itself are
// those of `Refusal` in src-tauri/src/signing/mod.rs (toolRules.test.ts
// compares them).

export interface ToolContext {
  // the PDF as it opened, null while it opens or can't be
  opened: OpenedPdf | null;
  // what it lets the tools place, null while it's being read
  rules: PdfRules | null;
  // whether Blank's layout engine runs, which lays out the stamps
  engine: boolean;
  // whether Blank is signing the PDF right now
  signing: boolean;
  // how many signature stamps are on its pages
  signatures: number;
}

export const RESTRICTED =
  "This PDF has restrictions set by its author. Blank can't sign it.";
export const DAMAGED = "This PDF is damaged, so Blank can't add to it";
export const NO_CHANGES =
  "This PDF doesn't allow any changes, not even signatures";
export const CHECKING = "Blank is checking what this PDF allows";
export const NOT_OPEN = "The PDF isn't open";
export const SIGNING = "Blank is signing this PDF";
export const FIELD_LOCKED =
  "An earlier signer locked this field, so it can't change any more";
export const ONE_SIGNATURE =
  "This PDF is signed already, so it takes one more signature only";
export const VISIBLE_ON_SIGNED =
  "Without a digital signature, your signature would change pages the earlier signers signed. Sign with your certificate.";

// what a stamp on a signed PDF would do, by tool (signatures go into a
// signature field's appearance there, so they stay)
const SIGNED: Partial<Record<StampKind, string>> = {
  initials: "Initials would change pages the earlier signers signed.",
  date: "A date would change pages the earlier signers signed.",
  place: "A place would change pages the earlier signers signed.",
};

/**
 * isSigned tells whether earlier signatures protect the PDF's pages: it is
 * signed or certified
 */
const isSigned = (rules: PdfRules) => rules.signed || rules.docmdp !== null;

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
  if (!reason && !context.engine) return STAMPS_NEED_LAYOUT;
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
  if (context.signing) return SIGNING;
  if (!context.engine) return STAMPS_NEED_LAYOUT;
  if (!context.rules) return CHECKING;
  if (isSigned(context.rules)) {
    if (SIGNED[kind]) return SIGNED[kind]!;
    // only one of them becomes the signature's appearance
    if (kind === "signature" && context.signatures > 0) return ONE_SIGNATURE;
  }
  return null;
};

/**
 * fieldRefusal says why the form's field `name` can't be filled in, or null
 * when it can
 */
export const fieldRefusal = (
  name: string,
  context: ToolContext,
): string | null => {
  const reason = blocked(context);
  if (reason) return reason;
  if (context.signing) return SIGNING;
  if (!context.rules) return CHECKING;
  if (context.rules.locked.includes(name)) return FIELD_LOCKED;
  return null;
};

/**
 * placeRefusal says why `place` can't be filled in or signed, or null when
 * it can: as its stamp's tool for a stamp, else as its field
 */
export const placeRefusal = (
  place: Place,
  context: ToolContext,
): string | null => {
  const fill = fillOf(place);
  if (fill.action !== "stamp")
    return place.source === "field"
      ? fieldRefusal(place.field.name, context)
      : null;
  const kind = fill.stamp === "placeAndDate" ? "place" : fill.stamp;
  return (
    toolRefusal(kind, context) ??
    (place.source === "field" ? fieldRefusal(place.field.name, context) : null)
  );
};

/**
 * signRefusal says why the PDF can't be signed, or null when it can
 */
export const signRefusal = (context: ToolContext): string | null => {
  const reason = blocked(context);
  if (reason) return reason;
  if (context.signing) return SIGNING;
  if (!context.rules) return CHECKING;
  return null;
};

/**
 * visibleRefusal says why the PDF can't be signed without a digital
 * signature, or null when it can: its earlier signatures protect its pages,
 * which a signature drawn into them would change
 */
export const visibleRefusal = (context: ToolContext): string | null =>
  context.rules && isSigned(context.rules) ? VISIBLE_ON_SIGNED : null;
