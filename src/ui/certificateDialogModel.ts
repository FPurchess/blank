// The dialog that makes or imports the user's certificate
// (CertificateDialog.vue).

// the shortest passphrase Blank takes for a new key
export const MIN_PASSPHRASE = 8;

/**
 * checkCertificate says what's wrong with what's typed, once the user tries
 * to submit it: which field, and in words
 */
export const checkCertificate = (
  creating: boolean,
  fields: {
    name: string;
    passphrase: string;
    again: string;
    submitted: boolean;
  },
): { valid: boolean; error: string; field?: "name" | "passphrase" } => {
  const problem = (field: "name" | "passphrase", error: string) => ({
    valid: false,
    error: fields.submitted ? error : "",
    field: fields.submitted ? field : undefined,
  });
  if (creating && !fields.name.trim()) {
    return problem("name", "Enter the name your signatures show.");
  }
  if (!fields.passphrase) return problem("passphrase", "Enter a passphrase.");
  if (creating && fields.passphrase.length < MIN_PASSPHRASE) {
    return problem(
      "passphrase",
      `Use a passphrase of at least ${MIN_PASSPHRASE} characters.`,
    );
  }
  if (creating && fields.passphrase !== fields.again) {
    return problem("passphrase", "The passphrases aren't the same.");
  }
  return { valid: true, error: "" };
};
