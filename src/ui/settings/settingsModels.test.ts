import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { config } from "../../config";
import type { Spellchecker } from "../../spellcheck/types";
import { spellchecker } from "../../state";
import { mockTauriPath, mockTextFiles } from "../../test/tauri";
import {
  dictionaryOf,
  dictionarySummary,
  validateWord,
} from "./dictionaryModel";
import { addMessage, entriesOf, scopes, validate } from "./replacementsModel";
import {
  autocorrectChange,
  filterEntries,
  hideAfterOptions,
  replacementsSummary,
} from "./settingsModel";

describe("hideAfterOptions", () => {
  it("offers typing only, 3 s and 10 s", () => {
    expect(hideAfterOptions(3).map((option) => option.label)).toEqual([
      "When typing",
      "Or after 3 s",
      "Or after 10 s",
    ]);
  });

  it("keeps another rest time in its place", () => {
    expect(hideAfterOptions(5).map((option) => option.value)).toEqual([
      0, 3, 5, 10,
    ]);
  });
});

describe("autocorrect", () => {
  it("says what a switch turned off", () => {
    expect(autocorrectChange("quotes", false)).toEqual({
      changes: [{ path: ["autocorrect", "quotes"], value: false }],
      message: "Typographic quotes off",
    });
  });

  it("counts the replacements of every language", () => {
    expect(replacementsSummary(config.value)).toBe(
      "Typed text Blank replaces for you",
    );
    const replace = { "*": { a: "b" } };
    expect(
      replacementsSummary({
        ...config.value,
        autocorrect: { ...config.value.autocorrect, replace },
      }),
    ).toBe("1 replacement");
  });
});

describe("replacements", () => {
  const withReplace = (replace: Record<string, Record<string, string>>) => ({
    ...config.value,
    autocorrect: { ...config.value.autocorrect, replace },
  });

  it("offers every language, the current one and those with some", () => {
    expect(
      scopes(withReplace({ "*": {}, de: {}, fr: { a: "b" } }), "en-GB").map(
        (scope) => scope.value,
      ),
    ).toEqual(["*", "en", "fr"]);
  });

  it("sorts them by what is typed", () => {
    expect(entriesOf(withReplace({ "*": { b: "2", a: "1" } }), "*")).toEqual([
      { key: "a", label: "1" },
      { key: "b", label: "2" },
    ]);
    expect(entriesOf(withReplace({}), "de")).toEqual([]);
  });

  it("wants both sides and no space in what is typed", () => {
    expect(validate("", "x")).toBe("Enter what you type and what it becomes.");
    expect(validate("a b", "x")).toBe("What you type can't contain spaces.");
    expect(validate("ab", "a b")).toBeUndefined();
  });

  it("says which replacement a new one replaces", () => {
    expect(addMessage("bg", "Blank")).toBe("bg now becomes Blank");
    expect(addMessage("bg", "Blank", "big")).toBe(
      "bg now becomes Blank instead of big",
    );
  });

  it("filters by either side", () => {
    const entries = [
      { key: "bg", label: "Blank group" },
      { key: "xx", label: "other" },
    ];
    expect(filterEntries(entries, "GROUP")).toEqual([entries[0]]);
    expect(filterEntries(entries, " ")).toEqual(entries);
  });
});

describe("dictionaryOf", () => {
  let files: Record<string, string>;
  const fake = (words: string[]): Spellchecker => {
    let entries = [...words];
    return {
      tag: "en-US",
      isCorrect: () => true,
      check: async () => {},
      suggest: async () => [],
      userEntry: () => undefined,
      words: () => entries,
      addWord: vi.fn(async (word: string) => {
        entries = [...entries, word];
        spellchecker.value = { ...spellchecker.value! };
      }),
      removeWord: vi.fn(async () => {}),
      replaceWord: async () => {},
    };
  };

  beforeEach(() => {
    mockTauriPath();
    files = mockTextFiles({
      "/config/dictionaries/en.txt": "zebra\nantelope\n",
    });
  });
  afterEach(() => {
    spellchecker.value = null;
  });

  it("reads the file while spell check is off", async () => {
    const dictionary = dictionaryOf("en");
    await dictionary.load();

    expect(dictionary.words.value).toEqual(["antelope", "zebra"]);
    expect(dictionarySummary(dictionary.words.value.length, "en")).toBe(
      "2 words in English",
    );
  });

  it("goes through the spell checker of its language, which saves", async () => {
    const checker = fake(["blank"]);
    spellchecker.value = checker;
    const dictionary = dictionaryOf("en-GB");

    await dictionary.add("mp3");
    await nextTick();

    expect(checker.addWord).toHaveBeenCalledWith("mp3");
    expect(dictionary.words.value).toEqual(["blank", "mp3"]);
    expect(files["/config/dictionaries/en.txt"]).toBe("zebra\nantelope\n");
  });

  it("writes the file of another language", async () => {
    spellchecker.value = fake([]);
    const dictionary = dictionaryOf("de");

    await dictionary.add("Haus");

    expect(files["/config/dictionaries/de.txt"]).toBe("Haus\n");
  });

  it("leaves a file alone it can't read", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    files["/config/dictionaries/en.txt"] = undefined as unknown as string;
    const dictionary = dictionaryOf("en");
    const read = await import("@tauri-apps/plugin-fs");
    vi.mocked(read.readTextFile).mockRejectedValue(new Error("denied"));
    vi.mocked(read.exists).mockResolvedValue(true);
    await dictionary.load();

    expect(dictionary.readOnly.value).toBe(true);
    await dictionary.add("word");
    expect(read.writeTextFile).not.toHaveBeenCalled();
  });

  it("wants one word that isn't in yet in any form", () => {
    expect(validateWord("two words", [])).toBe("Add one word at a time.");
    expect(validateWord("BLANK", ["blank"])).toBe(
      "BLANK is already in your dictionary.",
    );
    expect(validateWord("Blank", ["BLANK"])).toBeUndefined();
  });
});
