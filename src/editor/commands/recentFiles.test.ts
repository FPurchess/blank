import { exists } from "@tauri-apps/plugin-fs";
import { info } from "@tauri-apps/plugin-log";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { afterEach, describe, expect, it, vi } from "vitest";

import { announcement, recentFiles } from "../../state";
import { createState, doc, p } from "../../test/editor";
import { openPaths } from "../tabs";
import { clearRecentFiles, openRecentFile } from "./recentFiles";

vi.mock("../tabs", () => ({ openPaths: vi.fn() }));

describe("the recent files", () => {
  const state = createState(doc(p("text")));
  afterEach(() => {
    recentFiles.value = [];
  });

  it("open a file that is there", async () => {
    vi.mocked(exists).mockResolvedValue(true);
    recentFiles.value = ["/docs/a.md"];

    expect(openRecentFile("/docs/a.md")(state)).toBe(true);
    expect(exists).not.toHaveBeenCalled();

    openRecentFile("/docs/a.md")(state, () => {});
    await vi.waitFor(() =>
      expect(openPaths).toHaveBeenCalledWith(["/docs/a.md"]),
    );
    expect(recentFiles.value).toEqual(["/docs/a.md"]);
  });

  it("say a file is gone and forget it", async () => {
    vi.mocked(exists).mockResolvedValue(false);
    recentFiles.value = ["/docs/a.md", "/docs/b.md"];

    openRecentFile("/docs/a.md")(state, () => {});

    await vi.waitFor(() =>
      expect(sendNotification).toHaveBeenCalledWith(
        "a.md isn't there any more",
      ),
    );
    expect(recentFiles.value).toEqual(["/docs/b.md"]);
    expect(openPaths).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(
      "the recent file /docs/a.md isn't there any more",
    );
  });

  it("open a file whose check failed, and log the failure", async () => {
    const failure = new Error("denied");
    vi.mocked(exists).mockRejectedValue(failure);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    recentFiles.value = ["/docs/a.md"];

    openRecentFile("/docs/a.md")(state, () => {});

    await vi.waitFor(() =>
      expect(openPaths).toHaveBeenCalledWith(["/docs/a.md"]),
    );
    expect(warn).toHaveBeenCalledWith(
      "can't check whether the recent file /docs/a.md is there",
      failure,
    );
    expect(recentFiles.value).toEqual(["/docs/a.md"]);
  });

  it("are cleared", () => {
    recentFiles.value = ["/docs/a.md"];
    expect(clearRecentFiles()(state)).toBe(true);
    expect(recentFiles.value).toHaveLength(1);

    clearRecentFiles()(state, () => {});
    expect(recentFiles.value).toEqual([]);
    expect(announcement.value?.text).toBe("Recent files cleared");
  });
});
