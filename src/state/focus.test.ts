import { afterEach, describe, expect, it } from "vitest";

import {
  bandEditor,
  type BandEditorRequest,
  imageDialog,
  type ImageDialogRequest,
  linkDialog,
  type LinkDialogRequest,
  pageSetup,
  type PageSetupRequest,
} from "./dialogs";
import { uiTakesFocus } from "./focus";
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
