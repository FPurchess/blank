import { beforeEach, describe, expect, it, vi } from "vitest";

import { open } from "@tauri-apps/plugin-dialog";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { activeTabId, tabs, type Tab } from "../../state";
import { flushPromises } from "../../test/async";
import { createState, doc, p } from "../../test/editor";
import * as actions from "../tabs";
import {
  closeOtherTabs,
  closeTab,
  closeTabsToRight,
  moveTab,
  openFile,
  saveFile,
  selectTab,
} from "./tabs";

const tab = (id: string): Tab => ({
  id,
  path: `/${id}.md`,
  importedFrom: null,
  untitledNumber: null,
  unsaved: false,
  viewAnchor: null,
});
const state = createState(doc(p("text")));

beforeEach(() => {
  tabs.value = ["a", "b", "c"].map(tab);
  activeTabId.value = "b";
});

describe("the tab commands", () => {
  it("open each file chosen in a tab", async () => {
    const opened = vi.spyOn(actions, "openPaths").mockResolvedValue();
    vi.mocked(open).mockResolvedValue(["/x.md", "/y.md"]);

    expect(openFile()(state, () => {})).toBe(true);
    await flushPromises();

    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({ multiple: true }),
    );
    expect(opened).toHaveBeenCalledWith(["/x.md", "/y.md"]);
  });

  it("report a dialog that can't open", async () => {
    vi.mocked(open).mockRejectedValue("no portal");
    vi.spyOn(console, "error").mockImplementation(() => {});

    openFile()(state, () => {});
    await flushPromises();

    expect(sendNotification).toHaveBeenCalledWith(
      "Failed to open file: no portal",
    );
  });

  it("save the active tab with the state they were given", async () => {
    const save = vi.spyOn(actions, "saveTab").mockResolvedValue(true);

    saveFile({ force: true })(state, () => {});
    saveFile({}, "c")(state, () => {});

    expect(save).toHaveBeenCalledWith("b", { force: true }, state);
    expect(save).toHaveBeenCalledWith("c", {}, undefined);
  });

  it("close the active tab, the others, or those to the right", () => {
    const close = vi.spyOn(actions, "closeTabs").mockResolvedValue();

    closeTab()(state, () => {});
    closeOtherTabs("b")(state, () => {});
    closeTabsToRight("a")(state, () => {});

    expect(close.mock.calls).toEqual([[["b"]], [["a", "c"]], [["b", "c"]]]);
  });

  it("select and move tabs", () => {
    const activate = vi.spyOn(actions, "activateTab").mockResolvedValue();
    const move = vi.spyOn(actions, "moveTab").mockImplementation(() => {});

    selectTab("c")(state, () => {});
    moveTab(-1)(state, () => {});

    expect(activate).toHaveBeenCalledWith("c");
    expect(move).toHaveBeenCalledWith("b", -1);
  });

  it("only tell whether they can run without dispatch", () => {
    const activate = vi.spyOn(actions, "activateTab");

    expect(selectTab("c")(state)).toBe(true);

    expect(activate).not.toHaveBeenCalled();
  });
});
