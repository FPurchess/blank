import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import localforage from "localforage";
import { EditorState } from "prosemirror-state";
import { history, undo } from "prosemirror-history";
import { nextTick, shallowRef } from "vue";

import { save } from "@tauri-apps/plugin-dialog";
import { exists, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { schema } from "../markdown";
import {
  activeTab,
  activeTabId,
  announcement,
  bandEditorDone,
  importedFrom,
  linkDialog,
  path,
  tabs,
  tabSwitch,
  transaction,
  unsavedDialog,
} from "../state";
import { flushPromises } from "../test/async";
import { createTestView, doc, p } from "../test/editor";
import { mockTauriPath } from "../test/tauri";
import {
  activateTab,
  bootTabs,
  closeTabs,
  cycleTab,
  moveTab,
  openNewTab,
  openPaths,
  reopenTab,
  restoreTabs,
  saveTab,
} from "./tabs";

// the files on the "disk", by path
let files: Record<string, string>;
let stop = () => {};
let view: ReturnType<typeof createTestView>;
const viewState = shallowRef<EditorState>(EditorState.create({ schema }));

const start = () => EditorState.create({ schema, plugins: [history()] });

/**
 * boot restores the tabs and starts them in a test view, as bootEditor does
 */
const boot = async () => {
  const state = await restoreTabs(start());
  view = createTestView(state);
  const { dispatch, updateState } = view;
  // the handle's state follows the view
  view.dispatch = (tr) => {
    dispatch(tr);
    viewState.value = view.state;
  };
  view.updateState = (next) => {
    updateState(next);
    viewState.value = next;
  };
  viewState.value = state;
  stop = bootTabs(view, viewState);
  await flushPromises();
};

const labels = () => tabs.value.map((tab) => tab.path ?? tab.untitledNumber);
const text = () => view.state.doc.textContent;
const type = async (typed: string) => {
  view.dispatch(view.state.tr.insertText(typed, 1));
  await nextTick();
};

/**
 * stored puts a session with `list` into storage, the last one active
 */
const stored = async (
  list: { id: string; path?: string; unsaved?: boolean; text?: string }[],
) => {
  await localforage.setItem("session", {
    version: 1,
    order: list.map(({ id }) => id),
    active: list[list.length - 1].id,
    tabs: Object.fromEntries(
      list.map(({ id, path = null, unsaved = false }) => [
        id,
        {
          path,
          importedFrom: null,
          untitledNumber: path ? null : 1,
          unsaved,
          viewAnchor: null,
        },
      ]),
    ),
  });
  for (const { id, text } of list) {
    if (text) await localforage.setItem(`tab:${id}`, doc(p(text)).toJSON());
  }
};

beforeEach(async () => {
  await localforage.clear();
  files = {};
  tabs.value = [];
  activeTabId.value = null;
  path.value = null;
  importedFrom.value = null;
  unsavedDialog.value = null;
  mockTauriPath();
  vi.mocked(exists).mockImplementation(async (file) => String(file) in files);
  vi.mocked(readTextFile).mockImplementation(async (file) => {
    if (!(String(file) in files)) throw new Error("not found");
    return files[String(file)];
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  stop();
});

describe("restoring", () => {
  it("starts with the welcome document the first time", async () => {
    await boot();

    expect(tabs.value).toHaveLength(1);
    expect(activeTab.value).toMatchObject({ welcome: true, unsaved: false });
    expect(text()).toContain("Welcome to Blank");
    expect(transaction.value?.doc).toBe(view.state.doc);
  });

  it("can't undo the document it starts with", async () => {
    await boot();

    expect(undo(view.state)).toBe(false);
  });

  it("brings back the tabs in order, with the active one shown", async () => {
    await stored([
      { id: "a", text: "first" },
      { id: "b", text: "second", unsaved: true },
    ]);

    await boot();

    expect(tabs.value.map((tab) => tab.id)).toEqual(["a", "b"]);
    expect(activeTabId.value).toBe("b");
    expect(text()).toBe("second");
  });

  it("reads a file without changes from the disk, which is the truth", async () => {
    files["/notes.md"] = "on disk";
    await stored([{ id: "a", path: "/notes.md", text: "stored" }]);

    await boot();

    expect(text()).toBe("on disk");
    expect(path.value).toBe("/notes.md");
    expect(activeTab.value?.unsaved).toBe(false);
  });

  it("keeps the changes of a file, which clear once they match it again", async () => {
    files["/notes.md"] = "saved";
    await stored([
      { id: "a", path: "/notes.md", text: "changed", unsaved: true },
    ]);

    await boot();
    expect(text()).toBe("changed");
    expect(activeTab.value?.unsaved).toBe(true);

    view.dispatch(
      view.state.tr.replaceWith(0, view.state.doc.content.size, p("saved")),
    );
    await nextTick();
    expect(activeTab.value?.unsaved).toBe(false);
  });

  it("keeps the text of a file that has gone, unsaved, and says so", async () => {
    await stored([{ id: "a", path: "/gone.md", text: "kept" }]);

    await boot();

    expect(text()).toBe("kept");
    expect(activeTab.value?.unsaved).toBe(true);
    expect(sendNotification).toHaveBeenCalledWith(
      expect.stringContaining("/gone.md can't be found"),
    );
  });

  it("backs up a stored document it can't read", async () => {
    await stored([{ id: "a" }]);
    const broken = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "no_such_node" }] }],
    };
    await localforage.setItem("tab:a", broken);

    await boot();

    expect(await localforage.getItem("tab-backup:a")).toEqual(broken);
    expect(sendNotification).toHaveBeenCalledWith(
      expect.stringContaining('A copy was kept as "tab-backup:a"'),
    );
  });

  it("opens the files Blank was started with as new tabs", async () => {
    files["/a.md"] = "a";
    files["/b.md"] = "b";
    await stored([{ id: "x", text: "kept", unsaved: true }]);
    const { mockIPC } = await import("@tauri-apps/api/mocks");
    mockIPC((cmd, args) => {
      if (cmd === "take_open_paths") return ["/a.md", "/b.md"];
      if (cmd === "plugin:path|resolve")
        return (args as { paths: string[] }).paths.join("/");
    });

    await boot();

    expect(labels()).toEqual([1, "/a.md", "/b.md"]);
    expect(path.value).toBe("/b.md");
    expect(text()).toBe("b");
  });
});

