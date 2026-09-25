import { beforeEach, describe, expect, it, vi } from "vitest";

import { bootUI, setupNotification } from "./ui";
import { path, textContent } from "./state";
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
const uiBottom = () => document.querySelector<HTMLElement>("#ui-bottom");

describe("ui", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    path.value = null;
    textContent.value = "";
    stubNotification("granted");
    bootUI();
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
      expect(uiBottom()?.textContent).toBe("0 words 0 chars");
    });

    it("counts the words and chars of the text content", () => {
      textContent.value = "one two three four";
      expect(uiBottom()?.textContent).toBe("4 words 18 chars");

      textContent.value = "";
      expect(uiBottom()?.textContent).toBe("0 words 0 chars");
    });
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
