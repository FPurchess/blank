import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { bootConfig } from "./config";
import { bootStorage } from "./storage";
import { bootEditor } from "./editor";
import { bootUI } from "./ui";
import { deferred, flushPromises } from "./test/async";

vi.mock("./config", () => ({ bootConfig: vi.fn() }));
vi.mock("./storage", () => ({ bootStorage: vi.fn() }));
vi.mock("./editor", () => ({ bootEditor: vi.fn() }));
vi.mock("./ui", () => ({ bootUI: vi.fn() }));

// main.ts only runs its side effects on the first import
const importMain = async () => {
  vi.resetModules();
  await import("./main");
};

describe("main", () => {
  beforeEach(() => {
    for (const boot of [bootConfig, bootStorage, bootEditor]) {
      vi.mocked(boot).mockResolvedValue(undefined);
    }
    document.body.replaceChildren();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("boots config, storage, editor and ui one after another", async () => {
    const config = deferred();
    vi.mocked(bootConfig).mockReturnValue(config.promise);

    await importMain();
    await flushPromises();
    expect(bootConfig).toHaveBeenCalled();
    expect(bootStorage).not.toHaveBeenCalled();

    config.resolve();
    await flushPromises();

    expect(bootUI).toHaveBeenCalled();
    const order = [bootConfig, bootStorage, bootEditor, bootUI].map(
      (boot) => vi.mocked(boot).mock.invocationCallOrder[0],
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
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
