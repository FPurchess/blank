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

  it("says what's wrong with an email a certificate can't hold", () => {
    expect(
      checkCertificate(true, { ...fields, email: "jürgen@müller.de" }),
    ).toMatchObject({
      valid: false,
      field: "email",
      error: expect.stringContaining("plain letters (a–z)"),
    });
    expect(
      checkCertificate(true, { ...fields, email: " ada@example.org " }).valid,
    ).toBe(true);
    // a key file to import has no email
    expect(checkCertificate(false, { ...fields, email: "ü" }).valid).toBe(true);
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
