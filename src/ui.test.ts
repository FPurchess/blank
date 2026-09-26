import { beforeEach, describe, expect, it, vi } from "vitest";

import { bootUI, setupNotification } from "./ui";
import {
  importedFrom,
  language,
  languagePicker,
  linkDialog,
  type LinkDialogRequest,
  path,
  spellcheck,
  spellcheckMessage,
  spellcheckStatus,
  textContent,
} from "./state";
import { closePicker, move, openPicker, typeChar } from "./languagePicker";
import { flushPromises } from "./test/async";

/**
 * stubNotification replaces the browser Notification API that the Tauri
 * notification plugin reads the permission from.
 */
const stubNotification = (
  permission: NotificationPermission,
  requestPermission = vi.fn().mockResolvedValue("granted"),
) => {
  vi.stubGlobal("Notification", { permission, requestPermission });
  return requestPermission;
};

const uiTop = () => document.querySelector<HTMLElement>("#ui-top");
const uiStats = () => document.querySelector<HTMLElement>("#ui-stats");
const uiLanguage = () => document.querySelector<HTMLElement>("#ui-language");

describe("ui", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    path.value = null;
    importedFrom.value = null;
    textContent.value = "";
    language.value = "de";
    closePicker();
    stubNotification("granted");
    bootUI();
  });

  it("renders the link dialog", () => {
    linkDialog.value = { url: "", text: "" } as LinkDialogRequest;
    expect(document.querySelector("#link-dialog")).not.toBeNull();

    linkDialog.value = null;
    expect(document.querySelector("#link-dialog")).toBeNull();
  });

  describe("file path", () => {
    it("shows Untitled without a path", () => {
      expect(uiTop()?.textContent).toBe("» Untitled");
    });

    it("shows the current path", () => {
      path.value = "/this/is/a/test/path";
      expect(uiTop()?.textContent).toBe("» /this/is/a/test/path");

      path.value = null;
      expect(uiTop()?.textContent).toBe("» Untitled");
    });

    it("shows the name of an imported Word document until it is saved", () => {
      importedFrom.value = "/docs/report.docx";
      expect(uiTop()?.textContent).toBe("» report.docx (imported)");

      path.value = "/docs/report.md";
      expect(uiTop()?.textContent).toBe("» /docs/report.md");
    });

    it("shows a path containing markup as plain text", () => {
      path.value = "/tmp/<img src=x>.md";

      expect(uiTop()?.textContent).toBe("» /tmp/<img src=x>.md");
      expect(uiTop()?.children).toHaveLength(0);
    });
  });

  describe("counter", () => {
    it("starts at zero", () => {
      expect(uiStats()?.textContent).toBe("0 words 0 chars");
    });

    it("counts the words and chars of the text content", () => {
      textContent.value = "one two three four";
      expect(uiStats()?.textContent).toBe("4 words 18 chars");

      textContent.value = "";
      expect(uiStats()?.textContent).toBe("0 words 0 chars");
    });

    it("counts pipes as words and chars", () => {
      textContent.value = "a || b";
      expect(uiStats()?.textContent).toBe("3 words 6 chars");
    });

    it("counts the words of a doc with a hard break", () => {
      textContent.value = "roses are red violets are blue";
      expect(uiStats()?.textContent).toBe("6 words 30 chars");
    });
  });
});

