import { exists, readDir, readTextFile } from "@tauri-apps/plugin-fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockTauriPath } from "../test/tauri";
import { loadForms } from "./library";

const file = (name: string) =>
  ({ name, isFile: true, isDirectory: false, isSymlink: false }) as Awaited<
    ReturnType<typeof readDir>
  >[number];

describe("loadForms", () => {
  beforeEach(() => mockTauriPath({ appConfigDir: "/config" }));

  it("has Blank's recipe, which is a form", async () => {
    vi.mocked(exists).mockResolvedValue(false);
    const [recipe, ...others] = await loadForms();
    expect(recipe.id).toBe("blank/recipe");
    expect(typeof recipe.definition).not.toBe("string");
    expect(others).toEqual([]);
  });

  it("reads the user's forms, named after their files", async () => {
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
    const forms = (await loadForms()).slice(1);
    expect(forms.map((form) => form.id)).toEqual([
      "user/broken",
      "user/letter-head",
    ]);
    expect(forms[0].definition).toBe("it needs fields");
    expect(forms[1].definition).toMatchObject({
      id: "user/letter-head",
      version: 2,
    });
    expect(readTextFile).toHaveBeenCalledWith("/config/forms/Letter Head.yaml");
  });

  it("takes only one of two files that make one id", async () => {
    vi.mocked(exists).mockResolvedValue(true);
    vi.mocked(readDir).mockResolvedValue([file("Note.yml"), file("note.yaml")]);
    vi.mocked(readTextFile).mockResolvedValue(
      "version: 1\nname: Note\nfields:\n  - {name: text, kind: rich, label: Text}\n",
    );
    const [first, second] = (await loadForms()).slice(1);
    expect(first.definition).toMatchObject({ id: "user/note" });
    // an id of its own, so the one that can be used stays apart from it
    expect(second).toEqual({
      id: "user/note~2",
      definition: "another file of the forms folder has the name note",
    });
  });

  it("does without the folder when it can't be read", async () => {
    vi.mocked(exists).mockRejectedValue(new Error("denied"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await loadForms()).toHaveLength(1);
  });
});
