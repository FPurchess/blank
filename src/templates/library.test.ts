import { exists, readDir, readTextFile } from "@tauri-apps/plugin-fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockTauriPath } from "../test/tauri";
import { loadTemplates } from "./library";

const file = (name: string) =>
  ({ name, isFile: true, isDirectory: false, isSymlink: false }) as Awaited<
    ReturnType<typeof readDir>
  >[number];

describe("loadTemplates", () => {
  beforeEach(() => mockTauriPath({ appConfigDir: "/config" }));

  it("has Blank's recipe and letter, which are templates", async () => {
    vi.mocked(exists).mockResolvedValue(false);
    const templates = await loadTemplates();
    expect(templates.map((template) => template.id)).toEqual([
      "blank/recipe",
      "blank/letter",
    ]);
    for (const { definition } of templates) {
      expect(typeof definition).not.toBe("string");
    }
  });

  it("reads the user's templates, named after their files", async () => {
    vi.mocked(exists).mockResolvedValue(true);
    vi.mocked(readDir).mockResolvedValue([
      file("Letter Head.yaml"),
      file("broken.yml"),
      file("notes.txt"),
    ]);
    vi.mocked(readTextFile).mockImplementation(async (path) =>
      String(path).endsWith("broken.yml")
        ? "version: 1\nname: Broken\n"
        : "version: 2\nname: Letter\nfields:\n  - {name: to, kind: rich, label: To}\n",
    );
    const templates = (await loadTemplates()).slice(2);
    expect(templates.map((template) => template.id)).toEqual([
      "user/broken",
      "user/letter-head",
    ]);
    expect(templates[0].definition).toBe("it needs fields");
    expect(templates[1].definition).toMatchObject({
      id: "user/letter-head",
      version: 2,
    });
    expect(readTextFile).toHaveBeenCalledWith(
      "/config/templates/Letter Head.yaml",
    );
  });

  it("takes only one of two files that make one id", async () => {
    vi.mocked(exists).mockResolvedValue(true);
    vi.mocked(readDir).mockResolvedValue([file("Note.yml"), file("note.yaml")]);
    vi.mocked(readTextFile).mockResolvedValue(
      "version: 1\nname: Note\nfields:\n  - {name: text, kind: rich, label: Text}\n",
    );
    const [first, second] = (await loadTemplates()).slice(2);
    expect(first.definition).toMatchObject({ id: "user/note" });
    expect(second.definition).toBe(
      "another file of the templates folder has the name note",
    );
  });

  it("does without the folder when it can't be read", async () => {
    vi.mocked(exists).mockRejectedValue(new Error("denied"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await loadTemplates()).toHaveLength(2);
  });
});
