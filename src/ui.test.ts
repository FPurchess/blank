import { beforeEach, describe, expect, it, vi } from "vitest";

import { bootUI, setupNotification } from "./ui";
import {
  language,
  languagePicker,
  linkDialog,
  type LinkDialogRequest,
  path,
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

  it("sits right of the counter in the footer", () => {
    const footer = document.querySelector("#ui-bottom")!;

    expect([...footer.children].map((child) => child.id)).toEqual([
      "ui-stats",
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
    expect(uiLanguage()?.textContent).toBe("‹csdadeenes›");
    expect(uiLanguage()?.querySelector(".selected")?.textContent).toBe("de");

    move(1);
    expect(uiLanguage()?.querySelector(".selected")?.textContent).toBe("en");
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
    ].find((element) => element.textContent === "en")!;
    option.click();

    expect(language.value).toBe("en");
    expect(languagePicker.value.open).toBe(false);
    expect(uiLanguage()?.textContent).toBe("EN");
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
