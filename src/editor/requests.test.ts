import { afterEach, describe, expect, it, vi } from "vitest";

import {
  bandEditorDone,
  contextMenu,
  imageDialog,
  type ImageDialogRequest,
  linkDialog,
  type LinkDialogRequest,
  outlinePeek,
  pageSetup,
  type PageSetupRequest,
  tablePicker,
  type TablePickerState,
  tocPopover,
  type TocPopoverRequest,
  unsavedDialog,
  wordCountCard,
} from "../state";
import { closeRequests } from "./requests";

afterEach(() => {
  bandEditorDone.value = null;
  tablePicker.value = null;
});

describe("closeRequests", () => {
  it("cancels the dialogs, each closed before its callback runs", () => {
    const closedFirst = (ref: { value: unknown }) =>
      vi.fn(() => expect(ref.value).toBeNull());
    const link = closedFirst(linkDialog);
    const image = closedFirst(imageDialog);
    const page = closedFirst(pageSetup);
    const unsaved = closedFirst(unsavedDialog);
    linkDialog.value = { cancel: link } as unknown as LinkDialogRequest;
    imageDialog.value = { cancel: image } as unknown as ImageDialogRequest;
    pageSetup.value = { cancel: page } as unknown as PageSetupRequest;
    unsavedDialog.value = {
      label: "a",
      save: vi.fn(),
      discard: vi.fn(),
      cancel: unsaved,
    };

    closeRequests();

    for (const callback of [link, image, page, unsaved])
      expect(callback).toHaveBeenCalledOnce();
  });

  it("closes the menus, popovers and pickers", () => {
    const toc = vi.fn();
    const menu = vi.fn();
    const picker = vi.fn();
    const strip = vi.fn();
    tocPopover.value = { close: toc } as unknown as TocPopoverRequest;
    contextMenu.value = {
      items: [],
      anchor: { left: 0, top: 0, bottom: 0 },
      keyboard: false,
      close: menu,
    };
    tablePicker.value = { cancel: picker } as unknown as TablePickerState;
    bandEditorDone.value = strip;
    wordCountCard.value = true;
    outlinePeek.value = "sticky";

    closeRequests();

    expect(toc).toHaveBeenCalled();
    expect(menu).toHaveBeenCalled();
    expect(picker).toHaveBeenCalled();
    expect(strip).toHaveBeenCalled();
    expect(tocPopover.value).toBeNull();
    expect(contextMenu.value).toBeNull();
    expect(wordCountCard.value).toBe(false);
    expect(outlinePeek.value).toBeNull();
  });
});