describe("opening", () => {
  beforeEach(() => {
    files["/a.md"] = "# A";
    files["/b.md"] = "# B";
  });

  it("opens files right of the active tab and shows the last", async () => {
    await boot();
    await openPaths(["/a.md", "/b.md"]);

    expect(labels()).toEqual([null, "/a.md", "/b.md"]);
    expect(path.value).toBe("/b.md");
    expect(text()).toBe("B");
  });

  it("only shows the tab of a file that is open already", async () => {
    await boot();
    await openPaths(["/a.md", "/b.md"]);
    await openPaths(["/a.md"]);

    expect(tabs.value).toHaveLength(3);
    expect(path.value).toBe("/a.md");
  });

  it("takes the place of an untouched Untitled", async () => {
    await boot();
    await openNewTab();
    await openPaths(["/a.md"]);

    expect(labels()).toEqual([null, "/a.md"]);
  });

  it("keeps an Untitled that was typed into", async () => {
    await boot();
    await openNewTab();
    await type("draft");
    await openPaths(["/a.md"]);

    expect(labels()).toEqual([null, 1, "/a.md"]);
  });

  it("adds no tab for a file it can't read", async () => {
    await boot();
    await openPaths(["/missing.md"]);

    expect(tabs.value).toHaveLength(1);
    expect(sendNotification).toHaveBeenCalledWith(
      "File not found: /missing.md",
    );
  });

  it("opens new tabs at the end, numbered from the lowest free number", async () => {
    await boot();
    await openNewTab();
    await type("one");
    await openNewTab();
    await type("two");
    const closing = closeTabs([tabs.value[1].id]);
    await flushPromises();
    unsavedDialog.value?.discard();
    await closing;
    await openNewTab();

    expect(labels()).toEqual([null, 2, 1]);
  });
});

