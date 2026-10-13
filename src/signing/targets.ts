import type { Node } from "prosemirror-model";

import type { SignTarget } from "../state";

// The signature blocks a signed export can fill in (src/editor/commands/
// signing.ts), and the one the user most likely signs.

/**
 * targetsOf returns the signature blocks of a document, by position, each
 * named by who signs on it and as what, e.g. "Ada Lovelace · Tenant", or by
 * its number for one that names nobody
 */
export const targetsOf = (doc: Node): SignTarget[] => {
  const targets: SignTarget[] = [];
  doc.forEach((node, pos) => {
    if (node.type.name !== "signature") return;
    const name = node.attrs.name as string;
    const label = [name, node.attrs.role as string].filter(Boolean).join(" · ");
    targets.push({
      pos,
      name,
      place: node.attrs.place as string,
      dated: node.attrs.date === "signing",
      role: node.attrs.role as string,
      label: label || `Signature ${targets.length + 1}`,
    });
  });
  return targets;
};

/**
 * chosenOf returns the block the user most likely signs: the one with their
 * name, else one that names nobody, else the first
 */
export const chosenOf = (targets: SignTarget[], name: string) =>
  (
    targets.find((target) => name && target.name === name) ??
    targets.find((target) => !target.name) ??
    targets[0]
  ).pos;
