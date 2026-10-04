import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { blockPicker, type BlockPickerRequest } from "../state";
import { createTestHandle } from "../test/editor";
import { bootApp } from "./mount";

let dispose = () => {};
afterEach(() => dispose());

const choices = () => [
  ...document.querySelectorAll<HTMLButtonElement>("#block-picker .choice"),
];

const open = async () => {
  const request: BlockPickerRequest = {
    choices: [
      { id: "toc", label: "Table of contents", description: "The headings" },
      { id: "other", label: "Other", description: "Something else" },
    ],
    pick: vi.fn(),
    cancel: vi.fn(),
  };
  blockPicker.value = request;
  await nextTick();
  return request;
};

const keydown = async (key: string) => {
  document.activeElement!.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );
  await nextTick();
};

describe("BlockPicker", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    blockPicker.value = null;
    dispose = bootApp(createTestHandle());
  });

  it("lists the blocks with what they are, the first one focused", async () => {
    await open();
    expect(
      choices().map((choice) => [
        choice.querySelector(".label")?.textContent,
        choice.querySelector(".description")?.textContent,
      ]),
    ).toEqual([
      ["Table of contents", "The headings"],
      ["Other", "Something else"],
    ]);
    expect(document.activeElement).toBe(choices()[0]);
  });

  it("moves with the arrows, around, and inserts the one clicked", async () => {
    const request = await open();
    await keydown("ArrowDown");
    expect(document.activeElement).toBe(choices()[1]);
    await keydown("ArrowDown");
    expect(document.activeElement).toBe(choices()[0]);
    await keydown("ArrowUp");
    choices()[1].click();
    await nextTick();
    expect(request.pick).toHaveBeenCalledWith("other");
    expect(blockPicker.value).toBeNull();
  });

  it("shows a template it can't use, but skips it", async () => {
    const request: BlockPickerRequest = {
      choices: [
        {
          id: "user/broken",
          label: "user/broken",
          description: "Can't be used",
          disabled: true,
        },
        { id: "toc", label: "Table of contents", description: "The headings" },
      ],
      pick: vi.fn(),
      cancel: vi.fn(),
    };
    blockPicker.value = request;
    await nextTick();
    expect(choices()[0].disabled).toBe(true);
    expect(document.activeElement).toBe(choices()[1]);
    await keydown("ArrowDown");
    expect(document.activeElement).toBe(choices()[1]);
  });

  it("cancels on Escape", async () => {
    const request = await open();
    await keydown("Escape");
    expect(request.cancel).toHaveBeenCalled();
    expect(blockPicker.value).toBeNull();
  });
});
