import { beforeEach, describe, expect, it, vi } from "vitest";
import pdfmake from "pdfmake";

import { bootConfig } from "./config";
import { bootStorage } from "./storage";
import { bootEditor } from "./editor";
import { bootUI } from "./ui";
import vfs from "./exporters/pdf/pdfmake-vfs";
import { deferred, flushPromises } from "./test/async";

vi.mock("pdfmake", () => ({
  default: { addVirtualFileSystem: vi.fn(), addFonts: vi.fn() },
}));
vi.mock("./exporters/pdf/pdfmake-vfs", () => ({
  default: { "dejavu-sans.ttf": "font" },
}));
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
  });

  it("registers the embedded font for the PDF export", async () => {
    await importMain();

    expect(pdfmake.addVirtualFileSystem).toHaveBeenCalledWith(vfs);
    expect(pdfmake.addFonts).toHaveBeenCalledWith({
      "DejaVu Sans": expect.objectContaining({ normal: "dejavu-sans.ttf" }),
    });
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
});
