import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { bootUI, setupNotification } from "./ui";
import { linkDialog, type LinkDialogRequest, path } from "./state";
import { createTestHandle } from "./test/editor";
import { flushPromises } from "./test/async";

// stops what the last boot rendered, so boots don't pile up
let dispose = () => {};
afterEach(() => dispose());

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

describe("ui", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    path.value = null;
    linkDialog.value = null;
    stubNotification("granted");
    dispose = bootUI(createTestHandle());
  });

  it("renders the link dialog", async () => {
    linkDialog.value = { url: "", text: "" } as LinkDialogRequest;
    await nextTick();
    expect(document.querySelector("#link-dialog")).not.toBeNull();

    linkDialog.value = null;
    await nextTick();
    expect(document.querySelector("#link-dialog")).toBeNull();
  });

  it("keeps the webview's own menu away until disposed", () => {
    const contextmenu = () => {
      const event = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
      });
      document.body.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(contextmenu()).toBe(true);

    dispose();
    dispose = () => {};
    expect(contextmenu()).toBe(false);
  });

  it("mounts the Vue app into the UI root until disposed", () => {
    expect(document.querySelector("#ui > #ui-app")).not.toBeNull();

    dispose();
    dispose = () => {};
    expect(document.getElementById("ui-app")).toBeNull();
  });

  it("puts the bars in the app, and no header or footer being edited", () => {
    const app = [...document.querySelectorAll("#ui-app > [id]")].map(
      (e) => e.id,
    );
    expect(app).not.toContain("band-editor");
    expect(app).toContain("table-handles");
    expect(app.indexOf("ui-top")).toBeLessThan(app.indexOf("ui-bottom"));
  });

  it("removes the UI and stops rendering when disposed", () => {
    dispose();
    dispose = () => {};
    path.value = "/tmp/after.md";

    expect(document.getElementById("ui")).toBeNull();
    expect(document.getElementById("ui-top")).toBeNull();
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

    expect(() => (dispose = bootUI(createTestHandle()))).not.toThrow();
    await flushPromises();

    expect(consoleError).toHaveBeenCalledWith(error);
  });
});
