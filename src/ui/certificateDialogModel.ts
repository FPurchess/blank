// The dialog that makes or imports the user's certificate
// (CertificateDialog.vue).

/**
 * busyNote says what the dialog is doing while the native side works on
 * the key, which takes a few seconds
 */
export const busyNote = (creating: boolean) =>
  creating
    ? "Making your key. This takes a few seconds."
    : "Opening your key file. This takes a few seconds.";

// the shortest passphrase Blank takes for a new key
const MIN_PASSPHRASE = 8;

// the field what's wrong is about
type Field = "name" | "email" | "passphrase" | "again";

// what a certificate can hold of an email: ASCII alone (an IA5String)
const ascii = (text: string) =>
  [...text].every((char) => char.charCodeAt(0) < 0x80);

/**
 * checkCertificate says what's wrong with what's typed, once the user tries
 * to submit it: which field, and in words
 */
export const checkCertificate = (
  creating: boolean,
  fields: {
    name: string;
    email: string;
    passphrase: string;
    again: string;
    submitted: boolean;
  },
): { valid: boolean; error: string; field?: Field } => {
  const problem = (field: Field, error: string) => ({
    valid: false,
    error: fields.submitted ? error : "",
    field: fields.submitted ? field : undefined,
  });
  if (creating && !fields.name.trim()) {
    return problem("name", "Enter the name your signatures show.");
  }
  if (creating && !ascii(fields.email)) {
    return problem(
      "email",
      "A certificate can only hold an email without accents or other special letters.",
    );
  }
  if (!fields.passphrase) return problem("passphrase", "Enter a passphrase.");
  if (creating && fields.passphrase.length < MIN_PASSPHRASE) {
    return problem(
      "passphrase",
      `Use a passphrase of at least ${MIN_PASSPHRASE} characters.`,
    );
  }
  if (creating && fields.passphrase !== fields.again) {
    return problem("again", "The passphrases aren't the same.");
  }
  return { valid: true, error: "" };
};
