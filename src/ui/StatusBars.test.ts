import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { config } from "../config";
import { formatShortcut } from "../editor/keyBindings";
import { closePicker, move, openPicker, typeChar } from "../languagePicker";
import { schema } from "../markdown";
import {
  announce,
  announcement,
  flashSpellcheckMessage,
  importedFrom,
  language,
  languagePicker,
  pageSetup,
  path,
  spellcheck,
  spellcheckMessage,
  spellcheckStatus,
  textContent,
  transaction,
} from "../state";
import { createState, createTestHandle } from "../test/editor";
import { bootApp } from "./mount";

// The bars at the top and bottom of the window: TopArea.vue (its tabs are
// in TabRow.test.ts), BottomBar.vue and the items in it

let dispose = () => {};
afterEach(() => dispose());

const uiStats = () => document.querySelector<HTMLElement>("#ui-stats");
const uiLanguage = () => document.querySelector<HTMLElement>("#ui-language");

describe("top area and counter", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    path.value = null;
    importedFrom.value = null;
    textContent.value = "";
    dispose = bootApp(createTestHandle());
  });

  describe("top area", () => {
    const press = (type: string, button = 0) => {
      const event = new MouseEvent(type, {
        button,
        bubbles: true,
        cancelable: true,
      });
      document.querySelector("#format-toolbar")!.dispatchEvent(event);
      return event.defaultPrevented;
    };

    it("keeps the editor's focus when it is pressed", () => {
      expect(press("mousedown")).toBe(true);
    });

    it("pastes nothing on a middle click, where Linux would paste", () => {
      vi.spyOn(navigator, "platform", "get").mockReturnValue("Linux x86_64");
      expect(press("mouseup", 1)).toBe(true);
      expect(press("mouseup", 0)).toBe(false);
      vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
      expect(press("mouseup", 1)).toBe(false);
    });
  });

  describe("counter", () => {
    it("starts at zero", async () => {
      expect(uiStats()?.textContent).toBe("0 words");
    });

    it("counts the words of the text content", async () => {
      textContent.value = "one two three four";
      await nextTick();
      expect(uiStats()?.textContent).toBe("4 words");

      textContent.value = "";
      await nextTick();
      expect(uiStats()?.textContent).toBe("0 words");
    });

    it("counts pipes as words", async () => {
      textContent.value = "a || b";
      await nextTick();
      expect(uiStats()?.textContent).toBe("3 words");
    });

    it("separates thousands", async () => {
      textContent.value = "word ".repeat(1498);
      await nextTick();
      expect(uiStats()?.textContent).toBe("1,498 words");
    });

    it("is a button that keeps the focus in the editor", () => {
      expect(uiStats()?.tagName).toBe("BUTTON");
      expect(uiStats()?.tabIndex).toBe(-1);
      const event = new MouseEvent("mousedown", { cancelable: true });
      uiStats()!.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });
  });
});

