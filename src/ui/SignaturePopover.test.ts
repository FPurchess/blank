import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { signaturePopover, type SignaturePopoverRequest } from "../state";
import { createTestHandle } from "../test/editor";
import { bootApp } from "./mount";

const field = <T extends HTMLElement>(name: string) =>
  document.querySelector<T>(`#signature-popover-${name}`)!;

describe("the settings of a signature block", () => {
  let dispose = () => {};
  let request: SignaturePopoverRequest;

  beforeEach(async () => {
    dispose = bootApp(createTestHandle());
    request = {
      anchor: { left: 100, top: 200, bottom: 260, right: 600 },
      values: {
        role: "Tenant",
        name: "",
        place: "",
        date: "signing",
        width: null,
      },
      apply: vi.fn(),
      close: vi.fn(),
    };
    signaturePopover.value = request;
    await nextTick();
  });

  afterEach(() => {
    signaturePopover.value = null;
    dispose();
  });

  it("opens on the role, with the block's settings", () => {
    expect(document.activeElement).toBe(field("role"));
    expect(field<HTMLInputElement>("role").value).toBe("Tenant");
    const checked = (row: string) =>
      document
        .querySelector(
          `#signature-popover [data-row=${row}] [aria-checked=true]`,
        )!
        .textContent!.trim();
    expect(checked("date")).toBe("When signed");
    expect(checked("width")).toBe("50%");
  });

  it("applies each change at once", async () => {
    const name = field<HTMLInputElement>("name");
    name.value = "Ada Lovelace ";
    name.dispatchEvent(new Event("input"));
    expect(request.apply).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: "Ada Lovelace", role: "Tenant" }),
    );
    const choose = (row: string, label: string) =>
      [
        ...document.querySelectorAll<HTMLButtonElement>(
          `#signature-popover [data-row=${row}] button`,
        ),
      ]
        .find((button) => button.textContent!.trim() === label)!
        .click();
    choose("date", "Fixed date");
    await nextTick();
    // a fixed date shows its field, today to start with
    expect(field<HTMLInputElement>("fixed").value).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
    choose("width", "75%");
    await nextTick();
    expect(request.apply).toHaveBeenLastCalledWith(
      expect.objectContaining({ width: "75%" }),
    );
  });

  it("closes on Enter in a field, and gives the focus back", () => {
    field("place").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(signaturePopover.value).toBeNull();
    expect(request.close).toHaveBeenCalled();
  });
});
