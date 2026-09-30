import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import localforage from "localforage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { bootConfig } from "./config";
import { bootStorage } from "./storage";
import { bootEditor } from "./editor";
import { bootUI } from "./ui";
import { bootEngine } from "./engine/engine";
import { deferred, flushPromises } from "./test/async";
import { createTestHandle, doc, p } from "./test/editor";
import { mockCliArgs } from "./test/tauri";

vi.mock("./config", () => ({ bootConfig: vi.fn() }));
vi.mock("./storage", () => ({ bootStorage: vi.fn() }));
vi.mock("./editor", () => ({ bootEditor: vi.fn() }));
vi.mock("./ui", () => ({ bootUI: vi.fn() }));
vi.mock("./engine/engine", () => ({
  bootEngine: vi.fn(),
  useFallbackEditor: () => document.body.classList.add("without-engine"),
}));
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
      // the engine loads in the background from the start
      const order = [
        bootEngine,
        bootConfig,
        bootStorage,
        bootEditor,
        bootUI,
      ].map((boot) => vi.mocked(boot).mock.invocationCallOrder[0]);
      expect(order).toEqual([...order].sort((a, b) => a - b));
    },
  );
  it("lets the editor show the text if the engine can't load", async () => {
    vi.mocked(bootEngine).mockRejectedValue(new Error("no wasm"));

    await importMain();
    await flushPromises();

    expect(document.body.classList).toContain("without-engine");
    expect(bootUI).toHaveBeenCalled();
    document.body.classList.remove("without-engine");
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

describe("main with the real editor and engine", () => {
  const root = resolve(import.meta.dirname, "..");

  beforeEach(async () => {
    vi.doUnmock("./editor");
    vi.doUnmock("./engine/engine");
    vi.doUnmock("./engine/geometry");
    // the document of the last session, restored from storage
    vi.doMock("./storage", async (actual) => ({
      ...(await actual<typeof import("./storage")>()),
      bootStorage: vi.fn(),
    }));
    vi.doMock("./config", async (actual) => ({
      ...(await actual<typeof import("./config")>()),
      bootConfig: vi.fn(async () => {}),
    }));
    vi.mocked(bootUI).mockImplementation(() => () => {});
    mockCliArgs();
    await localforage.clear();
    await localforage.setItem(
      "doc",
      doc(p("The text of the last session")).toJSON(),
    );
    document.body.replaceChildren();
    vi.spyOn(console, "error").mockImplementation(() => {});
    // the wasm and the fonts, served from the repository
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const file = resolve(root, String(url).replace(/^\//, ""));
        return new Response(readFileSync(file), {
          headers: file.endsWith(".wasm")
            ? { "Content-Type": "application/wasm" }
            : {},
        });
      }),
    );
  });

  afterEach(() => {
    vi.doUnmock("./storage");
    vi.doUnmock("./config");
    document.body.classList.remove("without-engine");
  });

  it(
    "starts with the stored document when its first layout fails",
    { timeout: 20_000 },
    async () => {
      vi.resetModules();
      // the wasm the app loads, whose first layout traps
      const { LayoutEngine } = await import("./engine/wasm/blank_layout.js");
      vi.spyOn(LayoutEngine.prototype, "setItems").mockImplementation(() => {
        throw new WebAssembly.RuntimeError("unreachable");
      });

      await import("./main");
      await vi.waitFor(() => expect(bootUI).toHaveBeenCalled(), {
        timeout: 10_000,
      });

      expect(document.querySelector(".boot-error")).toBeNull();
      expect(document.querySelector("#editor")?.textContent).toContain(
        "The text of the last session",
      );
      expect(document.body.classList).toContain("without-engine");
      // the engine loaded, and gave up on the document, which it failed on
      expect(console.error).not.toHaveBeenCalledWith(
        "failed to load the layout engine",
        expect.anything(),
      );
      expect(console.error).toHaveBeenCalledWith(
        "the layout engine failed",
        expect.any(WebAssembly.RuntimeError),
      );
    },
  );
});
