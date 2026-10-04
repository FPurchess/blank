import { afterEach, describe, expect, it, vi } from "vitest";

import { blocksPaneFocused } from "./blocksPane";
import {
  bandEditor,
  type BandEditorRequest,
  imageDialog,
  type ImageDialogRequest,
  linkDialog,
  type LinkDialogRequest,
  pageSetup,
  type PageSetupRequest,
  tocPopover,
  type TocPopoverRequest,
  unsavedDialog,
  type UnsavedDialogRequest,
} from "./dialogs";
import { cycleFocus, registerFocusStop, uiTakesFocus } from "./focus";
import { tabRowFocused } from "./tabs";
import {
  contextMenu,
  type ContextMenuRequest,
  tableToolbar,
  type TableToolbarState,
} from "./popups";

const toolbar = (caption: TableToolbarState["caption"]): TableToolbarState => ({
  anchor: { left: 0, top: 0, bottom: 0, right: 0 },
  items: [],
  keys: false,
  caption,
});

describe("uiTakesFocus", () => {
  afterEach(() => {
    linkDialog.value = null;
    imageDialog.value = null;
    pageSetup.value = null;
    bandEditor.value = null;
    contextMenu.value = null;
    tableToolbar.value = null;
    tocPopover.value = null;
    blocksPaneFocused.value = false;
    tabRowFocused.value = false;
    unsavedDialog.value = null;
  });

  it("is false while nothing takes the focus", () => {
    expect(uiTakesFocus.value).toBe(false);
  });

  it.each([
    ["the link dialog", () => (linkDialog.value = {} as LinkDialogRequest)],
    ["the image dialog", () => (imageDialog.value = {} as ImageDialogRequest)],
    ["the page setup", () => (pageSetup.value = {} as PageSetupRequest)],
    ["a header strip", () => (bandEditor.value = {} as BandEditorRequest)],
    ["the context menu", () => (contextMenu.value = {} as ContextMenuRequest)],
    [
      "the settings of a table of contents",
      () => (tocPopover.value = {} as TocPopoverRequest),
    ],
    ["the blocks pane, holding it", () => (blocksPaneFocused.value = true)],
    ["the tab row, holding it", () => (tabRowFocused.value = true)],
    [
      "the question whether to save",
      () => (unsavedDialog.value = {} as UnsavedDialogRequest),
    ],
    [
      "the caption field",
      () =>
        (tableToolbar.value = toolbar({
          value: "",
          submit: () => {},
          cancel: () => {},
        })),
    ],
  ])("is true while %s is open", (_, open) => {
    open();

    expect(uiTakesFocus.value).toBe(true);
  });

  it("leaves the focus to the editor for the toolbar's buttons", () => {
    tableToolbar.value = toolbar(null);

    expect(uiTakesFocus.value).toBe(false);
  });
});

describe("cycleFocus", () => {
  const removers: (() => void)[] = [];
  afterEach(() => removers.splice(0).forEach((remove) => remove()));

  /**
   * stop registers a part holding the element `inside`
   */
  const stop = (id: string, order: number) => {
    const inside = document.createElement("div");
    const focus = vi.fn();
    removers.push(
      registerFocusStop({
        id,
        order,
        focus,
        has: (element) => element === inside,
      }),
    );
    return { inside, focus };
  };

  it("goes from the editor through the parts in their order and back", () => {
    const toolbar = stop("toolbar", 20);
    const tabs = stop("tabs", 10);
    const editor = vi.fn();

    cycleFocus(1, null, editor);
    expect(tabs.focus).toHaveBeenCalled();

    cycleFocus(1, tabs.inside, editor);
    expect(toolbar.focus).toHaveBeenCalled();

    cycleFocus(1, toolbar.inside, editor);
    expect(editor).toHaveBeenCalled();
  });

  it("goes the other way round", () => {
    const toolbar = stop("toolbar", 20);
    stop("tabs", 10);
    const editor = vi.fn();

    cycleFocus(-1, null, editor);
    expect(toolbar.focus).toHaveBeenCalled();
  });

  it("stays in the editor without parts, and forgets a part that went", () => {
    const editor = vi.fn();
    const tabs = stop("tabs", 10);
    removers.pop()!();

    cycleFocus(1, null, editor);

    expect(editor).toHaveBeenCalled();
    expect(tabs.focus).not.toHaveBeenCalled();
  });
});
