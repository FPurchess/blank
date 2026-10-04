import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { blockToolbar } from "../state";
import { createTestHandle } from "../test/editor";
import { bootApp } from "./mount";

const toolbar = () => document.getElementById("block-toolbar")!;

describe("the block toolbar", () => {
  let dispose = () => {};
  const settings = vi.fn();
  const remove = vi.fn();

  beforeEach(async () => {
    dispose = bootApp(createTestHandle());
    blockToolbar.value = {
      anchor: { left: 100, top: 300, bottom: 400, right: 600 },
      label: "Table of contents",
      icon: "toc",
      items: [
        {
          id: "block-edit",
          label: "Settings",
          icon: "pencil",
          key: "Enter",
          enabled: true,
          run: settings,
        },
        {
          id: "block-remove",
          label: "Remove Table of contents",
          tip: "Remove block",
          icon: "trash",
          key: "Backspace",
          enabled: true,
          run: remove,
        },
      ],
    };
    await nextTick();
  });

  afterEach(() => {
    blockToolbar.value = null;
    dispose();
  });

  it("names the block, then its buttons with their keys", () => {
    expect(toolbar().getAttribute("aria-label")).toBe("Table of contents");
    expect(toolbar().querySelector(".block-name")!.textContent).toBe(
      "Table of contents",
    );
    const [edit, bin] = toolbar().querySelectorAll<HTMLButtonElement>("button");
    expect(edit.getAttribute("aria-label")).toBe("Settings");
    expect(edit.dataset.tipKey).toBe("Enter");
    expect(bin.getAttribute("aria-label")).toBe("Remove Table of contents");
    expect(bin.dataset.tip).toBe("Remove block");
    expect(bin.dataset.tipKey).toBe("Backspace");
    // the editor keeps the focus
    expect(edit.tabIndex).toBe(-1);
  });

  it("runs a button's action on a click", () => {
    toolbar()
      .querySelector<HTMLButtonElement>('[data-id="block-remove"]')!
      .click();
    expect(remove).toHaveBeenCalled();
    expect(settings).not.toHaveBeenCalled();
  });
});
