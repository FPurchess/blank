import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { language, spellcheck, spellchecker, spellcheckStatus } from "../state";
import { deferred, flushPromises } from "../test/async";
import * as ipc from "./ipc";
import { bootSpellcheck, languageName, matchCase, update } from "./service";
import type { SpellcheckStatus } from "./types";
import { readWords, writeWords } from "./userDictionary";

vi.mock("./ipc", () => ({
  status: vi.fn(),
  install: vi.fn(),
  load: vi.fn(),
  unload: vi.fn(),
  check: vi.fn(),
  suggest: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("./userDictionary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./userDictionary")>()),
  readWords: vi.fn(),
  writeWords: vi.fn(),
}));

const DICTIONARY = new Set(["house", "the", "tree"]);

const installed = { available: true, installed: true, outdated: false };

/**
 * statuses records the spell check statuses from now on
 */
const statuses = () => {
  const seen: SpellcheckStatus["state"][] = [];
  spellcheckStatus.subscribe((status) => seen.push(status.state));
  return seen;
};

const ready = async (tag = "en") => {
  language.value = tag;
  spellcheck.value = true;
  await update();
  return spellchecker.value!;
};

describe("spellcheck service", () => {
  beforeEach(() => {
    spellcheck.value = false;
    language.value = "en";
    spellchecker.value = null;
    vi.mocked(ipc.status).mockResolvedValue(installed);
    vi.mocked(ipc.install).mockResolvedValue();
    vi.mocked(ipc.load).mockResolvedValue();
    vi.mocked(ipc.unload).mockResolvedValue();
    vi.mocked(ipc.check).mockImplementation(async (words) =>
      words.map((word) => DICTIONARY.has(word)),
    );
    vi.mocked(ipc.suggest).mockResolvedValue([]);
    vi.mocked(ipc.add).mockResolvedValue();
    vi.mocked(ipc.remove).mockResolvedValue();
    vi.mocked(readWords).mockResolvedValue(["blank"]);
    vi.mocked(writeWords).mockResolvedValue();
  });

  describe("loading", () => {
    it("unloads the dictionary while spell check is off", async () => {
      await update();

      expect(spellcheckStatus.value).toEqual({ state: "off", tag: "en" });
      expect(spellchecker.value).toBeNull();
      expect(ipc.unload).toHaveBeenCalled();
    });

    it("loads the dictionary with the personal words", async () => {
      const seen = statuses();

      const checker = await ready("de-CH");

      expect(seen).toEqual(["loading", "ready"]);
      expect(spellcheckStatus.value).toEqual({ state: "ready", tag: "de-CH" });
      expect(readWords).toHaveBeenCalledWith("de");
      expect(ipc.load).toHaveBeenCalledWith("de-CH", ["blank"]);
      expect(checker.tag).toBe("de-CH");
      expect(ipc.install).not.toHaveBeenCalled();
    });

    it("downloads a dictionary that isn't installed", async () => {
      vi.mocked(ipc.status).mockResolvedValue({
        ...installed,
        installed: false,
      });
      vi.mocked(ipc.install).mockImplementation(async (_tag, onProgress) => {
        onProgress(50, 200);
        expect(spellcheckStatus.value).toEqual({
          state: "downloading",
          tag: "pl",
          progress: 0.25,
        });
        onProgress(200, 0);
      });
      const seen = statuses();

      await ready("pl");

      expect(ipc.install).toHaveBeenCalledWith("pl", expect.any(Function));
      expect(seen).toEqual([
        "downloading",
        "downloading",
        "downloading",
        "loading",
        "ready",
      ]);
    });

    it("reports a failed download", async () => {
      vi.mocked(ipc.status).mockResolvedValue({
        ...installed,
        installed: false,
      });
      vi.mocked(ipc.install).mockRejectedValue("Integrity");

      await ready("pl");

      expect(spellcheckStatus.value).toEqual({
        state: "error",
        tag: "pl",
        message: "Integrity",
      });
      expect(spellchecker.value).toBeNull();
      expect(sendNotification).toHaveBeenCalledWith(
        "Spell check for Polish failed: the downloaded dictionary is damaged",
      );
    });

    it("keeps an installed dictionary when its update fails", async () => {
      vi.mocked(ipc.status).mockResolvedValue({ ...installed, outdated: true });
      vi.mocked(ipc.install).mockRejectedValue(new Error("offline"));
      vi.spyOn(console, "warn").mockImplementation(() => {});

      await ready("pl");

      expect(ipc.install).toHaveBeenCalled();
      expect(spellcheckStatus.value.state).toBe("ready");
    });

    it("reports a language without a dictionary", async () => {
      vi.mocked(ipc.status).mockResolvedValue({
        available: false,
        installed: false,
        outdated: false,
      });

      await ready("fi");

      expect(spellcheckStatus.value).toEqual({
        state: "unavailable",
        tag: "fi",
      });
      expect(ipc.load).not.toHaveBeenCalled();
    });

    it("reports a dictionary that fails to load", async () => {
      vi.mocked(ipc.load).mockRejectedValue(new Error("Parse: broken"));

      await ready();

      expect(spellcheckStatus.value).toMatchObject({
        state: "error",
        message: "Parse: broken",
      });
      expect(sendNotification).toHaveBeenCalledWith(
        "Spell check for English failed: Parse: broken",
      );
    });

    it("only publishes the spell checker of the latest language", async () => {
      const first = deferred<typeof installed>();
      vi.mocked(ipc.status).mockReturnValueOnce(first.promise);

      spellcheck.value = true;
      language.value = "de";
      const stale = update();
      language.value = "fr";
      await update();
      first.resolve(installed);
      await stale;

      expect(spellchecker.value?.tag).toBe("fr");
      expect(ipc.load).toHaveBeenCalledTimes(1);
      expect(ipc.load).toHaveBeenCalledWith("fr", ["blank"]);
    });

    it("follows the spell check setting and the language once booted", async () => {
      bootSpellcheck();
      await flushPromises();
      expect(spellcheckStatus.value.state).toBe("off");

      spellcheck.value = true;
      await vi.waitFor(() => expect(spellchecker.value?.tag).toBe("en"));

      language.value = "de";
      await vi.waitFor(() => expect(spellchecker.value?.tag).toBe("de"));
    });
  });

  describe("checking", () => {
    it("checks words once and in batches", async () => {
      const checker = await ready();
      const words = Array.from({ length: 5001 }, (_, i) => `w${i}`);

      await checker.check([...words, "house", "house"]);
      await checker.check(["house"]);

      expect(ipc.check).toHaveBeenCalledTimes(2);
      expect(vi.mocked(ipc.check).mock.calls[0][0]).toHaveLength(5000);
      expect(checker.isCorrect("house")).toBe(true);
      expect(checker.isCorrect("w1")).toBe(false);
      expect(checker.isCorrect("unchecked")).toBeUndefined();
    });

    it("accepts the words of the personal dictionary in their forms", async () => {
      const checker = await ready();

      expect(checker.isCorrect("blank")).toBe(true);
      expect(checker.isCorrect("Blank")).toBe(true);
      expect(checker.isCorrect("BLANK")).toBe(true);
      expect(checker.userEntry("Blank")).toBe("blank");
      expect(checker.userEntry("house")).toBeUndefined();
    });

    it("drops the results of a previous language", async () => {
      const checker = await ready();
      const pending = deferred<boolean[]>();
      vi.mocked(ipc.check).mockReturnValueOnce(pending.promise);

      const check = checker.check(["house"]);
      await ready("de");
      pending.resolve([true]);
      await check;

      expect(checker.isCorrect("house")).toBeUndefined();
    });

    it("suggests in the case of the word", async () => {
      vi.mocked(ipc.suggest).mockImplementation(async (word) =>
        word === "teh" ? ["the", "tea"] : ["Eh", "Tea"],
      );
      const checker = await ready();

      expect(await checker.suggest("Teh")).toEqual(["The", "Tea", "Eh"]);
      expect(await checker.suggest("Teh")).toEqual(["The", "Tea", "Eh"]);
      expect(ipc.suggest).toHaveBeenCalledTimes(2);
    });

    it("asks again for suggestions that failed", async () => {
      vi.mocked(ipc.suggest).mockRejectedValueOnce(new Error("busy"));
      const checker = await ready();

      await expect(checker.suggest("hous")).rejects.toThrow("busy");
      await expect(checker.suggest("hous")).resolves.toEqual([]);
    });
  });

  describe("personal dictionary", () => {
    it("adds a word", async () => {
      const checker = await ready();

      await checker.addWord("Kubernetes");

      expect(ipc.add).toHaveBeenCalledWith("Kubernetes");
      expect(writeWords).toHaveBeenCalledWith("en", ["blank", "Kubernetes"]);
      // a new spell checker, so the text is checked again
      expect(spellchecker.value).not.toBe(checker);
      expect(spellchecker.value?.isCorrect("KUBERNETES")).toBe(true);
      expect(spellchecker.value?.isCorrect("kubernetes")).toBeUndefined();
    });

    it("doesn't add a word twice", async () => {
      const checker = await ready();

      await checker.addWord("blank");

      expect(ipc.add).not.toHaveBeenCalled();
    });

    it("removes a word", async () => {
      const checker = await ready();
      await checker.check(["house"]);

      await checker.removeWord("blank");

      expect(ipc.remove).toHaveBeenCalledWith("blank");
      expect(writeWords).toHaveBeenCalledWith("en", []);
      expect(spellchecker.value?.isCorrect("blank")).toBeUndefined();
      // other results may have depended on the word
      expect(spellchecker.value?.isCorrect("house")).toBeUndefined();

      await spellchecker.value!.removeWord("blank");
      expect(ipc.remove).toHaveBeenCalledTimes(1);
    });

    it("replaces a word", async () => {
      const checker = await ready();

      await checker.replaceWord("blank", "blanker");

      expect(ipc.remove).toHaveBeenCalledWith("blank");
      expect(ipc.add).toHaveBeenCalledWith("blanker");
      expect(writeWords).toHaveBeenCalledWith("en", ["blanker"]);
      expect(spellchecker.value?.userEntry("blanker")).toBe("blanker");

      await spellchecker.value!.replaceWord("blanker", "blanker");
      expect(ipc.add).toHaveBeenCalledTimes(1);
    });

    it("keeps changes for the session if the file can't be read", async () => {
      vi.mocked(readWords).mockResolvedValue(undefined);
      const checker = await ready();

      await checker.addWord("blank");

      expect(writeWords).not.toHaveBeenCalled();
      expect(spellchecker.value?.isCorrect("blank")).toBe(true);
      expect(sendNotification).toHaveBeenCalledWith(
        expect.stringContaining("only kept until Blank is closed"),
      );
    });

    it("reports a dictionary that can't be saved", async () => {
      vi.mocked(writeWords).mockRejectedValue(new Error("read-only"));
      const checker = await ready();

      await checker.addWord("tset");

      expect(sendNotification).toHaveBeenCalledWith(
        "Failed to save your dictionary: read-only",
      );
    });

    it("ignores changes to the dictionary of a previous language", async () => {
      const checker = await ready();
      await ready("de");

      await checker.addWord("tset");

      expect(ipc.add).not.toHaveBeenCalled();
    });
  });

  describe("helpers", () => {
    it.each([
      ["teh", "the", "the"],
      ["Teh", "the", "The"],
      ["TEH", "the", "THE"],
      ["I", "a", "A"],
    ])("matches the case of %j in %j", (word, suggestion, expected) => {
      expect(matchCase(word, suggestion)).toBe(expected);
    });

    it("names languages", () => {
      expect(languageName("de-CH")).toBe("Swiss High German");
      expect(languageName("not a tag")).toBe("not a tag");
    });
  });
});
