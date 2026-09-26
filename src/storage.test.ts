import { beforeEach, describe, expect, it, vi } from "vitest";
import localforage from "localforage";
import { EditorState } from "prosemirror-state";
import { schema } from "prosemirror-markdown";
import { Node } from "prosemirror-model";

import { getCurrentWindow } from "@tauri-apps/api/window";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { doc, h, p } from "./test/editor";
import { flushPromises } from "./test/async";

vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: vi.fn() }));

type CloseHandler = () => Promise<void>;
let closeHandler: CloseHandler | undefined;

/**
 * bootFresh boots storage against freshly imported state observables, so no
 * subscriptions leak between tests.
 */
const bootFresh = async () => {
  vi.resetModules();
  const state = await import("./state");
  const storage = await import("./storage");
  await storage.bootStorage();
  return { ...state, ...storage };
};

describe("storage", () => {
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

  describe("language", () => {
    it("restores a stored language", async () => {
      await localforage.setItem("language", "pt");

      const { language } = await bootFresh();

      expect(language.value).toBe("pt");
    });

    it.each([
      ["de-AT", "de"],
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

    it("always stores the path together with the document", async () => {
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
        "doc",
        "path",
        "doc",
        "path",
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

      expect(restored?.eq(stored)).toBe(true);
    });
  });

  describe("unavailable storage", () => {
    it("notifies and neither restores nor persists anything", async () => {
      await localforage.setItem("doc", doc(p("stored")).toJSON());
      await localforage.setItem("path", "/stored.md");
      vi.spyOn(localforage, "ready").mockRejectedValue(new Error("no idb"));
      const setItem = vi.spyOn(localforage, "setItem");
      vi.spyOn(console, "error").mockImplementation(() => {});

      const { path, getDocumentFromStorage, getPathfromStorage } =
        await bootFresh();
      path.value = "/other.md";
      await flushPromises();

      expect(sendNotification).toHaveBeenCalledWith(
        expect.stringContaining("no idb"),
      );
      expect(setItem).not.toHaveBeenCalled();
      expect(await getDocumentFromStorage()).toBeUndefined();
      expect(await getPathfromStorage()).toBeUndefined();
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