describe("switching", () => {
  beforeEach(() => {
    files["/a.md"] = "A";
    files["/b.md"] = "B";
  });

  it("keeps each tab's state, with its own undo history", async () => {
    await boot();
    await openPaths(["/a.md"]);
    await type("typed in ");
    await openPaths(["/b.md"]);
    expect(text()).toBe("B");

    await activateTab(tabs.value[1].id);

    expect(text()).toBe("typed in A");
    expect(path.value).toBe("/a.md");
    expect(undo(view.state)).toBe(true);
  });

  it("publishes the document before the view gets it", async () => {
    await boot();
    await openPaths(["/a.md", "/b.md"]);
    const seen: (string | null)[] = [];
    const updateState = view.updateState;
    view.updateState = (next) => {
      seen.push(path.value, transaction.value?.doc.textContent ?? null);
      updateState(next);
    };

    await activateTab(tabs.value[1].id);

    expect(seen).toEqual(["/a.md", "A"]);
  });

  it("closes what was open on the last tab", async () => {
    await boot();
    await openPaths(["/a.md"]);
    const cancel = vi.fn();
    linkDialog.value = {
      url: "",
      text: "",
      isEdit: false,
      submit: vi.fn(),
      convertToText: vi.fn(),
      cancel,
    };

    await activateTab(tabs.value[0].id);

    expect(linkDialog.value).toBeNull();
    expect(cancel).toHaveBeenCalled();
  });

  it("marks a change the leaving tab gets as it leaves as unsaved", async () => {
    await boot();
    await openPaths(["/a.md", "/b.md"]);
    // the header strip keeps what was typed into it as the tab leaves
    bandEditorDone.value = () => {
      bandEditorDone.value = null;
      view.dispatch(view.state.tr.insertText("x", 1));
    };

    await activateTab(tabs.value[1].id);

    expect(tabs.value[2]).toMatchObject({ path: "/b.md", unsaved: true });
  });

  it("tells screen readers which tab is shown", async () => {
    await boot();
    await openPaths(["/a.md"]);
    await type("changed ");
    await openPaths(["/b.md"]);

    await activateTab(tabs.value[1].id);

    expect(announcement.value).toMatchObject({
      text: "a, tab 2 of 3, unsaved changes",
      quiet: true,
    });
    expect(tabSwitch.value?.id).toBe(tabs.value[1].id);
  });

  it("cycles round, showing only the last of quick switches", async () => {
    await boot();
    await openPaths(["/a.md", "/b.md"]);
    const shown: string[] = [];
    const updateState = view.updateState;
    view.updateState = (next) => {
      shown.push(next.doc.textContent);
      updateState(next);
    };

    void cycleTab(1);
    await cycleTab(1);

    expect(shown).toEqual(["A"]);
    expect(activeTabId.value).toBe(tabs.value[1].id);
  });
});

describe("unsaved changes", () => {
  beforeEach(() => {
    files["/a.md"] = "A";
  });

  it("follow the document, so undo back to the saved text clears them", async () => {
    await boot();
    await openPaths(["/a.md"]);
    expect(activeTab.value?.unsaved).toBe(false);

    await type("x");
    expect(activeTab.value?.unsaved).toBe(true);

    undo(view.state, view.dispatch);
    await nextTick();
    expect(activeTab.value?.unsaved).toBe(false);
  });

  it("are cleared by saving, which moves an untitled tab to its file", async () => {
    vi.mocked(save).mockResolvedValue("/new.md");
    await boot();
    await openNewTab();
    await type("draft");
    const id = activeTabId.value!;

    expect(await saveTab(id, {})).toBe(true);

    expect(writeTextFile).toHaveBeenCalledWith("/new.md", "draft");
    expect(activeTab.value).toMatchObject({
      path: "/new.md",
      untitledNumber: null,
      unsaved: false,
    });
    expect(path.value).toBe("/new.md");
  });

  it("close another clean tab of the file saved to", async () => {
    files["/b.md"] = "B";
    vi.mocked(save).mockResolvedValue("/b.md");
    await boot();
    await openPaths(["/b.md"]);
    await openNewTab();
    await type("new");

    await saveTab(activeTabId.value!, {});

    expect(labels()).toEqual([null, "/b.md"]);
    expect(activeTab.value?.untitledNumber).toBeNull();
    // the tab replaced isn't one to open again
    await reopenTab();
    expect(labels()).toEqual([null, "/b.md"]);
  });
});

