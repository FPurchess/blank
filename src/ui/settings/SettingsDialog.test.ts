import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";

import { bootConfig, CommandIdentifier as C, config } from "../../config";
import {
  announcement,
  language,
  settingsDialog,
  settingsSection,
  spellcheck,
  theme,
} from "../../state";
import { flushPromises } from "../../test/async";
import { createTestHandle } from "../../test/editor";
import { mockTauriPath, mockTextFiles } from "../../test/tauri";
import { bootApp } from "../mount";

vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn() }));

const CONFIG = "/config/blank.json";
const DICTIONARY = "/config/dictionaries/en.txt";

let dispose = () => {};
let files: Record<string, string>;
const defaults = config.value;

const dialog = () => document.querySelector<HTMLElement>("#settings-dialog");
const panel = () => document.querySelector<HTMLElement>("#settings-panel")!;
const written = () => JSON.parse(files[CONFIG] ?? "{}");
const button = (text: string, root: ParentNode = dialog()!) =>
  [...root.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === text,
  )!;
const tab = (key: string) =>
  document.querySelector<HTMLElement>(`#settings-tab-${key}`)!;
const row = (name: string) =>
  panel().querySelector<HTMLElement>(`[data-row="${name}"]`)!;
const keydown = (
  target: EventTarget,
  key: string,
  init: KeyboardEventInit = {},
  keyCode = 0,
) => {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  Object.defineProperty(event, "keyCode", { value: keyCode });
  target.dispatchEvent(event);
  return event;
};
const type = async (input: HTMLInputElement, text: string) => {
  input.value = text;
  input.dispatchEvent(new Event("input"));
  await nextTick();
};
const settle = async () => {
  await flushPromises();
  await nextTick();
};

const open = async (section?: Parameters<typeof showSection>[0]) => {
  settingsDialog.value = {};
  await settle();
  if (section) await showSection(section);
};
const showSection = async (
  key: "appearance" | "writing" | "spelling" | "shortcuts" | "about",
) => {
  tab(key).click();
  await settle();
};

beforeEach(async () => {
  document.body.innerHTML = "";
  vi.spyOn(navigator, "platform", "get").mockReturnValue("Linux x86_64");
  mockTauriPath();
  files = mockTextFiles();
  await bootConfig();
  settingsSection.value = "appearance";
  dispose = bootApp(createTestHandle());
});

afterEach(() => {
  dispose();
  settingsDialog.value = null;
  config.value = defaults;
  theme.value = "light";
  spellcheck.value = false;
  language.value = "en";
});

