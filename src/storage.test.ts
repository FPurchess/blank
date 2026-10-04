import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import localforage from "localforage";
import { EditorState } from "prosemirror-state";
import { schema } from "./markdown";
import { Node } from "prosemirror-model";

import { mockIPC } from "@tauri-apps/api/mocks";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { doc, docWithFrontmatter, h, p } from "./test/editor";
import { deferred, flushPromises } from "./test/async";

vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: vi.fn() }));

type CloseHandler = () => Promise<void>;
let closeHandler: CloseHandler | undefined;

// stops the state the last bootFresh started
let disposeState = () => {};

/**
 * bootFresh boots the state and then storage, as main.ts does, against freshly
 * imported state, so no watchers leak between tests.
 */
const bootFresh = async () => {
  disposeState();
  vi.resetModules();
  const state = await import("./state");
  disposeState = state.bootState();
  const storage = await import("./storage");
  await storage.bootStorage();
  return { ...state, ...storage };
};

describe("storage", () => {
  // The first import of the state graph (markdown-it, ProseMirror, every
  // state module) transforms them, about 200 ms here and many times that on
  // a loaded machine. bootFresh imports them again after vi.resetModules,
  // which only evaluates them, so pay the first import once, here, with a
  // timeout of its own, rather than in whichever test runs first.
  beforeAll(async () => {
    await Promise.all([import("./state"), import("./storage")]);
  }, 60_000);

  beforeEach(async () => {
    await localforage.clear();
    closeHandler = undefined;
    vi.mocked(getCurrentWindow).mockReturnValue({
      onCloseRequested: vi.fn(async (handler: CloseHandler) => {
        closeHandler = handler;
        return () => {};
      }),
    } as unknown as ReturnType<typeof getCurrentWindow>);
  });

  it("lets E2E tests store what is pending, as closing the window does", async () => {
    const storage = await bootFresh();
    storage.exposeStorage();
    expect(
      (window as unknown as { blankFlushStorage: unknown }).blankFlushStorage,
    ).toBe(storage.flush);
  });

  describe("theme", () => {
    it("restores a stored theme", async () => {
      await localforage.setItem("theme", "green");

      const { theme } = await bootFresh();

      expect(theme.value).toBe("green");
      expect(document.body.dataset.theme).toBe("green");
    });

    it.each([
      ["nothing is stored", null],
      ["the stored theme is unknown", "neon"],
    ])("falls back to the first theme when %s", async (_, stored) => {
      await localforage.setItem("theme", stored);

      const { theme, themes } = await bootFresh();

      expect(theme.value).toBe(themes[0]);
    });

    it("persists theme changes", async () => {
      const { theme } = await bootFresh();

      theme.value = "blue";
      await flushPromises();

      expect(await localforage.getItem("theme")).toBe("blue");
    });
  });

  describe("spellcheck", () => {
    it("is off on first start", async () => {
      const { spellcheck } = await bootFresh();

      expect(spellcheck.value).toBe(false);
    });

    it.each([
      [true, true],
      [false, false],
      ["yes", false],
    ])("restores the stored value %j as %j", async (stored, expected) => {
      await localforage.setItem("spellcheck", stored);

      const { spellcheck } = await bootFresh();

      expect(spellcheck.value).toBe(expected);
    });

    it("stores the setting", async () => {
      const { spellcheck } = await bootFresh();

      spellcheck.value = true;

      await vi.waitFor(async () =>
        expect(await localforage.getItem("spellcheck")).toBe(true),
      );
    });
  });

  describe("page view", () => {
    it("shows the page ends on first start and keeps the choice", async () => {
      const { pageView } = await bootFresh();
      expect(pageView.value).toBe("page-ends");

      pageView.value = "pages";

      await vi.waitFor(async () =>
        expect(await localforage.getItem("pageView")).toBe("pages"),
      );
      const restarted = await bootFresh();
      expect(restarted.pageView.value).toBe("pages");
    });

    it("ignores a stored value it doesn't know", async () => {
      await localforage.setItem("pageView", "scroll");

      const { pageView } = await bootFresh();

      expect(pageView.value).toBe("page-ends");
    });
  });

  describe("blocks pane", () => {
    it("is closed on first start and keeps the choice", async () => {
      const { blocksPaneOpen } = await bootFresh();
      expect(blocksPaneOpen.value).toBe(false);

      blocksPaneOpen.value = true;

      await vi.waitFor(async () =>
        expect(await localforage.getItem("blocksPane")).toBe(true),
      );
      const restarted = await bootFresh();
      expect(restarted.blocksPaneOpen.value).toBe(true);
    });
  });

  describe("outline", () => {
    it("is closed on first start and keeps the choice", async () => {
      const { outlinePinned } = await bootFresh();
      expect(outlinePinned.value).toBe(false);

      outlinePinned.value = true;

      await vi.waitFor(async () =>
        expect(await localforage.getItem("outline")).toBe(true),
      );
      const restarted = await bootFresh();
      expect(restarted.outlinePinned.value).toBe(true);
    });

    it("ignores a stored value it doesn't know", async () => {
      await localforage.setItem("outline", "open");

      const { outlinePinned } = await bootFresh();

      expect(outlinePinned.value).toBe(false);
    });
  });

  describe("language", () => {
    it("restores a stored regional language", async () => {
      await localforage.setItem("language", "de-CH");

      const { language } = await bootFresh();

      expect(language.value).toBe("de-CH");
    });

    it("restores a stored language", async () => {
      await localforage.setItem("language", "pt");

      const { language } = await bootFresh();

      expect(language.value).toBe("pt");
    });

    it.each([
      ["de-AT", "de-AT"],
      ["de-DE", "de"],
      ["en-US", "en"],
      ["fr", "fr"],
      ["xx-YY", "en"],
      ["", "en"],
    ])(
      "detects and stores the system language %j on first start",
      async (system, expected) => {
        vi.spyOn(navigator, "language", "get").mockReturnValue(system);

        const { language } = await bootFresh();

        expect(language.value).toBe(expected);
        expect(await localforage.getItem("language")).toBe(expected);
      },
    );

    it("detects the system language when the stored one is invalid", async () => {
      await localforage.setItem("language", "klingon");
      vi.spyOn(navigator, "language", "get").mockReturnValue("sv-SE");

      const { language } = await bootFresh();

      expect(language.value).toBe("sv");
    });

    it("persists language changes", async () => {
      const { language } = await bootFresh();

      language.value = "it";
      await flushPromises();

      expect(await localforage.getItem("language")).toBe("it");
    });
  });

  describe("tabs and their documents", () => {
    const state = EditorState.create({ schema, doc: doc(p("draft")) });
    const replace = (node: ReturnType<typeof doc>) =>
      state.tr.replaceWith(0, state.doc.content.size, node);
    const tab = (id: string, path: string | null = null) => ({
      id,
      path,
      importedFrom: null,
      untitledNumber: path === null ? 1 : null,
      unsaved: false,
      viewAnchor: null,
    });

    /**
     * text returns the text of the stored document of the tab `id`
     */
    const text = async (id: string) => {
      const stored = await localforage.getItem(`tab:${id}`);
      return stored ? Node.fromJSON(schema, stored).textContent : undefined;
    };

    /**
     * open boots storage with the tabs `ids`, the first one active
     */
    const open = async (...ids: string[]) => {
      const storage = await bootFresh();
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      storage.tabs.value = ids.map((id) => tab(id));
      storage.activeTabId.value = ids[0];
      return storage;
    };

    const tick = async (ms = 1000) => {
      vi.advanceTimersByTime(ms);
      await flushPromises();
    };

    it("stores the active tab's document a second after the first change", async () => {
      const { transaction } = await open("a");

      transaction.value = replace(doc(p("first")));
      transaction.value = replace(doc(h(1, "Final"), p("text")));
      await tick(999);
      expect(await localforage.getItem("tab:a")).toBeNull();

      await tick(1);
      expect(await text("a")).toBe("Finaltext");
    });

    it("keeps storing while the user types without a pause", async () => {
      const { transaction } = await open("a");

      // a keystroke every 100ms for 3 seconds
      for (let i = 1; i <= 30; i++) {
        transaction.value = replace(doc(p(`typed ${i}`)));
        await tick(100);
        if (i === 10) expect(await text("a")).toBe("typed 10");
        if (i === 20) expect(await text("a")).toBe("typed 20");
      }
      expect(await text("a")).toBe("typed 30");
    });

    it("stores each document under its own tab", async () => {
      const { transaction, activeTabId } = await open("a", "b");

      transaction.value = replace(doc(p("in a")));
      activeTabId.value = "b";
      transaction.value = replace(doc(p("in b")));
      await tick();

      expect(await text("a")).toBe("in a");
      expect(await text("b")).toBe("in b");
    });

    it("doesn't store a document again for a selection", async () => {
      const { transaction } = await open("a");
      const stored = replace(doc(p("text")));
      transaction.value = stored;
      await tick();
      const setItem = vi.spyOn(localforage, "setItem");

      const moved = EditorState.create({ schema, doc: stored.doc }).tr;
      transaction.value = moved;
      await tick();

      expect(setItem.mock.calls.map(([key]) => key)).not.toContain("tab:a");
    });

    it("stores a document a tab was opened with", async () => {
      const { storeDocument } = await open("a");

      storeDocument("b", doc(p("opened")));
      await tick();

      expect(await text("b")).toBe("opened");
    });

    it("stores the session after the documents it lists", async () => {
      const { transaction } = await open("a");
      const setItem = vi.spyOn(localforage, "setItem");

      transaction.value = replace(doc(p("a")));
      await tick();

      expect(setItem.mock.calls.map(([key]) => key)).toEqual([
        "tab:a",
        "session",
      ]);
      expect(await localforage.getItem("session")).toEqual({
        version: 1,
        order: ["a"],
        active: "a",
        tabs: { a: { ...tab("a"), id: undefined } },
      });
    });

    it("removes the document of a closed tab", async () => {
      const { transaction, tabs, activeTabId } = await open("a", "b");
      transaction.value = replace(doc(p("a")));
      activeTabId.value = "b";
      transaction.value = replace(doc(p("b")));
      await tick();

      tabs.value = [tab("b")];
      await tick();

      expect(await localforage.getItem("tab:a")).toBeNull();
      expect(await text("b")).toBe("b");
      expect(
        ((await localforage.getItem("session")) as { order: string[] }).order,
      ).toEqual(["b"]);
    });

    it("flush stores pending changes right away", async () => {
      const { transaction, flush } = await open("a");

      transaction.value = replace(doc(p("unsaved")));
      await flush();

      expect(await text("a")).toBe("unsaved");
    });

    it("flush does nothing without pending changes", async () => {
      const { flush } = await bootFresh();
      const setItem = vi.spyOn(localforage, "setItem");

      await flush();

      expect(setItem).not.toHaveBeenCalled();
    });

    it("flush waits for the settings changed before it", async () => {
      const { pageView, flush } = await bootFresh();
      const written = deferred();
      const setItem = localforage.setItem.bind(localforage);
      vi.spyOn(localforage, "setItem").mockImplementation(
        async (key, value) => {
          await written.promise;
          return setItem(key, value);
        },
      );
      let flushed = false;

      pageView.value = "pages";
      const flushing = flush().then(() => (flushed = true));
      await flushPromises();
      expect(flushed).toBe(false);

      written.resolve();
      await flushing;
      expect(await localforage.getItem("pageView")).toBe("pages");
    });

    it("stores pending changes and the session when the window closes", async () => {
      const { transaction } = await open("a");

      transaction.value = replace(doc(p("closing")));
      await closeHandler?.();

      expect(await text("a")).toBe("closing");
      expect(await localforage.getItem("session")).toMatchObject({
        active: "a",
      });
    });

    it("lets the window close when storing fails", async () => {
      const { transaction } = await open("a");
      const error = new Error("quota exceeded");
      vi.spyOn(localforage, "setItem").mockRejectedValue(error);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      transaction.value = replace(doc(p("closing")));
      await closeHandler?.();

      expect(warn).toHaveBeenCalledWith(error);
    });

    it("lets the window close when storing hangs", async () => {
      const { transaction } = await open("a");
      vi.spyOn(localforage, "setItem").mockReturnValue(new Promise(() => {}));

      transaction.value = replace(doc(p("closing")));
      let closed = false;
      const closing = closeHandler?.().then(() => (closed = true));
      await tick(999);
      expect(closed).toBe(false);

      vi.advanceTimersByTime(1);
      await closing;
      expect(closed).toBe(true);
    });

    it("boots without a window to listen to", async () => {
      vi.mocked(getCurrentWindow).mockImplementation(() => {
        throw new Error("no window");
      });
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      await bootFresh();

      expect(warn).toHaveBeenCalled();
    });

    it("returns undefined when a tab has no stored document", async () => {
      const { loadTabDocument } = await bootFresh();

      expect(await loadTabDocument("a")).toBeUndefined();
    });

    it("restores a stored document with its frontmatter", async () => {
      const stored = docWithFrontmatter("title: Stored", h(2, "Stored"));
      await localforage.setItem("tab:a", stored.toJSON());
      const { loadTabDocument } = await bootFresh();

      const restored = await loadTabDocument("a");

      // the module is imported again, and so is its schema
      expect(restored?.toJSON()).toEqual(stored.toJSON());
      expect(restored?.attrs.frontmatter).toBe("title: Stored");
    });

    it("backs up a stored document", async () => {
      await localforage.setItem("tab:a", { type: "broken" });
      const { backupTabDocument } = await bootFresh();

      expect(await backupTabDocument("a")).toBe(true);
      expect(await localforage.getItem("tab-backup:a")).toEqual({
        type: "broken",
      });
      expect(await backupTabDocument("missing")).toBe(false);
    });
  });

  describe("session", () => {
    const session = {
      version: 1,
      order: ["a", "b"],
      active: "b",
      tabs: {
        a: {
          path: "/a.md",
          importedFrom: null,
          untitledNumber: null,
          unsaved: false,
          viewAnchor: null,
        },
        b: {
          path: null,
          importedFrom: null,
          untitledNumber: 1,
          unsaved: true,
          viewAnchor: { page: 1, y: 20 },
        },
      },
    };

    it("loads the stored session", async () => {
      await localforage.setItem("session", session);
      const { loadSession } = await bootFresh();

      expect(await loadSession()).toEqual(session);
    });

    it("ignores an invalid session", async () => {
      await localforage.setItem("session", { ...session, active: "c" });
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const { loadSession } = await bootFresh();

      expect(await loadSession()).toBeNull();
    });

    it("turns the one document an earlier Blank stored into an unsaved tab", async () => {
      const stored = doc(p("from before"));
      await localforage.setItem("doc", stored.toJSON());
      await localforage.setItem("path", "/old.md");
      await localforage.setItem("importedFrom", null);
      const { loadSession } = await bootFresh();

      const migrated = await loadSession();

      const id = migrated!.active;
      expect(migrated).toEqual({
        version: 1,
        order: [id],
        active: id,
        tabs: {
          [id]: {
            path: "/old.md",
            importedFrom: null,
            untitledNumber: null,
            unsaved: true,
            viewAnchor: null,
          },
        },
      });
      expect(await localforage.getItem(`tab:${id}`)).toEqual(stored.toJSON());
      expect(await localforage.getItem("session")).toEqual(migrated);
      for (const key of ["doc", "path", "importedFrom"]) {
        expect(await localforage.getItem(key)).toBeNull();
      }
    });

    it("keeps the old document when the migration can't be written", async () => {
      await localforage.setItem("doc", doc(p("from before")).toJSON());
      const { loadSession } = await bootFresh();
      vi.spyOn(localforage, "setItem").mockRejectedValue(new Error("full"));

      await expect(loadSession()).rejects.toThrow("full");
      expect(await localforage.getItem("doc")).not.toBeNull();
    });

    it("has no session without anything stored", async () => {
      const { loadSession } = await bootFresh();

      expect(await loadSession()).toBeNull();
    });

    describe("when another Blank keeps it", () => {
      beforeEach(() => {
        mockIPC((cmd) => (cmd === "session_lock" ? false : undefined));
      });

      it("neither restores nor stores the tabs, and says so", async () => {
        await localforage.setItem("session", session);
        const { loadSession, transaction, tabs, activeTabId, flush } =
          await bootFresh();
        const setItem = vi.spyOn(localforage, "setItem");

        tabs.value = [{ id: "c", ...session.tabs.a }];
        activeTabId.value = "c";
        transaction.value = EditorState.create({ schema }).tr;
        await flush();

        expect(await loadSession()).toBeNull();
        expect(setItem).not.toHaveBeenCalled();
        expect(sendNotification).toHaveBeenCalledWith(
          "Blank is already open in another window, so this window won't remember its tabs",
        );
      });
    });
  });

  describe("unavailable storage", () => {
    it("notifies and neither restores nor persists anything", async () => {
      await localforage.setItem("session", { version: 1 });
      vi.spyOn(localforage, "ready").mockRejectedValue(new Error("no idb"));
      const setItem = vi.spyOn(localforage, "setItem");
      vi.spyOn(console, "error").mockImplementation(() => {});

      const { loadSession, loadTabDocument, storeDocument, flush } =
        await bootFresh();
      storeDocument("a", doc(p("text")));
      await flush();

      expect(sendNotification).toHaveBeenCalledWith(
        expect.stringContaining("no idb"),
      );
      expect(setItem).not.toHaveBeenCalled();
      expect(await loadSession()).toBeNull();
      expect(await loadTabDocument("a")).toBeUndefined();
    });
  });

  it("warns instead of failing when a value can't be stored", async () => {
    const { transaction, tabs, activeTabId } = await bootFresh();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const error = new Error("quota exceeded");
    vi.spyOn(localforage, "setItem").mockRejectedValue(error);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    tabs.value = [
      {
        id: "a",
        path: null,
        importedFrom: null,
        untitledNumber: 1,
        unsaved: false,
        viewAnchor: null,
      },
    ];
    activeTabId.value = "a";
    const state = EditorState.create({ schema, doc: doc(p("draft")) });
    transaction.value = state.tr.insertText("!");
    vi.advanceTimersByTime(1000);
    await flushPromises();

    expect(warn).toHaveBeenCalledWith(error);
  });
});

describe("restorable", () => {
  it("keeps a block of a type a newer Blank stored as a block it can't show", async () => {
    const { restorable } = await import("./storage");
    const stored = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "a" }] },
        { type: "future_block", attrs: { kind: "x" } },
      ],
    };
    const node = Node.fromJSON(schema, restorable(stored));
    expect(node.childCount).toBe(2);
    const raw = node.child(1).attrs.raw as string;
    expect(raw.split("\n")[0]).toBe(
      '<!-- blank:stored@1 type="future_block" -->',
    );
    expect(raw).toContain('"kind": "x"');
  });

  it("leaves a document it can open alone", async () => {
    const { restorable } = await import("./storage");
    const stored = doc(p("a")).toJSON();
    expect(restorable(stored)).toBe(stored);
  });
});
