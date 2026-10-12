import { describe, expect, it } from "vitest";

import { checkCertificate } from "./certificateDialogModel";

const fields = {
  name: "Ada",
  email: "",
  passphrase: "correct horse",
  again: "correct horse",
  submitted: true,
};

describe("making or importing a certificate", () => {
  it("takes a name and a long enough passphrase, typed twice", () => {
    expect(checkCertificate(true, fields)).toEqual({ valid: true, error: "" });
    expect(checkCertificate(true, { ...fields, name: " " })).toMatchObject({
      field: "name",
    });
    expect(
      checkCertificate(true, { ...fields, passphrase: "short", again: "short" })
        .error,
    ).toBe("Use a passphrase of at least 8 characters.");
    expect(
      checkCertificate(true, { ...fields, again: "correct horse!" }).error,
    ).toBe("The passphrases aren't the same.");
  });

  it("takes an email a certificate can hold", () => {
    expect(
      checkCertificate(true, { ...fields, email: "ada@example.org" }).valid,
    ).toBe(true);
    expect(
      checkCertificate(true, { ...fields, email: "ada@bücher.de" }),
    ).toEqual({
      valid: false,
      error:
        "A certificate can only hold an email without accents or other special letters.",
      field: "email",
    });
    // a key file to import has its own
    expect(
      checkCertificate(false, { ...fields, email: "ada@bücher.de" }).valid,
    ).toBe(true);
  });

  it("takes any passphrase of a key file to import", () => {
    expect(
      checkCertificate(false, {
        ...fields,
        name: "",
        passphrase: "x",
        again: "",
      }).valid,
    ).toBe(true);
    expect(checkCertificate(false, { ...fields, passphrase: "" }).error).toBe(
      "Enter a passphrase.",
    );
  });

  it("says nothing before the user tries to submit", () => {
    expect(
      checkCertificate(true, { ...fields, name: "", submitted: false }),
    ).toEqual({
      valid: false,
      error: "",
      field: undefined,
    });
  });
});
