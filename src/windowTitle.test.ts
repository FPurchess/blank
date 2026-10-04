import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { getCurrentWindow } from "@tauri-apps/api/window";

import { activeTabId, tabs } from "./state";
import { bootWindowTitle, windowTitle } from "./windowTitle";

vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: vi.fn() }));

let stop = () => {};
afterEach(() => {
  stop();
  tabs.value = [];
  activeTabId.value = null;
});

describe("windowTitle", () => {
  it("names the window after the tab", () => {
    expect(windowTitle("notes")).toBe("notes — Blank");
    expect(windowTitle(null)).toBe("Blank");
  });
});

describe("bootWindowTitle", () => {
  it("follows the active tab", async () => {
    const setTitle = vi.fn(async () => {});
    vi.mocked(getCurrentWindow).mockReturnValue({
      setTitle,
    } as unknown as ReturnType<typeof getCurrentWindow>);
    tabs.value = [
      {
        id: "a",
        path: "/docs/notes.md",
        importedFrom: null,
        untitledNumber: null,
        unsaved: false,
        viewAnchor: null,
      },
    ];
    activeTabId.value = "a";

    stop = bootWindowTitle();
    expect(setTitle).toHaveBeenCalledWith("notes — Blank");

    tabs.value = [{ ...tabs.value[0], path: "/docs/report.md" }];
    await nextTick();
    expect(setTitle).toHaveBeenLastCalledWith("report — Blank");
  });

  it("starts without a window", () => {
    vi.mocked(getCurrentWindow).mockImplementation(() => {
      throw new Error("no window");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    stop = bootWindowTitle();

    return vi.waitFor(() => expect(warn).toHaveBeenCalled());
  });
});
