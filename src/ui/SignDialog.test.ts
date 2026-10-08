import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { signDialog, type SignDialogRequest } from "../state";
import { createTestHandle } from "../test/editor";
import { bootApp } from "./mount";

const dialog = () => document.getElementById("sign-dialog");

describe("the dialog that signs", () => {
  let dispose = () => {};
  let request: SignDialogRequest;

  const open = async (changes: Partial<SignDialogRequest> = {}) => {
    request = {
      title: "lease",
      targets: [
        { pos: 3, label: "Bea · Landlord" },
        { pos: 9, label: "Tenant" },
      ],
      chosen: 9,
      place: "Berlin",
      warnings: [],
      submit: vi.fn(),
      cancel: vi.fn(),
      ...changes,
    };
    signDialog.value = request;
    await nextTick();
  };

  beforeEach(() => {
    dispose = bootApp(createTestHandle());
  });

  afterEach(() => {
    signDialog.value = null;
    dispose();
  });

  it("names what it signs and offers the blocks", async () => {
    await open();
    expect(dialog()!.textContent).toContain("Sign “lease”");
    const options = [
      ...dialog()!.querySelectorAll<HTMLButtonElement>(".options button"),
    ];
    expect(options.map((option) => option.textContent!.trim())).toEqual([
      "Bea · Landlord",
      "Tenant",
    ]);
    expect(options[1].getAttribute("aria-checked")).toBe("true");
  });

  it("offers no choice with one block, and shows its warnings", async () => {
    await open({
      targets: [{ pos: 3, label: "Tenant" }],
      chosen: 3,
      warnings: ["Check every page."],
    });
    expect(dialog()!.querySelector(".options")).toBeNull();
    expect(dialog()!.querySelector(".warning")!.textContent).toContain(
      "Check every page.",
    );
  });

  it("signs in the chosen block, where the user says", async () => {
    await open();
    const place =
      document.querySelector<HTMLInputElement>("#sign-dialog-place")!;
    place.value = " Hamburg ";
    place.dispatchEvent(new Event("input"));
    dialog()!
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { cancelable: true }));
    expect(request.submit).toHaveBeenCalledWith(9, "Hamburg");
    expect(signDialog.value).toBeNull();
  });
});
