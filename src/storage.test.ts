import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import localforage from "localforage";
import { EditorState } from "prosemirror-state";
import { schema } from "./markdown";
import { Node } from "prosemirror-model";

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

  describe("document and path", () => {
    const state = EditorState.create({ schema, doc: doc(p("draft")) });
    const replace = (node: ReturnType<typeof doc>) =>
      state.tr.replaceWith(0, state.doc.content.size, node);

    /**
     * stored returns the stored path and the text of the stored document
     */
    const stored = async () => ({
      path: await localforage.getItem("path"),
      text: (await localforage.getItem("doc"))
        ? Node.fromJSON(schema, await localforage.getItem("doc")).textContent
        : undefined,
    });

    it("stores the Word document an untitled document was imported from with it", async () => {
      const { transaction, importedFrom, getImportedFromStorage } =
        await bootFresh();
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

      transaction.value = replace(doc(p("imported")));
      importedFrom.value = "/docs/report.docx";
      vi.advanceTimersByTime(1000);
      await flushPromises();
      expect(await getImportedFromStorage()).toBe("/docs/report.docx");
      expect((await stored()).text).toBe("imported");

      importedFrom.value = null;
      vi.advanceTimersByTime(1000);
      await flushPromises();
      expect(await getImportedFromStorage()).toBeNull();
    });

    it("stores the latest document a second after the first change", async () => {
      const { transaction } = await bootFresh();
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

      transaction.value = replace(doc(p("first")));
      transaction.value = replace(doc(h(1, "Final"), p("text")));
      vi.advanceTimersByTime(999);
      await flushPromises();
      expect(await localforage.getItem("doc")).toBeNull();

      vi.advanceTimersByTime(1);
      await flushPromises();
      expect((await stored()).text).toBe("Finaltext");
    });

    it("keeps storing while the user types without a pause", async () => {
      const { transaction } = await bootFresh();
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

      // a keystroke every 100ms for 3 seconds
      for (let i = 1; i <= 30; i++) {
        transaction.value = replace(doc(p(`typed ${i}`)));
        vi.advanceTimersByTime(100);
        await flushPromises();
        if (i === 10) expect((await stored()).text).toBe("typed 10");
        if (i === 20) expect((await stored()).text).toBe("typed 20");
      }
      expect((await stored()).text).toBe("typed 30");
    });

    it("always stores the path (and imported Word document) together with the document", async () => {
      const { path, transaction } = await bootFresh();
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const setItem = vi.spyOn(localforage, "setItem");

      transaction.value = replace(doc(p("a")));
      vi.advanceTimersByTime(1000);
      await flushPromises();
      path.value = "/b.md";
      transaction.value = replace(doc(p("b")));
      vi.advanceTimersByTime(1000);
      await flushPromises();
      path.value = null;
      vi.advanceTimersByTime(1000);
      await flushPromises();

      expect(setItem.mock.calls.map(([key]) => key)).toEqual([
        "path",
        "importedFrom",
        "doc",
        "path",
        "importedFrom",
        "doc",
        "path",
        "importedFrom",
        "doc",
      ]);
      expect(await stored()).toEqual({ path: null, text: "b" });
    });

    it("doesn't store a new path before its document is known", async () => {
      await localforage.setItem("path", "/a.md");
      await localforage.setItem("doc", doc(p("a")).toJSON());
      const { path } = await bootFresh();
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

      path.value = "/b.md";
      vi.advanceTimersByTime(1000);
      await flushPromises();

      expect(await stored()).toEqual({ path: "/a.md", text: "a" });
    });

    it("flush stores pending changes right away", async () => {
      const { path, transaction, flush } = await bootFresh();
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

      path.value = "/b.md";
      transaction.value = replace(doc(p("unsaved")));
      await flush();

      expect(await stored()).toEqual({ path: "/b.md", text: "unsaved" });
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

    it("stores pending changes when the window closes", async () => {
      const { transaction } = await bootFresh();

      transaction.value = replace(doc(p("closing")));
      await closeHandler?.();

      expect((await stored()).text).toBe("closing");
    });

    it("lets the window close when storing fails", async () => {
      const { transaction } = await bootFresh();
      const error = new Error("quota exceeded");
      vi.spyOn(localforage, "setItem").mockRejectedValue(error);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      transaction.value = replace(doc(p("closing")));
      await closeHandler?.();

      expect(warn).toHaveBeenCalledWith(error);
    });

    it("lets the window close when storing hangs", async () => {
      const { transaction } = await bootFresh();
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      vi.spyOn(localforage, "setItem").mockReturnValue(new Promise(() => {}));

      transaction.value = replace(doc(p("closing")));
      let closed = false;
      const closing = closeHandler?.().then(() => (closed = true));
      vi.advanceTimersByTime(999);
      await flushPromises();
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

    it("returns undefined when no document is stored", async () => {
      const { getDocumentFromStorage } = await import("./storage");

      expect(await getDocumentFromStorage()).toBeUndefined();
    });

    it("restores a stored document", async () => {
      const stored = doc(h(2, "Stored"), p("content"));
      await localforage.setItem("doc", stored.toJSON());
      const { getDocumentFromStorage } = await import("./storage");

      const restored = await getDocumentFromStorage();

      // the module is imported again, and so is its schema
      expect(restored?.toJSON()).toEqual(stored.toJSON());
    });

    it("restores the frontmatter of a stored document", async () => {
      const stored = docWithFrontmatter("title: Stored", p("content"));
      await localforage.setItem("doc", stored.toJSON());
      const { getDocumentFromStorage } = await import("./storage");

      const restored = await getDocumentFromStorage();

      expect(restored?.attrs.frontmatter).toBe("title: Stored");
    });
  });

  describe("unavailable storage", () => {
    it("notifies and neither restores nor persists anything", async () => {
      await localforage.setItem("doc", doc(p("stored")).toJSON());
      await localforage.setItem("path", "/stored.md");
      vi.spyOn(localforage, "ready").mockRejectedValue(new Error("no idb"));
      const setItem = vi.spyOn(localforage, "setItem");
      vi.spyOn(console, "error").mockImplementation(() => {});

      const {
        path,
        getDocumentFromStorage,
        getPathfromStorage,
        getImportedFromStorage,
      } = await bootFresh();
      path.value = "/other.md";
      await flushPromises();

      expect(sendNotification).toHaveBeenCalledWith(
        expect.stringContaining("no idb"),
      );
      expect(setItem).not.toHaveBeenCalled();
      expect(await getDocumentFromStorage()).toBeUndefined();
      expect(await getPathfromStorage()).toBeUndefined();
      expect(await getImportedFromStorage()).toBeUndefined();
    });
  });

  it("warns instead of failing when a value can't be stored", async () => {
    const { transaction } = await bootFresh();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const error = new Error("quota exceeded");
    vi.spyOn(localforage, "setItem").mockRejectedValue(error);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

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