describe("closing", () => {
  beforeEach(() => {
    files["/a.md"] = "A";
    files["/b.md"] = "B";
    files["/c.md"] = "C";
  });

  it("shows the tab to the right, or else the left", async () => {
    await boot();
    await openPaths(["/a.md", "/b.md", "/c.md"]);
    await activateTab(tabs.value[2].id);

    await closeTabs([activeTabId.value!]);
    expect(path.value).toBe("/c.md");

    await closeTabs([activeTabId.value!]);
    expect(path.value).toBe("/a.md");
  });

  it("leaves a new Untitled after the last tab", async () => {
    await boot();

    await closeTabs([activeTabId.value!]);

    expect(tabs.value).toHaveLength(1);
    expect(activeTab.value).toMatchObject({ untitledNumber: 1 });
    expect(text()).toBe("");
  });

  it("asks before closing a tab with changes, and keeps it on Cancel", async () => {
    await boot();
    await openPaths(["/a.md"]);
    await type("x");

    const closing = closeTabs([activeTabId.value!]);
    await flushPromises();
    expect(unsavedDialog.value?.label).toBe("a");
    unsavedDialog.value?.cancel();
    await closing;

    expect(labels()).toEqual([null, "/a.md"]);
  });

  it("drops the changes on Don't save", async () => {
    await boot();
    await openPaths(["/a.md"]);
    await type("x");

    const closing = closeTabs([activeTabId.value!]);
    await flushPromises();
    unsavedDialog.value?.discard();
    await closing;

    expect(labels()).toEqual([null]);
    expect(writeTextFile).not.toHaveBeenCalled();
  });

  it("saves first on Save, and stays open when the save is cancelled", async () => {
    vi.mocked(save).mockResolvedValue(null);
    await boot();
    await openNewTab();
    await type("draft");

    const closing = closeTabs([activeTabId.value!]);
    await flushPromises();
    unsavedDialog.value?.save();
    await closing;

    expect(tabs.value).toHaveLength(2);
  });

  it("asks for each tab in turn and stops at Cancel", async () => {
    await boot();
    await openPaths(["/a.md"]);
    await type("x");
    await openPaths(["/b.md"]);
    await type("y");
    await openPaths(["/c.md"]);

    const closing = closeTabs(tabs.value.map((tab) => tab.id));
    await flushPromises();
    expect(unsavedDialog.value?.label).toBe("a");
    unsavedDialog.value?.discard();
    await flushPromises();
    expect(unsavedDialog.value?.label).toBe("b");
    unsavedDialog.value?.cancel();
    await closing;

    expect(labels()).toEqual(["/b.md", "/c.md"]);
  });

  it("reopens the file just closed, even when asked right away", async () => {
    await boot();
    await openPaths(["/a.md", "/b.md"]);

    void closeTabs([activeTabId.value!]);
    await reopenTab();

    expect(labels()).toEqual([null, "/a.md", "/b.md"]);
  });

  it("reopens closed files, the last one first", async () => {
    await boot();
    await openPaths(["/a.md", "/b.md"]);
    await closeTabs(tabs.value.slice(1).map((tab) => tab.id));

    await reopenTab();
    expect(labels()).toEqual([null, "/b.md"]);
    await reopenTab();
    expect(labels()).toEqual([null, "/b.md", "/a.md"]);
  });
});

describe("moving", () => {
  it("moves a tab up to the ends of the row", async () => {
    files["/a.md"] = "A";
    await boot();
    await openPaths(["/a.md"]);
    const id = activeTabId.value!;

    await moveTab(id, -1);
    expect(labels()).toEqual(["/a.md", null]);
    await moveTab(id, -1);
    expect(labels()).toEqual(["/a.md", null]);
    await moveTab(id, 5);
    expect(labels()).toEqual([null, "/a.md"]);
  });
});
