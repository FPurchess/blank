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

// The bars at the top and bottom of the window: TopBar.vue, BottomBar.vue
// and the items in it

let dispose = () => {};
afterEach(() => dispose());

const uiTop = () => document.querySelector<HTMLElement>("#ui-top");
const uiStats = () => document.querySelector<HTMLElement>("#ui-stats");
const uiLanguage = () => document.querySelector<HTMLElement>("#ui-language");

describe("top bar and counter", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    path.value = null;
    importedFrom.value = null;
    textContent.value = "";
    dispose = bootApp(createTestHandle());
  });

  describe("file path", () => {
    it("shows Untitled without a path", async () => {
      expect(uiTop()?.textContent).toBe("» Untitled");
    });

    it("shows the current path", async () => {
      path.value = "/this/is/a/test/path";
      await nextTick();
      expect(uiTop()?.textContent).toBe("» /this/is/a/test/path");

      path.value = null;
      await nextTick();
      expect(uiTop()?.textContent).toBe("» Untitled");
    });

    it("shows the name of an imported Word document until it is saved", async () => {
      importedFrom.value = "/docs/report.docx";
      await nextTick();
      expect(uiTop()?.textContent).toBe("» report.docx (imported)");

      path.value = "/docs/report.md";
      await nextTick();
      expect(uiTop()?.textContent).toBe("» /docs/report.md");
    });

    it("shows a path containing markup as plain text", async () => {
      path.value = "/tmp/<img src=x>.md";
      await nextTick();

      expect(uiTop()?.textContent).toBe("» /tmp/<img src=x>.md");
      expect(uiTop()?.children).toHaveLength(0);
    });
  });

  describe("counter", () => {
    it("starts at zero", async () => {
      expect(uiStats()?.textContent).toBe("0 words 0 chars");
    });

    it("counts the words and chars of the text content", async () => {
      textContent.value = "one two three four";
      await nextTick();
      expect(uiStats()?.textContent).toBe("4 words 18 chars");

      textContent.value = "";
      await nextTick();
      expect(uiStats()?.textContent).toBe("0 words 0 chars");
    });

    it("counts pipes as words and chars", async () => {
      textContent.value = "a || b";
      await nextTick();
      expect(uiStats()?.textContent).toBe("3 words 6 chars");
    });

    it("counts the words of several lines", async () => {
      textContent.value = "roses are red violets are blue";
      await nextTick();
      expect(uiStats()?.textContent).toBe("6 words 30 chars");
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

  it("sits right of the counter and the spell check status in the footer", () => {
    const footer = document.querySelector("#ui-bottom")!;

    expect([...footer.children].map((child) => child.id)).toEqual([
      "ui-stats",
      "ui-announcement",
      // the page of the caret, read out when it changes, not shown
      "ui-page-spoken",
      "ui-page",
      "ui-spellcheck",
      "ui-language",
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
    uiLanguage()!.click();
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

  it("keeps the focus in the editor when clicked", () => {
    const event = new MouseEvent("mousedown", { cancelable: true });
    uiLanguage()!.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
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

  it("says what a click on it does", () => {
    expect(uiLanguage()?.title).toBe("Choose language");
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
    expect(uiPage().getAttribute("role")).toBe("button");
    expect(uiPage().title).toBe(`Page setup (${formatShortcut("Mod-Alt-u")})`);
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
    [{ state: "off" }, "", ""],
    [{ state: "loading" }, "Spelling …", "Loading the German dictionary"],
    [
      { state: "downloading", progress: 0.42 },
      "Spelling 42 %",
      "Downloading the German dictionary",
    ],
    [
      { state: "downloading" },
      "Spelling 0 %",
      "Downloading the German dictionary",
    ],
    [{ state: "ready" }, "Spelling", "Checking German spelling"],
    [
      { state: "unavailable" },
      "No spelling",
      "No spell check dictionary for German",
    ],
    [{ state: "error", message: "offline" }, "Spelling failed", "offline"],
    [{ state: "error" }, "Spelling failed", ""],
  ] as const)("shows %j", async (status, text, title) => {
    spellcheckStatus.value = { tag: "de", ...status };
    await nextTick();

    expect(uiSpellcheck().textContent).toBe(text);
    expect(uiSpellcheck().hidden).toBe(text === "");
    expect(uiSpellcheck().title).toBe(
      title && `${title}, click to turn spell check off`,
    );
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

  it("sits next to the counter, before the items on the right", () => {
    const ids = [...document.querySelectorAll("#ui-bottom > *")].map(
      (element) => element.id,
    );

    expect(ids.indexOf("ui-announcement")).toBe(ids.indexOf("ui-stats") + 1);
  });
});