describe("the settings dialog", () => {
  it("opens on Appearance with the focus on its section", async () => {
    await open();

    expect(dialog()?.querySelector("h2")?.textContent).toBe("Settings");
    expect(document.activeElement).toBe(tab("appearance"));
    expect(tab("appearance").getAttribute("aria-selected")).toBe("true");
    expect(panel().getAttribute("aria-labelledby")).toBe(
      "settings-tab-appearance",
    );
    expect(dialog()?.textContent).toContain("Changes apply at once.");
  });

  it("moves between the sections with ↓ ↑ and opens on the last one", async () => {
    await open();
    keydown(tab("appearance"), "ArrowDown");
    await settle();

    expect(panel().dataset.section).toBe("writing");
    expect(document.activeElement).toBe(tab("writing"));

    button("Close").click();
    await settle();
    expect(settingsDialog.value).toBeNull();

    await open();
    expect(panel().dataset.section).toBe("writing");
    expect(document.activeElement).toBe(tab("writing"));
  });

  it("closes on Esc", async () => {
    await open();
    keydown(tab("appearance"), "Escape");
    await settle();

    expect(settingsDialog.value).toBeNull();
  });

  describe("Appearance", () => {
    it("draws every theme in its colors and chooses one", async () => {
      await open();
      const cards = [...panel().querySelectorAll<HTMLElement>(".theme-card")];

      expect(cards.map((card) => card.textContent?.trim())).toEqual([
        "Light",
        "Dark",
        "Black",
        "Red",
        "Green",
        "Blue",
      ]);
      expect(
        cards[1].querySelector(".preview")?.getAttribute("data-theme"),
      ).toBe("dark");

      cards[1].click();
      await settle();

      expect(theme.value).toBe("dark");
      expect(cards[1].getAttribute("aria-checked")).toBe("true");
      expect(announcement.value?.text).toBe("Dark theme");
    });

    it("chooses a theme with the arrows", async () => {
      await open();
      const cards = [...panel().querySelectorAll<HTMLElement>(".theme-card")];

      keydown(cards[0], "ArrowRight");
      await settle();

      expect(theme.value).toBe("dark");
      expect(document.activeElement).toBe(cards[1]);
    });

    it("saves when focus mode hides the controls", async () => {
      await open();
      const options = row("hide-after").querySelectorAll("button");
      expect([...options].map((b) => b.textContent?.trim())).toEqual([
        "When typing",
        "Or after 3 s",
        "Or after 10 s",
      ]);

      options[2].click();
      await settle();

      expect(written()).toEqual({ focusMode: { hideAfter: 10 } });
      expect(config.value.focusMode.hideAfter).toBe(10);
    });

    it("keeps a rest time of blank.json the choices don't offer", async () => {
      config.value = { ...config.value, focusMode: { hideAfter: 20 } };
      await open();

      expect(row("hide-after").textContent).toContain("Or after 20 s");
    });
  });

  describe("Writing", () => {
    it("turns a group of autocorrect off, also by its label", async () => {
      await open("writing");
      const dashes = row("autocorrect-dashes");
      const toggle = dashes.querySelector<HTMLElement>("[role=switch]")!;
      expect(toggle.getAttribute("aria-checked")).toBe("true");
      expect(
        document.getElementById(toggle.getAttribute("aria-labelledby")!)
          ?.textContent,
      ).toBe("Dashes");

      dashes.querySelector<HTMLElement>(".setting-label")!.click();
      await settle();

      expect(written()).toEqual({ autocorrect: { dashes: false } });
      expect(config.value.autocorrect.dashes).toBe(false);
      expect(announcement.value?.text).toBe("Dashes off");
      expect(toggle.getAttribute("aria-checked")).toBe("false");
    });

    it("takes a valid indent size, and says what's wrong with another", async () => {
      await open("writing");
      const input =
        panel().querySelector<HTMLInputElement>("#settings-indent")!;

      await type(input, "40");
      const enter = keydown(input, "Enter");
      await settle();
      expect(enter.defaultPrevented).toBe(true);
      expect(settingsDialog.value).not.toBeNull();
      expect(panel().textContent).toContain(
        "Enter a whole number from 1 to 16.",
      );
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(files[CONFIG]).toBeUndefined();

      await type(input, "2");
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      await settle();
      expect(written()).toEqual({ editor: { indentSize: 2 } });
      expect(panel().textContent).not.toContain("Enter a whole number");
    });

    describe("your replacements", () => {
      const openPage = async () => {
        await open("writing");
        button("Edit…", row("replacements")).click();
        await settle();
      };
      const fields = () => ({
        typed: panel().querySelector<HTMLInputElement>(
          "#settings-replace-typed",
        )!,
        becomes: panel().querySelector<HTMLInputElement>(
          "#settings-replace-becomes",
        )!,
      });

      it("counts them on the row", async () => {
        config.value = {
          ...config.value,
          autocorrect: {
            ...config.value.autocorrect,
            replace: { "*": { a: "b" }, de: { c: "d", e: "f" } },
          },
        };
        await open("writing");

        expect(row("replacements").textContent).toContain("3 replacements");
      });

      it("opens in place, with the focus in its field, and Esc goes back", async () => {
        await openPage();

        expect(panel().textContent).toContain("Your replacements");
        expect(document.activeElement).toBe(fields().typed);

        keydown(fields().typed, "Escape");
        await settle();

        expect(settingsDialog.value).not.toBeNull();
        expect(document.activeElement).toBe(
          button("Edit…", row("replacements")),
        );
      });

      it("adds one with Enter, for every language", async () => {
        await openPage();
        await type(fields().typed, "bg");
        await type(fields().becomes, "Blank group");
        keydown(fields().becomes, "Enter");
        await settle();

        expect(written()).toEqual({
          autocorrect: { replace: { "*": { bg: "Blank group" } } },
        });
        expect(
          panel().querySelector("#settings-replacements-list")?.textContent,
        ).toContain("bg → Blank group");
        expect(announcement.value?.text).toBe("bg now becomes Blank group");
        expect(fields().typed.value).toBe("");
      });

      it("says what's wrong with one", async () => {
        await openPage();
        await type(fields().typed, "b g");
        await type(fields().becomes, "x");
        button("Add").click();
        await settle();

        expect(panel().textContent).toContain(
          "What you type can't contain spaces.",
        );
        expect(files[CONFIG]).toBeUndefined();

        await type(fields().typed, "");
        button("Add").click();
        await settle();
        expect(panel().textContent).toContain(
          "Enter what you type and what it becomes.",
        );
      });

      it("keeps what blank.json holds and removes one", async () => {
        files[CONFIG] = JSON.stringify({
          autocorrect: { replace: { "*": { a: "b", typed: "by hand" } } },
        });
        await bootConfig();
        await openPage();

        panel()
          .querySelector<HTMLElement>(
            '[aria-label="Remove the replacement of a"]',
          )!
          .click();
        await settle();

        expect(written()).toEqual({
          autocorrect: { replace: { "*": { typed: "by hand" } } },
        });
      });

      it("offers the current language and those that have some", async () => {
        language.value = "de-CH";
        config.value = {
          ...config.value,
          autocorrect: {
            ...config.value.autocorrect,
            replace: { "*": {}, fr: { a: "b" } },
          },
        };
        await openPage();

        const scopes = [...panel().querySelectorAll("[role=tab]")].map((t) =>
          t.textContent?.trim(),
        );
        expect(scopes).toEqual(["All languages", "German", "French"]);
      });
    });
  });

  describe("Spelling", () => {
    it("turns spell check on and changes the language", async () => {
      await open("spelling");
      row("spellcheck").querySelector<HTMLElement>("[role=switch]")!.click();
      await settle();

      expect(spellcheck.value).toBe(true);
      expect(row("language").textContent).toContain("English");
    });

    it("saves which words it ignores", async () => {
      await open("spelling");
      row("ignore-uppercase")
        .querySelector<HTMLElement>("[role=switch]")!
        .click();
      await settle();

      expect(written()).toEqual({ spellcheck: { ignoreUppercase: false } });
      expect(config.value.spellcheck.ignoreUppercase).toBe(false);
    });

    describe("your dictionary", () => {
      const openPage = async () => {
        await open("spelling");
        button("Edit…", row("dictionary")).click();
        await settle();
      };
      const field = () =>
        panel().querySelector<HTMLInputElement>("#settings-dictionary-add")!;

      it("counts its words on the row", async () => {
        files[DICTIONARY] = "blank\nmp3\n";
        await open("spelling");

        expect(row("dictionary").textContent).toContain("2 words in English");
      });

      it("adds a word to the file while spell check is off", async () => {
        await openPage();
        expect(panel().textContent).toContain("No words yet.");

        await type(field(), "zebra");
        keydown(field(), "Enter");
        await settle();

        expect(files[DICTIONARY]).toBe("zebra\n");
        expect(
          panel().querySelector("#settings-dictionary-list")?.textContent,
        ).toContain("zebra");
        expect(announcement.value?.text).toBe("zebra added to your dictionary");
      });

      it("refuses two words and one it has in another form", async () => {
        files[DICTIONARY] = "blank\n";
        await openPage();

        await type(field(), "two words");
        keydown(field(), "Enter");
        await settle();
        expect(panel().textContent).toContain("Add one word at a time.");

        await type(field(), "Blank");
        keydown(field(), "Enter");
        await settle();
        expect(panel().textContent).toContain(
          "Blank is already in your dictionary.",
        );
        expect(files[DICTIONARY]).toBe("blank\n");
      });

      it("removes a word", async () => {
        files[DICTIONARY] = "blank\nmp3\n";
        await openPage();

        panel()
          .querySelector<HTMLElement>('[aria-label="Remove mp3"]')!
          .click();
        await settle();

        expect(files[DICTIONARY]).toBe("blank\n");
      });

      it("filters a long list", async () => {
        files[DICTIONARY] = "a\nb\nc\nd\ne\nf\ng\nh\nzebra\n";
        await openPage();
        const filter = panel().querySelector<HTMLInputElement>(
          "#settings-dictionary-list-filter",
        )!;

        await type(filter, "zeb");

        expect(
          panel().querySelectorAll("#settings-dictionary-list li"),
        ).toHaveLength(1);
      });
    });
  });

  describe("Keyboard shortcuts", () => {
    const keyOf = (id: C) =>
      panel().querySelector<HTMLElement>(
        `.shortcut[data-command="${id}"] .shortcut-key`,
      )!;
    const record = async (id: C) => {
      keyOf(id).click();
      await settle();
    };
    const press = async (
      key: string,
      init: KeyboardEventInit = {},
      keyCode = 0,
    ) => {
      const event = keydown(
        document.activeElement ?? keyOf(C.FILE_SAVE),
        key,
        init,
        keyCode,
      );
      await settle();
      return event;
    };

    it("lists every command with its key, also those without one", async () => {
      await open("shortcuts");

      expect(keyOf(C.FILE_SAVE).textContent?.trim()).toBe("Ctrl+S");
      expect(keyOf(C.BLOCKTYPE_CODE_BLOCK).textContent?.trim()).toBe("None");
      expect(panel().querySelectorAll(".shortcut")).toHaveLength(
        Object.keys(config.value.keymap).length,
      );
    });

    it("records a new key, which works at once", async () => {
      await open("shortcuts");
      await record(C.FILE_SAVE);
      keyOf(C.FILE_SAVE).focus();
      expect(keyOf(C.FILE_SAVE).textContent?.trim()).toBe("Press keys…");
      expect(announcement.value?.text).toBe("Press the new keys");

      const event = await press("F9", {}, 120);

      expect(event.defaultPrevented).toBe(true);
      expect(written()).toEqual({ keymap: { "file.save": "F9" } });
      expect(config.value.keymap[C.FILE_SAVE]).toBe("F9");
      expect(keyOf(C.FILE_SAVE).textContent?.trim()).toBe("F9");
    });

    it("keeps the dialog's keys while recording", async () => {
      await open("shortcuts");
      await record(C.FILE_SAVE);
      keyOf(C.FILE_SAVE).focus();

      await press("Enter");
      expect(settingsDialog.value).not.toBeNull();
      expect(panel().textContent).toContain(
        "Use Ctrl or Alt with a key, or an F key.",
      );

      await press("Escape");
      expect(settingsDialog.value).not.toBeNull();
      expect(keyOf(C.FILE_SAVE).textContent?.trim()).toBe("Ctrl+S");
    });

    it("refuses a key with the reason", async () => {
      await open("shortcuts");
      await record(C.FILE_SAVE);
      keyOf(C.FILE_SAVE).focus();

      await press("c", { ctrlKey: true }, 67);

      expect(panel().textContent).toContain(
        "Ctrl+C copies everywhere. Choose another.",
      );
      expect(files[CONFIG]).toBeUndefined();
    });

    it("moves a key another command has on the second press", async () => {
      await open("shortcuts");
      await record(C.FILE_SAVE);
      keyOf(C.FILE_SAVE).focus();

      await press("b", { ctrlKey: true, altKey: true }, 66);
      expect(panel().textContent).toContain(
        "Ctrl+Alt+B is used by Insert a block. Press it again to move it here.",
      );
      expect(files[CONFIG]).toBeUndefined();

      await press("b", { ctrlKey: true, altKey: true }, 66);
      expect(written()).toEqual({
        keymap: { "file.save": "Mod-Alt-b", "insert.block": "" },
      });
      expect(keyOf(C.INSERT_BLOCK).textContent?.trim()).toBe("None");
    });

    it("removes a key with Backspace and resets it", async () => {
      await open("shortcuts");
      await record(C.FILE_SAVE);
      keyOf(C.FILE_SAVE).focus();
      await press("Backspace");
      expect(written()).toEqual({ keymap: { "file.save": "" } });

      panel()
        .querySelector<HTMLElement>('[aria-label="Reset to Ctrl+S"]')!
        .click();
      await settle();

      expect(written()).toEqual({});
      expect(keyOf(C.FILE_SAVE).textContent?.trim()).toBe("Ctrl+S");
    });

    it("resets all after asking in place", async () => {
      files[CONFIG] = JSON.stringify({ keymap: { "file.save": "F9" } });
      await bootConfig();
      await open("shortcuts");

      button("Reset all").click();
      await settle();
      expect(panel().textContent).toContain("Reset all shortcuts?");
      expect(document.activeElement).toBe(button("Cancel"));

      button("Reset").click();
      await settle();

      expect(written()).toEqual({});
      expect(button("Reset all").disabled).toBe(true);
    });

    it("finds a command", async () => {
      await open("shortcuts");
      const search = panel().querySelector<HTMLInputElement>(
        "#settings-shortcuts-search",
      )!;

      await type(search, "preferences");

      expect(
        [...panel().querySelectorAll<HTMLElement>(".shortcut")].map(
          (row) => row.dataset.command,
        ),
      ).toEqual([C.APP_SETTINGS]);
    });
  });

  describe("About", () => {
    it("shows the version and opens the links", async () => {
      vi.mocked(getVersion).mockResolvedValue("3.1.0");
      await open("about");

      expect(panel().textContent).toContain("Version 3.1.0");
      expect(panel().textContent).toContain(
        "GNU Affero General Public License, version 3",
      );

      button("Website").click();
      await settle();
      expect(openUrl).toHaveBeenCalledWith("https://blank-writer.xyz/");
    });

    it("shows the package's version without the app's", async () => {
      vi.mocked(getVersion).mockRejectedValue(new Error("no Tauri"));
      await open("about");

      expect(panel().textContent).toMatch(/Version \d+\.\d+\.\d+/);
    });

    it("loads the licenses only when asked", async () => {
      vi.mocked(getVersion).mockResolvedValue("3.1.0");
      const fetch = vi
        .spyOn(window, "fetch")
        .mockResolvedValue(new Response("krilla\nMIT\n"));
      await open("about");
      expect(fetch).not.toHaveBeenCalled();

      button("Licenses of the software Blank uses").click();
      await settle();

      expect(fetch).toHaveBeenCalledWith("/THIRD-PARTY-NOTICES.txt");
      expect(panel().querySelector(".licenses")?.textContent).toContain(
        "krilla",
      );
    });
  });
});
