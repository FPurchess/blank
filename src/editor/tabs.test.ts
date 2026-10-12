import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import localforage from "localforage";
import { EditorState } from "prosemirror-state";
import { history, undo } from "prosemirror-history";
import { nextTick, shallowRef } from "vue";

import { save } from "@tauri-apps/plugin-dialog";
import { exists, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { schema } from "../markdown";
import { closePdf, openPdf } from "../pdf/ipc";
import { changeStamps, resetStampBooks, stampsOf } from "../pdf/stampBooks";
import { type Stamp, stampSpec } from "../pdf/stampModel";
import {
  activeTab,
  activeTabId,
  announcement,
  bandEditorDone,
  closeDialog,
  importedFrom,
  linkDialog,
  path,
  recentFiles,
  shownPdf,
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
  changeTab,
  closeTabs,
  cycleTab,
  moveTab,
  openNewTab,
  openPaths,
  reopenPdf,
  showPdfProblem,
  reopenTab,
  restoreTabs,
  saveTab,
} from "./tabs";

vi.mock("../pdf/ipc", async (original) => ({
  ...(await original<typeof import("../pdf/ipc")>()),
  openPdf: vi.fn(),
  closePdf: vi.fn(),
}));

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
  list: {
    id: string;
    path?: string;
    unsaved?: boolean;
    text?: string;
    kind?: "pdf";
  }[],
) => {
  await localforage.setItem("session", {
    version: 1,
    order: list.map(({ id }) => id),
    active: list[list.length - 1].id,
    tabs: Object.fromEntries(
      list.map(({ id, path = null, unsaved = false, kind }) => [
        id,
        {
          ...(kind ? { kind } : {}),
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
  vi.mocked(closePdf).mockResolvedValue();
  resetStampBooks();
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

  it("remembers the files it opened, newest first", async () => {
    recentFiles.value = [];
    await boot();
    await openPaths(["/a.md", "/b.md"]);
    expect(recentFiles.value).toEqual(["/b.md", "/a.md"]);
    // opening one again counts too
    await openPaths(["/a.md"]);
    expect(recentFiles.value).toEqual(["/a.md", "/b.md"]);
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

describe("changing a tab", () => {
  beforeEach(() => {
    files["/a.md"] = "A";
    files["/b.md"] = "B";
  });

  // appends text to the end of a tab's first paragraph
  const append = (typed: string) => (state: EditorState) =>
    state.tr.insertText(typed, state.doc.firstChild!.nodeSize - 1);

  it("changes the shown tab in the view", async () => {
    await boot();
    await openPaths(["/a.md"]);

    await changeTab(activeTabId.value!, append(" changed"));

    expect(text()).toBe("A changed");
    expect(activeTab.value?.unsaved).toBe(true);
  });

  it("changes a tab that isn't shown, which undoes it once shown", async () => {
    await boot();
    await openPaths(["/a.md", "/b.md"]);
    const a = tabs.value.find((tab) => tab.path === "/a.md")!;

    await changeTab(a.id, append(" changed"));

    expect(text()).toBe("B");
    expect(tabs.value.find((tab) => tab.id === a.id)?.unsaved).toBe(true);
    await activateTab(a.id);
    expect(text()).toBe("A changed");
    undo(view.state, view.dispatch);
    expect(text()).toBe("A");
  });

  it("leaves a closed tab alone", async () => {
    await boot();
    await openPaths(["/a.md", "/b.md"]);
    const a = tabs.value.find((tab) => tab.path === "/a.md")!;
    await closeTabs([a.id]);
    const change = vi.fn(append(" changed"));

    await changeTab(a.id, change);

    expect(change).not.toHaveBeenCalled();
    expect(text()).toBe("B");
  });

  it("does nothing when nothing changes", async () => {
    await boot();
    await openPaths(["/a.md", "/b.md"]);
    const a = tabs.value.find((tab) => tab.path === "/a.md")!;

    await changeTab(a.id, () => null);

    expect(tabs.value.find((tab) => tab.id === a.id)?.unsaved).toBe(false);
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
    expect(recentFiles.value[0]).toBe("/new.md");
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

  it("gives the text the focus back once the question is answered", async () => {
    files["/b.md"] = "B";
    await boot();
    await openPaths(["/a.md", "/b.md"]);
    await type("x");
    const focus = vi.spyOn(view, "focus");

    // as the dialog closes: its request goes first, then the answer
    const closing = closeTabs(tabs.value.map((tab) => tab.id));
    await flushPromises();
    expect(focus).not.toHaveBeenCalled();
    closeDialog(unsavedDialog, unsavedDialog.value!.discard);
    await closing;

    expect(focus).toHaveBeenCalledOnce();
    // every tab closed, a new Untitled is left
    expect(labels()).toEqual([1]);
  });

  it("leaves the focus to a part of the UI that holds it", async () => {
    await boot();
    await openPaths(["/a.md"]);
    await type("x");
    const focus = vi.spyOn(view, "focus");

    const closing = closeTabs([activeTabId.value!]);
    await flushPromises();
    // another dialog is open by then
    linkDialog.value = {
      url: "",
      text: "",
      isEdit: false,
      submit: () => {},
      convertToText: () => {},
      cancel: () => {},
    };
    closeDialog(unsavedDialog, unsavedDialog.value!.cancel);
    await closing;

    expect(focus).not.toHaveBeenCalled();
    linkDialog.value = null;
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

describe("PDF tabs", () => {
  // what opening a PDF finds, by its path
  const pdfs: Record<string, string> = { "/c.pdf": "c1", "/moved/c.pdf": "c2" };

  beforeEach(() => {
    files["/a.md"] = "A";
    for (const file of Object.keys(pdfs)) files[file] = "%PDF";
    vi.mocked(openPdf).mockImplementation(async (_tab, file) => {
      if (!(file in pdfs)) throw "damaged";
      return {
        sha256: pdfs[file],
        pages: [{ width: 595, height: 842, rotation: 0 }],
        repaired: false,
        encrypted: false,
      };
    });
  });

  it("opens a PDF in a tab of its own, which holds no text", async () => {
    await boot();
    await openPaths(["/c.pdf"]);

    expect(activeTab.value).toMatchObject({ kind: "pdf", path: "/c.pdf" });
    expect(openPdf).toHaveBeenCalledWith(activeTabId.value, "/c.pdf");
    expect(shownPdf.value?.opened?.sha256).toBe("c1");
    // nothing that saves or exports markdown sees its path
    expect(path.value).toBeNull();
    await type("typed");
    expect(text()).toBe("");
    expect(activeTab.value?.unsaved).toBe(false);
  });

  it("says in its tab why it can't open a PDF", async () => {
    files["/broken.pdf"] = "x";
    await boot();
    await openPaths(["/broken.pdf"]);
    await flushPromises();

    expect(activeTab.value).toMatchObject({ kind: "pdf" });
    expect(shownPdf.value).toMatchObject({ opened: null, problem: "damaged" });
  });

  it("opens a PDF from the command line without waiting for its helper", async () => {
    let opened = () => {};
    vi.mocked(openPdf).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          opened = () =>
            resolve({
              sha256: "c1",
              pages: [{ width: 595, height: 842, rotation: 0 }],
              repaired: false,
              encrypted: false,
            });
        }),
    );
    await boot();
    await openPaths(["/c.pdf"]);
    // the tabs' queue goes on meanwhile
    await openPaths(["/a.md"]);
    expect(tabs.value).toHaveLength(3);

    await activateTab(tabs.value.find((tab) => tab.kind === "pdf")!.id);
    expect(shownPdf.value).toMatchObject({ opened: null, problem: null });
    opened();
    await flushPromises();
    expect(shownPdf.value?.opened?.sha256).toBe("c1");
  });

  it("shows a problem printing found, with what the tab offers then", async () => {
    await boot();
    await openPaths(["/c.pdf"]);
    await flushPromises();

    showPdfProblem(activeTabId.value!, "changed");

    expect(shownPdf.value).toMatchObject({ opened: null, problem: "changed" });
  });

  it("shows a markdown tab's document again after a PDF tab", async () => {
    await boot();
    await openPaths(["/a.md", "/c.pdf"]);

    await activateTab(tabs.value[1].id);

    expect(shownPdf.value).toBeNull();
    expect(path.value).toBe("/a.md");
    expect(text()).toBe("A");
  });

  it("brings a PDF tab back, reading its file again, or saying it went", async () => {
    await stored([
      { id: "a", kind: "pdf", path: "/c.pdf" },
      { id: "b", kind: "pdf", path: "/gone.pdf" },
    ]);

    await boot();
    expect(shownPdf.value).toMatchObject({
      path: "/gone.pdf",
      problem: "missing",
    });
    expect(tabs.value).toHaveLength(2);

    await activateTab("a");
    expect(shownPdf.value?.opened?.sha256).toBe("c1");
  });

  it("starts while a restored PDF tab still opens, and shows it once open", async () => {
    let opened = () => {};
    vi.mocked(openPdf).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          opened = () =>
            resolve({
              sha256: "c1",
              pages: [{ width: 595, height: 842, rotation: 0 }],
              repaired: false,
              encrypted: false,
            });
        }),
    );
    await stored([{ id: "a", kind: "pdf", path: "/c.pdf" }]);

    await boot();
    expect(shownPdf.value).toMatchObject({ opened: null, problem: null });

    opened();
    await flushPromises();
    expect(shownPdf.value?.opened?.sha256).toBe("c1");
  });

  it("opens a PDF again from where the user found it", async () => {
    await stored([{ id: "a", kind: "pdf", path: "/c-old.pdf" }]);
    await boot();

    await reopenPdf("a", "/moved/c.pdf");
    expect(shownPdf.value).toMatchObject({ opened: null, problem: null });
    await flushPromises();

    expect(activeTab.value?.path).toBe("/moved/c.pdf");
    expect(shownPdf.value).toMatchObject({
      problem: null,
      opened: { sha256: "c2" },
    });
  });

  it("shows the tab of a found PDF that is open already", async () => {
    await stored([
      { id: "a", kind: "pdf", path: "/gone.pdf" },
      { id: "b", kind: "pdf", path: "/c.pdf" },
    ]);
    await boot();
    await activateTab("a");

    await reopenPdf("a", "/c.pdf");

    expect(activeTabId.value).toBe("b");
    expect(tabs.value.find((tab) => tab.id === "a")?.path).toBe("/gone.pdf");
  });

  it("leaves a PDF tab alone when asked to change its text", async () => {
    await boot();
    await openPaths(["/c.pdf"]);
    const change = vi.fn();

    await changeTab(activeTabId.value!, change);

    expect(change).not.toHaveBeenCalled();
    expect(activeTab.value?.unsaved).toBe(false);
  });

  it("stops the helper of a PDF tab it closes", async () => {
    await boot();
    await openPaths(["/c.pdf"]);
    const id = activeTabId.value!;

    await closeTabs([id]);

    expect(closePdf).toHaveBeenCalledWith(id);
    expect(shownPdf.value).toBeNull();
  });

  const stamp = (over: Partial<Stamp> = {}): Stamp => ({
    id: "s1",
    kind: "signature",
    page: 0,
    rect: [100, 100, 180, 60],
    natural: [180, 60],
    spec: stampSpec("signature"),
    ...over,
  });

  it("has unsaved changes while stamps are placed on it", async () => {
    await boot();
    await openPaths(["/c.pdf"]);
    const id = activeTabId.value!;

    changeStamps(id, [stamp()]);
    await nextTick();
    expect(activeTab.value?.unsaved).toBe(true);

    changeStamps(id, []);
    await nextTick();
    expect(activeTab.value?.unsaved).toBe(false);
  });

  it("asks to sign a PDF with stamps before it closes", async () => {
    await boot();
    await openPaths(["/c.pdf"]);
    const id = activeTabId.value!;
    changeStamps(id, [stamp()]);
    await nextTick();

    void closeTabs([id]);
    await flushPromises();
    expect(unsavedDialog.value).toMatchObject({
      title: "Sign “c” before you close it?",
      text: "What you placed on its pages is lost when you close it without signing.",
      saveLabel: "Sign…",
      discardLabel: "Discard",
    });
    // Sign… keeps it open, to sign it
    unsavedDialog.value!.save();
    await flushPromises();
    expect(tabs.value.some((tab) => tab.id === id)).toBe(true);
    expect(announcement.value).not.toBeNull();

    void closeTabs([id]);
    await flushPromises();
    unsavedDialog.value!.discard();
    await flushPromises();
    expect(tabs.value.some((tab) => tab.id === id)).toBe(false);
    expect(stampsOf(id)).toEqual([]);
  });

  it("brings back the stamps of a restored PDF tab once it opens", async () => {
    await stored([{ id: "a", kind: "pdf", path: "/c.pdf", unsaved: true }]);
    await localforage.setItem("stamps:a", {
      sha256: "c1",
      stamps: [stamp()],
      viewAnchor: null,
    });

    await boot();
    await flushPromises();

    expect(stampsOf("a")).toEqual([stamp()]);
    expect(activeTab.value?.unsaved).toBe(true);
  });

  it("drops the stamps on pages a changed PDF no longer has", async () => {
    await stored([{ id: "a", kind: "pdf", path: "/c.pdf", unsaved: true }]);
    await localforage.setItem("stamps:a", {
      sha256: "older",
      stamps: [stamp(), stamp({ id: "far", page: 3 })],
      viewAnchor: null,
    });

    await boot();
    await flushPromises();

    expect(stampsOf("a").map((one) => one.id)).toEqual(["s1"]);
    expect(announcement.value?.text).toBe(
      "c.pdf changed since you last had it open; 1 stamp was on pages it no longer has",
    );
  });
});
