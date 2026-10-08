import { shallowRef } from "vue";

import type { CertificateInfo } from "../signing/ipc";
import type { Mark, SavedMark } from "../signing/profile";

// The user's signature and initials (src/signing/profile.ts), once read:
// undefined until then, null for none. They're read when something first
// needs them (`loadMarks` in src/signing/marks.ts), not at the start.
export const savedMarks = shallowRef<
  Record<Mark, SavedMark | null> | undefined
>(undefined);

// where the user signed last, which a signature's place starts as
export const signingPlace = shallowRef("");

// the user's certificate as the native side has it (src/signing/ipc.ts):
// undefined until read, null for none
export const signingCertificate = shallowRef<
  CertificateInfo | null | undefined
>(undefined);
