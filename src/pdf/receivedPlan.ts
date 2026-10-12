import type { SignPlan, StampPlan } from "../signing/ipc";
import { fieldOfPlace, readingOrder } from "./places";
import type { Stamp } from "./stampModel";

// What signing a PDF the user received adds to it (`signing_sign_pdf` with
// the tab as its source): every stamp as a one-page PDF of its own, one part
// of the body each, drawn into the pages' content; and, signed digitally,
// the signature, which shows one signature stamp as the appearance of the
// signature field it fills, or of a new field where it stands. Pure.

export interface ReceivedSigning {
  stamps: readonly Stamp[];
  // whether the user's key signs too, else no digital signature
  digital: boolean;
  name: string;
  place: string;
  reason: string;
  timestampServer: string;
}

/**
 * receivedPlan returns the plan, and the stamps whose PDFs are the body's
 * parts in that order: the stamps in reading order; signed digitally, the
 * signature stamp on a signature field (else the first one) is the
 * signature's appearance, there or in a new field at its spot; without a
 * signature stamp the signature is invisible
 */
export const receivedPlan = ({
  stamps,
  digital,
  name,
  place,
  reason,
  timestampServer,
}: ReceivedSigning): { plan: SignPlan; parts: Stamp[] } => {
  const parts = [...readingOrder(stamps)];
  const signatures = parts.filter((stamp) => stamp.kind === "signature");
  const shown = digital
    ? (signatures.find((stamp) => fieldOfPlace(stamp.place) !== null) ??
      signatures[0])
    : undefined;
  const field = fieldOfPlace(shown?.place);
  const pageStamps: StampPlan[] = parts.flatMap((stamp, part) =>
    stamp === shown
      ? []
      : [
          {
            part,
            page: stamp.page + 1,
            rect: stamp.rect,
            repeat: !!stamp.repeat,
          },
        ],
  );
  const at = shown ? parts.indexOf(shown) : -1;
  return {
    parts,
    plan: {
      stamps: pageStamps,
      signature: !shown
        ? { kind: "invisible" }
        : field !== null
          ? { kind: "existing", field, stamp: at }
          : { kind: "new", page: shown.page + 1, rect: shown.rect, stamp: at },
      others: [],
      name: name || null,
      location: place || null,
      reason: reason || null,
      timestampServer: (digital && timestampServer) || null,
    },
  };
};
