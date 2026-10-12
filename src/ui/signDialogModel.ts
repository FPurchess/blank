import type { Option } from "../layout/choices";
import type { MenuItem, SignTarget } from "../state";
import type { InitialsSide } from "../signing/initials";

// The dialog that signs (SignDialog.vue), for a signed export and for a PDF
// tab alike.

// whether the user's certificate signs too, or the PDF shows the signature
// as a picture only
export type How = "digital" | "visible";

export const VISIBLE_LABEL =
  "No digital signature (only the visible signature)";

/**
 * signAsText returns what Sign as shows: the certificate the user signs
 * with, or that they sign without one
 * @param certificate the name of the user's certificate, null for none
 */
export const signAsText = (how: How, certificate: string | null) =>
  how === "digital" && certificate !== null
    ? `${certificate} · your certificate`
    : VISIBLE_LABEL;

/**
 * signAsItems returns Sign as's menu: the user's certificate if they have
 * one, no digital signature, then making a certificate and managing it in
 * Settings ▸ Signing
 */
export const signAsItems = ({
  certificate,
  how,
  visibleRefusal,
  choose,
  create,
  manage,
}: {
  certificate: string | null;
  how: How;
  // why there's no signing without a digital signature, if there isn't
  visibleRefusal?: string;
  choose(how: How): void;
  create(): void;
  manage(): void;
}): MenuItem[] => [
  ...(certificate !== null
    ? [
        {
          id: "digital",
          label: signAsText("digital", certificate),
          radio: true,
          checked: how === "digital",
          run: () => choose("digital"),
        },
      ]
    : []),
  {
    id: "visible",
    label: VISIBLE_LABEL,
    radio: true,
    checked: how === "visible" || certificate === null,
    run: () => choose("visible"),
    ...(visibleRefusal ? { disabled: true, tip: visibleRefusal } : {}),
  },
  "separator",
  ...(certificate === null
    ? [{ id: "create", label: "Create your certificate…", run: create }]
    : []),
  {
    id: "manage",
    label: "Manage…",
    detail: "Settings ▸ Signing",
    run: manage,
  },
];

export const SIDE_OPTIONS: Option<InitialsSide>[] = [
  { value: "right", label: "Bottom right" },
  { value: "left", label: "Bottom left" },
];

export const NO_INITIALS = "Add your initials in Settings ▸ Signing first.";

/**
 * initialsProblem says why the initials can't go on every page: the
 * request's reason (e.g. a PDF others signed), else that the user has none
 * yet; "" when they can
 */
export const initialsProblem = (reason: string | undefined, saved: boolean) =>
  reason || (saved ? "" : NO_INITIALS);

export const INVISIBLE_NOTE =
  "No signature on the page: the signature will be invisible. Readers see it in their PDF app's signature panel.";

export const PLACE_FIRST =
  "Place your signature on the page first, or sign digitally.";

/**
 * stampNote says, for a PDF tab without the user's signature on a page,
 * what that means: an invisible digital signature, or no signature at all;
 * "" with one
 */
export const stampNote = (stamped: boolean, digital: boolean) =>
  stamped ? "" : digital ? INVISIBLE_NOTE : PLACE_FIRST;

/**
 * emptyFieldsNote says how many of a PDF's places are still to fill in
 */
export const emptyFieldsNote = (count: number) =>
  count <= 0
    ? ""
    : `This PDF still has ${count} ${count === 1 ? "place" : "places"} to fill in.`;

/**
 * canSign tells whether Sign… signs: digitally, or with the user's
 * signature on a page where the PDF allows that, and once they said they
 * checked every page if asked to
 */
export const canSign = ({
  stamped,
  digital,
  visibleRefused = false,
  confirmPages,
  checked,
}: {
  stamped: boolean;
  digital: boolean;
  visibleRefused?: boolean;
  confirmPages: boolean;
  checked: boolean;
}) => (digital || (stamped && !visibleRefused)) && (!confirmPages || checked);

/**
 * hostOf returns a server's host name, e.g. "timestamp.digicert.com", or
 * the URL as it is when it can't be read
 */
const hostOf = (url: string) => {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
};

/**
 * timeNote says where the time of a digital signature comes from
 */
export const timeNote = (server: string) =>
  server
    ? `The time of signing comes from the timestamp server ${hostOf(server)}.`
    : "The time of signing comes from your computer's clock. A timestamp server in Settings ▸ Signing proves it.";

/**
 * namedNote warns when the block chosen names someone other than the user,
 * whose name it shows under their signature; "" when it doesn't
 * @param signer the name the user signs as, "" when unknown
 */
export const namedNote = (target: SignTarget | undefined, signer: string) =>
  target?.name && target.name !== signer
    ? `This block is for ${target.name}, whose name shows under your signature. Sign in it only if that's you.`
    : "";

/**
 * placeNote says where a block that fixes its place is signed, which the
 * place typed doesn't change; "" for a block that leaves it to the signer
 */
export const placeNote = (target: SignTarget | undefined) =>
  target?.place
    ? `This block says where it's signed: ${target.place}. Change it in the block's settings.`
    : "";

/**
 * dateNote says which date goes under the signature, and in which
 * language, which is the document's: "" for a block without today's date
 */
export const dateNote = (
  target: SignTarget | undefined,
  today: { date: string; language: string },
) =>
  target?.dated
    ? `Dated ${today.date}, written in ${today.language}, the document's language. To change it, choose the document's language in the status bar.`
    : "";

/**
 * othersNote says, for a document with more blocks than the one signed,
 * that the others get empty signature fields, and how they sign
 */
export const othersNote = (targets: readonly SignTarget[]) =>
  targets.length > 1
    ? "The other signature blocks get empty signature fields. The other signers can sign them in any PDF app, or in Blank, or print the PDF and sign by hand."
    : "";
