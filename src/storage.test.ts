import { beforeEach, describe, expect, it, vi } from "vitest";
import localforage from "localforage";
import { EditorState } from "prosemirror-state";
import { schema } from "prosemirror-markdown";

import { doc, h, p } from "./test/editor";
import { flushPromises } from "./test/async";

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

  describe("path", () => {
    it("persists path changes", async () => {
      const { path, getPathfromStorage } = await bootFresh();

      path.value = "/notes.md";
      await flushPromises();
      expect(await getPathfromStorage()).toBe("/notes.md");

      path.value = null;
      await flushPromises();
      expect(await getPathfromStorage()).toBeNull();
    });
  });

  describe("document", () => {
    it("persists the latest document once edits pause for a second", async () => {
      const { transaction, getDocumentFromStorage } = await bootFresh();
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const state = EditorState.create({ schema, doc: doc(p("draft")) });
      const final = doc(h(1, "Final"), p("text"));

      transaction.value = state.tr.insertText("!");
      transaction.value = state.tr.replaceWith(
        0,
        state.doc.content.size,
        final,
      );
      vi.advanceTimersByTime(999);
      await flushPromises();
      expect(await getDocumentFromStorage()).toBeUndefined();

      vi.advanceTimersByTime(1);
      await flushPromises();
      expect((await getDocumentFromStorage())?.toJSON()).toEqual(
        final.toJSON(),
      );
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

  it("warns instead of failing when a value can't be stored", async () => {
    const { path } = await bootFresh();
    const error = new Error("quota exceeded");
    vi.spyOn(localforage, "setItem").mockRejectedValue(error);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    path.value = "/notes.md";
    await flushPromises();

    expect(warn).toHaveBeenCalledWith(error);
  });
});