describe("language chooser", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    language.value = "de";
    closePicker();
    dispose = bootApp(createTestHandle());
  });

  it("sits between the paper and spell check", () => {
    const ids = [...document.querySelectorAll("#ui-bottom [id]")].map(
      (element) => element.id,
    );

    expect(ids).toEqual([
      "ui-stats",
      "ui-announcement",
      // what only screen readers hear, e.g. which tab is shown
      "ui-announcement-spoken",
      // the page in view, read out when it changes, not shown; the page
      // number itself needs the pages, which these tests don't lay out
      "ui-page-spoken",
      "ui-page",
      "ui-language",
      "ui-spellcheck",
      "ui-view",
      "ui-focus-mode",
    ]);
  });

  it("shows the current language", async () => {
    expect(uiLanguage()?.textContent).toBe("DE");

    language.value = "fr";
    await nextTick();
    expect(uiLanguage()?.textContent).toBe("FR");
  });

  it("marks a language that uses the English rules", async () => {
    language.value = "tr";
    await nextTick();

    expect(uiLanguage()?.textContent).toBe("TR*");
  });

  it("shows the languages around the selected one while open", async () => {
    openPicker();
    await nextTick();

    expect(uiLanguage()?.classList.contains("open")).toBe(true);
    expect(uiLanguage()?.textContent).toBe("‹csdadede-ATde-CH›");
    expect(uiLanguage()?.querySelector(".selected")?.textContent).toBe("de");

    move(1);
    await nextTick();
    expect(uiLanguage()?.querySelector(".selected")?.textContent).toBe("de-AT");
  });

  it("shows typed letters and rejected codes", async () => {
    openPicker();
    await nextTick();

    typeChar("p");
    await nextTick();
    expect(uiLanguage()?.querySelector(".buffer")?.textContent).toBe("p_");

    typeChar("x");
    await nextTick();
    expect(uiLanguage()?.classList.contains("invalid")).toBe(true);

    typeChar("t");
    await nextTick();
    typeChar("r");
    await nextTick();
    expect(uiLanguage()?.querySelector(".selected")?.textContent).toBe("tr*");
  });

  it("does not mark the language as rejected once closed", async () => {
    openPicker();
    await nextTick();
    typeChar("x");
    await nextTick();
    typeChar("x");
    await nextTick();
    closePicker();
    await nextTick();

    expect(uiLanguage()?.classList.contains("invalid")).toBe(false);
    expect(uiLanguage()?.textContent).toBe("DE");
  });

  it("opens on click and chooses a clicked language", async () => {
    uiLanguage()!.querySelector("button")!.click();
    await nextTick();
    expect(languagePicker.value.open).toBe(true);

    const option = [
      ...uiLanguage()!.querySelectorAll<HTMLElement>(".option"),
    ].find((element) => element.textContent === "de-CH")!;
    option.click();
    await nextTick();

    expect(language.value).toBe("de-CH");
    expect(languagePicker.value.open).toBe(false);
    expect(uiLanguage()?.textContent).toBe("DE-CH");
  });

  it("keeps the focus in the editor when clicked", async () => {
    const event = new MouseEvent("mousedown", { cancelable: true });
    uiLanguage()!.querySelector("button")!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    openPicker();
    await nextTick();
    const inPicker = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    uiLanguage()!.querySelector(".option")!.dispatchEvent(inPicker);
    expect(inPicker.defaultPrevented).toBe(true);
  });

  it("keeps the selection and the typed letters when the open picker is clicked", async () => {
    openPicker();
    move(1);
    typeChar("p");
    await nextTick();
    const before = { ...languagePicker.value };

    uiLanguage()!.querySelector<HTMLElement>(".more")!.click();
    await nextTick();

    expect(languagePicker.value).toEqual(before);
  });

  it("is named with its shortcut", () => {
    expect(uiLanguage()?.querySelector("button")?.dataset).toMatchObject({
      tip: "Language",
      tipKey: formatShortcut("Mod-Alt-l"),
    });
  });
});

describe("page button", () => {
  const uiPage = () => document.querySelector<HTMLElement>("#ui-page")!;
  const stateWith = (frontmatter: string | null) =>
    createState(
      schema.node("doc", { frontmatter }, [schema.node("paragraph")]),
    );
  const withFrontmatter = (frontmatter: string | null) =>
    stateWith(frontmatter).tr;

  beforeEach(() => {
    document.body.innerHTML = "";
    transaction.value = null;
    dispose = bootApp(createTestHandle());
  });

  it("shows the paper of the region and its orientation", () => {
    // jsdom's locale is en-US
    expect(uiPage().textContent).toBe("Letter (portrait)");
    expect(uiPage().tagName).toBe("BUTTON");
    expect(uiPage().querySelector("svg")).not.toBeNull();
    expect(uiPage().dataset).toMatchObject({
      tip: "Page setup…",
      tipKey: formatShortcut("Mod-Alt-u"),
    });
    expect(uiPage().hasAttribute("title")).toBe(false);
  });

  it("follows the page setup of the document", async () => {
    transaction.value = withFrontmatter(
      "page:\n  size: a4\n  orientation: landscape",
    );
    await nextTick();
    expect(uiPage().textContent).toBe("A4 (landscape)");

    transaction.value = withFrontmatter("page:\n  size: 170mm x 240mm");
    await nextTick();
    expect(uiPage().textContent).toBe("6.69 × 9.45 in (portrait)");
  });

  it("leaves the label alone while typing keeps the page setup", async () => {
    transaction.value = withFrontmatter("page:\n  size: a4");
    await nextTick();
    uiPage().textContent = "untouched";

    transaction.value = withFrontmatter("page:\n  size: a4");
    await nextTick();
    expect(uiPage().textContent).toBe("untouched");
  });

  it("follows the user's default", async () => {
    const before = config.value;
    try {
      config.value = {
        ...before,
        layout: { page: { ...before.layout.page, size: "a5" } },
      };
      await nextTick();
      expect(uiPage().textContent).toBe("A5 (portrait)");
    } finally {
      config.value = before;
    }
  });

  it("opens the page setup of its editor's document, keeping the focus", () => {
    const frontmatter = "page:\n  size: a5";
    dispose();
    const handle = createTestHandle(stateWith(frontmatter));
    const focus = vi.spyOn(handle.view, "focus");
    dispose = bootApp(handle);
    pageSetup.value = null;
    const mousedown = new MouseEvent("mousedown", { cancelable: true });

    uiPage().dispatchEvent(mousedown);
    uiPage().click();

    expect(mousedown.defaultPrevented).toBe(true);
    expect(pageSetup.value).toMatchObject({ frontmatter });
    expect(focus).toHaveBeenCalled();
    pageSetup.value = null;
  });
});

