import type { Option } from "../layout/choices";

// The dialog that signs (SignDialog.vue).

// whether the user's certificate signs too, or the PDF shows the signature
// as a picture only
export type How = "digital" | "visible";

export const HOW_OPTIONS: Option<How>[] = [
  { value: "digital", label: "Digital, with your certificate" },
  { value: "visible", label: "Picture only" },
];

/**
 * timeNote says where the time of a digital signature comes from
 */
export const timeNote = (server: string) =>
  server
    ? `The time of signing comes from ${server}.`
    : "The time of signing comes from your computer's clock. A timestamp server in Settings ▸ Signing proves it.";
