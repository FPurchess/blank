import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { tocDialog, type TocDialogRequest } from "../state";
import { createTestHandle } from "../test/editor";
import { bootApp } from "./mount";

let dispose = () => {};
afterEach(() => dispose());

const dialog = () => document.querySelector<HTMLElement>("#toc-dialog")!;
const depths = () => [
  ...dialog().querySelectorAll<HTMLButtonElement>('[data-row="depth"] button'),
];
const title = () =>
  document.querySelector<HTMLInputElement>("#toc-dialog-text")!;
const button = (label: string) =>
  [...dialog().querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label,
  )!;

const open = async () => {
  const request: TocDialogRequest = {
    depth: 3,
    title: "Contents",
    submit: vi.fn(),
    remove: vi.fn(),
    cancel: vi.fn(),
  };
  tocDialog.value = request;
  await nextTick();
  await nextTick();
  return request;
};

describe("TocDialog", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    tocDialog.value = null;
    dispose = bootApp(createTestHandle());
  });

  it("shows the depth and title, the depth focused", async () => {
    await open();
    expect(depths().map((depth) => depth.textContent?.trim())).toEqual([
      "Heading 1",
      "1 – 2",
      "1 – 3",
      "1 – 4",
      "1 – 5",
      "1 – 6",
    ]);
    expect(depths()[2].getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(depths()[2]);
    expect(title().value).toBe("Contents");
  });

  it("saves the depth and title chosen", async () => {
    const request = await open();
    depths()[1].click();
    title().value = "  In this report ";
    title().dispatchEvent(new Event("input"));
    await nextTick();
    dialog().querySelector("form")!.requestSubmit();
    expect(request.submit).toHaveBeenCalledWith(2, "In this report");
    expect(tocDialog.value).toBeNull();
  });

  it("removes it", async () => {
    const request = await open();
    button("Remove").click();
    expect(request.remove).toHaveBeenCalled();
    expect(tocDialog.value).toBeNull();
  });
});
