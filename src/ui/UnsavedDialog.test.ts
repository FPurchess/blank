import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { unsavedDialog, type UnsavedDialogRequest } from "../state";
import { createTestHandle } from "../test/editor";
import { bootApp } from "./mount";

let dispose = () => {};
let request: UnsavedDialogRequest;

const dialog = () => document.querySelector<HTMLElement>("#unsaved-dialog");
const button = (text: string) =>
  [...dialog()!.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === text,
  )!;

beforeEach(async () => {
  document.body.innerHTML = "";
  dispose = bootApp(createTestHandle());
  request = {
    label: "notes",
    save: vi.fn(() => expect(unsavedDialog.value).toBeNull()),
    discard: vi.fn(),
    cancel: vi.fn(),
  };
  unsavedDialog.value = request;
  await nextTick();
});

afterEach(() => {
  dispose();
  unsavedDialog.value = null;
});

describe("the question whether to save", () => {
  it("names the tab and what happens, with Save focused", () => {
    expect(dialog()?.querySelector("h2")?.textContent).toBe(
      "Save changes to “notes”?",
    );
    expect(dialog()?.textContent).toContain(
      "Your changes will be lost if you don't save them.",
    );
    expect(
      [...dialog()!.querySelectorAll("button")].map((b) =>
        b.textContent?.trim(),
      ),
    ).toEqual(["Save", "Don't save", "Cancel"]);
    expect(document.activeElement).toBe(button("Save"));
    // read out with the title
    const form = dialog()!.querySelector("form")!;
    expect(
      document.getElementById(form.getAttribute("aria-describedby")!)
        ?.textContent,
    ).toContain("Your changes will be lost");
  });

  it.each([
    ["Save", "save"],
    ["Don't save", "discard"],
    ["Cancel", "cancel"],
  ] as const)("closes with %s", async (text, callback) => {
    button(text).click();
    await nextTick();

    expect(request[callback]).toHaveBeenCalledOnce();
    expect(unsavedDialog.value).toBeNull();
    expect(dialog()).toBeNull();
  });

  it("cancels on Escape", () => {
    dialog()!
      .querySelector("form")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );

    expect(request.cancel).toHaveBeenCalled();
  });
});