describe("ui language chooser", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    language.value = "de";
    closePicker();
    stubNotification("granted");
    bootUI();
  });

  it("sits right of the counter and the spell check status in the footer", () => {
    const footer = document.querySelector("#ui-bottom")!;

    expect([...footer.children].map((child) => child.id)).toEqual([
      "ui-stats",
      "ui-spellcheck",
      "ui-language",
    ]);
  });

  it("shows the current language", () => {
    expect(uiLanguage()?.textContent).toBe("DE");

    language.value = "fr";
    expect(uiLanguage()?.textContent).toBe("FR");
  });

  it("marks a language that uses the English rules", () => {
    language.value = "tr";

    expect(uiLanguage()?.textContent).toBe("TR*");
  });

  it("shows the languages around the selected one while open", () => {
    openPicker();

    expect(uiLanguage()?.classList.contains("open")).toBe(true);
    expect(uiLanguage()?.textContent).toBe("‹csdadede-ATde-CH›");
    expect(uiLanguage()?.querySelector(".selected")?.textContent).toBe("de");

    move(1);
    expect(uiLanguage()?.querySelector(".selected")?.textContent).toBe("de-AT");
  });

  it("shows typed letters and rejected codes", () => {
    openPicker();

    typeChar("p");
    expect(uiLanguage()?.querySelector(".buffer")?.textContent).toBe("p_");

    typeChar("x");
    expect(uiLanguage()?.classList.contains("invalid")).toBe(true);

    typeChar("t");
    typeChar("r");
    expect(uiLanguage()?.querySelector(".selected")?.textContent).toBe("tr*");
  });

  it("does not mark the language as rejected once closed", () => {
    openPicker();
    typeChar("x");
    typeChar("x");
    closePicker();

    expect(uiLanguage()?.classList.contains("invalid")).toBe(false);
    expect(uiLanguage()?.textContent).toBe("DE");
  });

  it("opens on click and chooses a clicked language", () => {
    uiLanguage()!.click();
    expect(languagePicker.value.open).toBe(true);

    const option = [
      ...uiLanguage()!.querySelectorAll<HTMLElement>(".option"),
    ].find((element) => element.textContent === "de-CH")!;
    option.click();

    expect(language.value).toBe("de-CH");
    expect(languagePicker.value.open).toBe(false);
    expect(uiLanguage()?.textContent).toBe("DE-CH");
  });

  it("keeps the focus in the editor when clicked", () => {
    const event = new MouseEvent("mousedown", { cancelable: true });
    uiLanguage()!.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});

describe("setupNotification", () => {
  it("doesn't ask again when permission is granted", async () => {
    const requestPermission = stubNotification("granted");

    await setupNotification();

    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("asks for permission when it was denied", async () => {
    const requestPermission = stubNotification("denied");

    await setupNotification();

    expect(requestPermission).toHaveBeenCalledOnce();
  });

  it("logs a failing permission request without breaking the boot", async () => {
    const error = new Error("nope");
    stubNotification("denied", vi.fn().mockRejectedValue(error));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    expect(() => bootUI()).not.toThrow();
    await flushPromises();

    expect(consoleError).toHaveBeenCalledWith(error);
  });
});

describe("ui spell check status", () => {
  const uiSpellcheck = () =>
    document.querySelector<HTMLElement>("#ui-spellcheck")!;

  beforeEach(() => {
    document.body.innerHTML = "";
    spellcheck.value = false;
    spellcheckMessage.value = null;
    spellcheckStatus.value = { state: "off", tag: "de" };
    stubNotification("granted");
    bootUI();
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
    [{ state: "ready" }, "Spelling ✓", "Checking German spelling"],
    [
      { state: "unavailable" },
      "No spelling",
      "No spell check dictionary for German",
    ],
    [{ state: "error", message: "offline" }, "Spelling ✗", "offline"],
    [{ state: "error" }, "Spelling ✗", ""],
  ] as const)("shows %j", (status, text, title) => {
    spellcheckStatus.value = { tag: "de", ...status };

    expect(uiSpellcheck().textContent).toBe(text);
    expect(uiSpellcheck().hidden).toBe(text === "");
    expect(uiSpellcheck().title).toBe(
      title && `${title}, click to turn spell check off`,
    );
  });

  it("shows a message for a moment", () => {
    vi.useFakeTimers();
    spellcheckStatus.value = { state: "ready", tag: "de" };

    spellcheckMessage.value = "No spelling errors";
    expect(uiSpellcheck().textContent).toBe("No spelling errors");

    vi.advanceTimersByTime(2000);
    expect(spellcheckMessage.value).toBeNull();
    expect(uiSpellcheck().textContent).toBe("Spelling ✓");
  });

  it("turns spell check on and off when clicked", () => {
    uiSpellcheck().click();
    expect(spellcheck.value).toBe(true);

    uiSpellcheck().click();
    expect(spellcheck.value).toBe(false);
  });

  it("keeps the focus in the editor when clicked", () => {
    const event = new MouseEvent("mousedown", { cancelable: true });
    uiSpellcheck().dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});
