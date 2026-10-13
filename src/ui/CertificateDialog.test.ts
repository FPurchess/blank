import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { certificateDialog, type CertificateDialogRequest } from "../state";
import { flushPromises } from "../test/async";
import { createTestHandle } from "../test/editor";
import { bootApp } from "./mount";

const dialog = () => document.getElementById("certificate-dialog");
const field = (name: string) =>
  document.querySelector<HTMLInputElement>(`#certificate-dialog-${name}`)!;
const type = (name: string, text: string) => {
  field(name).value = text;
  field(name).dispatchEvent(new Event("input"));
};
const submit = () =>
  dialog()!
    .querySelector("form")!
    .dispatchEvent(new Event("submit", { cancelable: true }));
const error = () =>
  document.getElementById("certificate-dialog-error")!.textContent!.trim();

describe("the dialog of the user's certificate", () => {
  let dispose = () => {};
  let request: CertificateDialogRequest;

  const open = async (mode: "create" | "import") => {
    request = {
      mode,
      name: "Ada Lovelace",
      file: "ada.p12",
      submit: vi.fn(async () => null),
      done: vi.fn(),
      cancel: vi.fn(),
    };
    certificateDialog.value = request;
    await nextTick();
  };

  beforeEach(() => {
    dispose = bootApp(createTestHandle());
  });

  afterEach(() => {
    certificateDialog.value = null;
    dispose();
  });

  it("makes a certificate with the passphrase typed twice", async () => {
    await open("create");
    expect(field("name").value).toBe("Ada Lovelace");
    expect(field("passphrase").type).toBe("password");
    type("passphrase", "correct horse");
    type("again", "correct hose");
    submit();
    await nextTick();
    expect(error()).toBe("The passphrases aren't the same.");
    expect(field("again").getAttribute("aria-invalid")).toBe("true");
    expect(request.submit).not.toHaveBeenCalled();
    type("again", "correct horse");
    type("email", "ada@example.org");
    submit();
    await flushPromises();
    expect(request.submit).toHaveBeenCalledWith({
      name: "Ada Lovelace",
      email: "ada@example.org",
      passphrase: "correct horse",
    });
    expect(certificateDialog.value).toBeNull();
    expect(request.done).toHaveBeenCalled();
  });

  it("says it's busy while the key is made, and can't be cancelled meanwhile", async () => {
    await open("create");
    let finish: (failure: string | null) => void = () => {};
    request.submit = vi.fn(
      () => new Promise<string | null>((resolve) => (finish = resolve)),
    );
    type("passphrase", "correct horse");
    type("again", "correct horse");
    submit();
    await nextTick();
    const [cancel, create] = dialog()!.querySelectorAll<HTMLButtonElement>(
      ".dialog-foot > button",
    );
    expect(create.textContent!.trim()).toBe("Creating…");
    expect(create.disabled && cancel.disabled).toBe(true);
    expect(
      document.getElementById("certificate-dialog-status")!.textContent,
    ).toContain("Making your key");
    dialog()!
      .querySelector("form")!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(certificateDialog.value).not.toBeNull();
    finish(null);
    await flushPromises();
    expect(certificateDialog.value).toBeNull();
    expect(request.cancel).not.toHaveBeenCalled();
  });

  it("stays open with what went wrong", async () => {
    await open("import");
    expect(dialog()!.textContent).toContain("ada.p12");
    expect(document.querySelector("#certificate-dialog-name")).toBeNull();
    request.submit = vi.fn(async () => "The passphrase is wrong");
    type("passphrase", "wrong");
    submit();
    await flushPromises();
    expect(error()).toBe("The passphrase is wrong");
    expect(field("passphrase").getAttribute("aria-invalid")).toBe("true");
    expect(certificateDialog.value).not.toBeNull();
    // typing again clears it
    type("passphrase", "wrong again");
    await nextTick();
    expect(error()).toBe("");
  });
});
