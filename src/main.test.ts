import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { bootConfig } from "./config";
import { bootStorage } from "./storage";
import { bootEditor } from "./editor";
import { bootUI } from "./ui";
import { bootEngine } from "./engine/engine";
import { deferred, flushPromises } from "./test/async";
import { createTestHandle } from "./test/editor";

vi.mock("./config", () => ({ bootConfig: vi.fn() }));
vi.mock("./storage", () => ({ bootStorage: vi.fn() }));
vi.mock("./editor", () => ({ bootEditor: vi.fn() }));
vi.mock("./ui", () => ({ bootUI: vi.fn() }));
vi.mock("./engine/engine", () => ({ bootEngine: vi.fn() }));
vi.mock("./engine/geometry", () => ({ exposeGeometry: vi.fn() }));

// the handle the mocked bootEditor returns
const editor = createTestHandle();

// main.ts only runs its side effects on the first import
const importMain = async () => {
  vi.resetModules();
  await import("./main");
};

describe("main", () => {
  beforeEach(() => {
    vi.mocked(bootConfig).mockResolvedValue(undefined);
    vi.mocked(bootStorage).mockResolvedValue(undefined);
    vi.mocked(bootEditor).mockResolvedValue(editor);
    vi.mocked(bootEngine).mockResolvedValue(null as never);
    document.body.replaceChildren();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  // the first import of the app takes a while in a busy test run
  it(
    "boots config, storage, editor and ui one after another",
    {
      timeout: 20_000,
    },
    async () => {
      const config = deferred();
      vi.mocked(bootConfig).mockReturnValue(config.promise);

      await importMain();
      await flushPromises();
      expect(bootConfig).toHaveBeenCalled();
      expect(bootStorage).not.toHaveBeenCalled();

      config.resolve();
      await flushPromises();

      // the UI works with the editor through the handle bootEditor returns
      expect(bootUI).toHaveBeenCalledWith(editor);
      const order = [
        bootConfig,
        bootStorage,
        bootEngine,
        bootEditor,
        bootUI,
      ].map((boot) => vi.mocked(boot).mock.invocationCallOrder[0]);
      expect(order).toEqual([...order].sort((a, b) => a - b));
    },
  );
  it.each([
    ["config", bootConfig],
    ["storage", bootStorage],
    ["editor", bootEditor],
  ])("explains in the window when the %s fails to boot", async (_, boot) => {
    const error = new Error("Unrecognized modifier name: <b>Hyper</b>");
    vi.mocked(boot).mockRejectedValue(error);

    await importMain();
    await flushPromises();

    const message = document.querySelector("pre.boot-error");
    expect(message?.textContent).toContain("Blank couldn't start.");
    expect(message?.textContent).toContain(
      "Unrecognized modifier name: <b>Hyper</b>",
    );
    expect(message?.textContent).toContain("blank.json");
    // the error is shown as text, never as markup
    expect(message?.querySelector("b")).toBeNull();
    expect(bootUI).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("failed to start Blank", error);
  });

  it("shows a non-Error rejection as text", async () => {
    vi.mocked(bootConfig).mockRejectedValue("plain failure");

    await importMain();
    await flushPromises();

    expect(document.querySelector(".boot-error")?.textContent).toContain(
      "plain failure",
    );
  });

  it("only notifies when the UI fails after the editor started", async () => {
    vi.mocked(bootUI).mockImplementation(() => {
      throw new Error("ui broke");
    });

    await importMain();
    await flushPromises();

    expect(document.querySelector(".boot-error")).toBeNull();
    expect(sendNotification).toHaveBeenCalledWith(
      "Parts of Blank failed to start: ui broke",
    );
  });

  it("logs when the notification can't be sent either", async () => {
    vi.mocked(bootUI).mockImplementation(() => {
      throw new Error("ui broke");
    });
    const notifyError = new Error("no notifications");
    vi.mocked(sendNotification).mockImplementation(() => {
      throw notifyError;
    });

    await importMain();
    await flushPromises();

    expect(console.error).toHaveBeenCalledWith(
      "failed to send notification",
      notifyError,
    );
  });
});
