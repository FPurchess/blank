import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { mathPopover, type MathPopoverRequest } from "../state";
import { createTestHandle } from "../test/editor";
import { bootApp } from "./mount";

const toggle = () =>
  document.querySelector<HTMLButtonElement>('#math-popover [role="switch"]')!;

describe("the settings of display math", () => {
  let dispose = () => {};
  let request: MathPopoverRequest;

  beforeEach(async () => {
    dispose = bootApp(createTestHandle());
    request = {
      anchor: { left: 100, top: 200, bottom: 260, right: 600 },
      values: { numbered: false },
      apply: vi.fn(),
      close: vi.fn(),
    };
    mathPopover.value = request;
    await nextTick();
  });

  afterEach(() => {
    mathPopover.value = null;
    dispose();
  });

  it("numbers it as the switch is flipped, and stops", async () => {
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    toggle().click();
    await nextTick();
    expect(request.apply).toHaveBeenLastCalledWith({ numbered: true });
    toggle().click();
    await nextTick();
    expect(request.apply).toHaveBeenLastCalledWith({ numbered: false });
  });
});
