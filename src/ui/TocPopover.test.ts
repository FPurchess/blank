import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { tocPopover, type TocPopoverRequest } from "../state";
import { createTestHandle } from "../test/editor";
import { bootApp } from "./mount";

const popover = () => document.getElementById("toc-popover");
const depth = () =>
  document.querySelector<HTMLSelectElement>("#toc-popover-depth")!;
const title = () =>
  document.querySelector<HTMLInputElement>("#toc-popover-title-field")!;

describe("the settings of a table of contents", () => {
  let dispose = () => {};
  let request: TocPopoverRequest;

  beforeEach(async () => {
    dispose = bootApp(createTestHandle());
    request = {
      anchor: { left: 100, top: 200, bottom: 260, right: 600 },
      depth: 3,
      title: "Contents",
      apply: vi.fn(),
      close: vi.fn(),
    };
    tocPopover.value = request;
    await nextTick();
  });

  afterEach(() => {
    tocPopover.value = null;
    dispose();
  });

  it("is a dialog named by its heading, the focus on its first field", () => {
    expect(popover()!.getAttribute("role")).toBe("dialog");
    expect(
      document.getElementById(popover()!.getAttribute("aria-labelledby")!)!
        .textContent,
    ).toBe("Table of contents");
    expect(document.activeElement).toBe(depth());
    expect(depth().value).toBe("3");
    expect(title().value).toBe("Contents");
  });

  it("applies each change at once", () => {
    depth().value = "5";
    depth().dispatchEvent(new Event("change"));
    expect(request.apply).toHaveBeenLastCalledWith(5, "Contents");
    title().value = "Overview";
    title().dispatchEvent(new Event("input"));
    expect(request.apply).toHaveBeenLastCalledWith(5, "Overview");
    // an empty title is the default one
    title().value = " ";
    title().dispatchEvent(new Event("input"));
    expect(request.apply).toHaveBeenLastCalledWith(5, "Contents");
  });

  it("closes on Esc, and gives the focus back", async () => {
    depth().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(tocPopover.value).toBeNull();
    expect(request.close).toHaveBeenCalled();
    await nextTick();
    expect(popover()).toBeNull();
  });

  it("closes on Enter in the title", () => {
    title().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(tocPopover.value).toBeNull();
  });

  it("closes on a press elsewhere, but not on a press in it", () => {
    title().dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(tocPopover.value).not.toBeNull();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(tocPopover.value).toBeNull();
    expect(request.close).toHaveBeenCalled();
  });
});
