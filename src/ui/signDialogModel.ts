import type { Option } from "../layout/choices";
import type { SignTarget } from "../state";

// The dialog that signs (SignDialog.vue).

// whether the user's certificate signs too, or the PDF shows the signature
// as a picture only
export type How = "digital" | "visible";

export const HOW_OPTIONS: Option<How>[] = [
  { value: "digital", label: "Digital, with your certificate" },
  { value: "visible", label: "Picture only" },
];

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
 * that they stay empty and how the others sign
 */
export const othersNote = (targets: readonly SignTarget[]) =>
  targets.length > 1
    ? "The other signature blocks stay empty. The other signers can print the PDF and sign it by hand, or sign it in their PDF app."
    : "";