describe("spell check status", () => {
  const uiSpellcheck = () =>
    document.querySelector<HTMLElement>("#ui-spellcheck")!;

  beforeEach(() => {
    document.body.innerHTML = "";
    spellcheck.value = false;
    spellcheckMessage.value = null;
    spellcheckStatus.value = { state: "off", tag: "de" };
    dispose = bootApp(createTestHandle());
  });

  it.each([
    [{ state: "off" }, "Spelling off", "Spell check"],
    [{ state: "loading" }, "Spelling …", "Spelling: loading German"],
    [
      { state: "downloading", progress: 0.42 },
      "Spelling 42 %",
      "Spelling: downloading German",
    ],
    [{ state: "downloading" }, "Spelling 0 %", "Spelling: downloading German"],
    [{ state: "ready" }, "Spelling", "Spell check"],
    [{ state: "unavailable" }, "No spelling", "Spelling: no German dictionary"],
    [
      { state: "error", message: "offline" },
      "Spelling failed",
      "Spelling: offline",
    ],
    [{ state: "error" }, "Spelling failed", "Spell check"],
  ] as const)("shows %j", async (status, text, tip) => {
    spellcheckStatus.value = { tag: "de", ...status };
    await nextTick();

    expect(uiSpellcheck().textContent).toBe(text);
    expect(uiSpellcheck().hidden).toBe(false);
    expect(uiSpellcheck().dataset).toMatchObject({
      tip,
      tipKey: formatShortcut("Mod-Alt-s"),
    });
  });

  it("is pressed while spell check is on", async () => {
    expect(uiSpellcheck().getAttribute("aria-pressed")).toBe("false");
    spellcheck.value = true;
    await nextTick();
    expect(uiSpellcheck().getAttribute("aria-pressed")).toBe("true");
  });

  it("turns spell check on and off when clicked", async () => {
    uiSpellcheck().click();
    await nextTick();
    expect(spellcheck.value).toBe(true);

    uiSpellcheck().click();
    await nextTick();
    expect(spellcheck.value).toBe(false);
  });

  it("keeps the focus in the editor when clicked", () => {
    const event = new MouseEvent("mousedown", { cancelable: true });
    uiSpellcheck().dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("shows a message instead of the status until it's gone", async () => {
    spellcheckStatus.value = { state: "ready", tag: "de" };
    await nextTick();

    flashSpellcheckMessage("No spelling errors");
    await nextTick();
    expect(uiSpellcheck().textContent).toBe("No spelling errors");

    spellcheckMessage.value = null;
    await nextTick();
    expect(uiSpellcheck().textContent).toBe("Spelling");
  });

  it("marks itself with the state of spell check", async () => {
    spellcheckStatus.value = { state: "downloading", tag: "de" };
    await nextTick();
    expect(uiSpellcheck().dataset.state).toBe("downloading");
  });
});

describe("announcement", () => {
  const uiAnnouncement = () =>
    document.querySelector<HTMLElement>("#ui-announcement")!;

  beforeEach(() => {
    document.body.innerHTML = "";
    announcement.value = null;
    dispose = bootApp(createTestHandle());
  });

  it("is always there as a status, empty in between", () => {
    expect(uiAnnouncement().getAttribute("role")).toBe("status");
    expect(uiAnnouncement().textContent).toBe("");
  });

  it("shows what just happened until it's gone", async () => {
    announce("A row added");
    await nextTick();
    expect(uiAnnouncement().textContent).toBe("A row added");

    announcement.value = null;
    await nextTick();
    expect(uiAnnouncement().textContent).toBe("");
  });

  it("reads out a quiet one without showing it", async () => {
    const spoken = () =>
      document.querySelector<HTMLElement>("#ui-announcement-spoken")!;
    expect(spoken().getAttribute("role")).toBe("status");

    announce("notes, tab 2 of 3", { quiet: true });
    await nextTick();

    expect(uiAnnouncement().textContent).toBe("");
    expect(spoken().textContent).toBe("notes, tab 2 of 3");
    expect(spoken().classList).toContain("visually-hidden");
  });

  it("sits next to the counter, before the items on the right", () => {
    const ids = [...document.querySelectorAll("#ui-bottom > *")].map(
      (element) => element.id,
    );

    expect(ids.indexOf("ui-announcement")).toBe(ids.indexOf("ui-stats") + 1);
  });
});
