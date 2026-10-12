import type { PageBox } from "../engine/boxes";
import { type InitialsSide, initialsRect } from "./initials";
import type { PdfRect } from "../pdf/ipc";
import type { SignRequest } from "./ipc";

// What a signed export adds to the PDF the layout engine wrote, in one
// incremental update (`signing_sign_pdf` with the PDF as the body's part 0):
// the user's initials on every page, empty signature fields for the others
// who sign, and the digital signature over the filled in block.

export interface ExportSigning {
  // the key's passphrase, or null for no digital signature
  passphrase: string | null;
  // the place and reason the signature carries; the native side names the
  // certificate's holder as who signed it
  place: string;
  reason: string;
  timestampServer: string;
  // where the filled in block is
  signatureBox?: PageBox;
  // the other signature blocks, by who signs them, where the PDF shows them
  others: { name: string; box: PageBox | null }[];
  // the corner the initials go in on every page, or null for none
  initials: InitialsSide | null;
  // the size of the pages, in points
  page: { width: number; height: number };
}

const rectOf = (box: PageBox): PdfRect => [box.x, box.y, box.width, box.height];

/**
 * exportRequest returns what to ask the signer for, with the body's parts
 * after the PDF: the initials' stamp when they go on the pages (part 1).
 * null when there's nothing to add, so the PDF is written as the engine
 * made it: no digital signature, no other signers and no initials.
 */
export const exportRequest = (
  signing: ExportSigning,
): { request: SignRequest; initials: boolean } | null => {
  const others = signing.others.flatMap(({ name, box }) =>
    box ? [{ page: box.page + 1, rect: rectOf(box), name }] : [],
  );
  const digital = signing.passphrase !== null;
  if (!digital && others.length === 0 && !signing.initials) return null;
  const box = signing.signatureBox;
  if (digital && !box) throw new Error("the signature block isn't in the PDF");
  return {
    initials: !!signing.initials,
    request: {
      passphrase: signing.passphrase,
      source: { kind: "body" },
      plan: {
        stamps: signing.initials
          ? [
              {
                part: 1,
                page: 1,
                rect: initialsRect(signing.page, signing.initials),
                repeat: true,
              },
            ]
          : [],
        // the block is in the page content already, from the engine
        signature:
          digital && box
            ? { kind: "new", page: box.page + 1, rect: rectOf(box) }
            : { kind: "invisible" },
        others,
        location: signing.place || null,
        reason: signing.reason || null,
        timestampServer: (digital && signing.timestampServer) || null,
      },
    },
  };
};
