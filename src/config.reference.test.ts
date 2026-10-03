import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { config } from "./config";
import { DEFAULT_PAGE, readPageSettings } from "./layout/settings";

// The reference blank.json at the root of the repository and the list of
// shortcuts in the docs show the defaults, so they must change with them.

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

// before bootConfig, the config is the defaults
const defaults = config.value;

describe("the reference blank.json", () => {
  const reference = JSON.parse(read("blank.json"));

  it("holds every section", () => {
    expect(Object.keys(reference)).toEqual(Object.keys(defaults));
  });

  it("holds the defaults", () => {
    for (const section of ["keymap", "autocorrect", "spellcheck", "editor"])
      expect(reference[section], section).toEqual(
        defaults[section as keyof typeof defaults],
      );
  });

  it("lists the shortcuts in the order of the defaults", () => {
    expect(Object.keys(reference.keymap)).toEqual(Object.keys(defaults.keymap));
  });

  it("holds the default page, as written in the frontmatter", () => {
    const problems: string[] = [];
    expect(
      readPageSettings(
        reference.layout.page,
        DEFAULT_PAGE,
        problems,
        "layout.page",
      ),
    ).toEqual(DEFAULT_PAGE);
    expect(problems).toEqual([]);
    expect(defaults.layout.page).toEqual(DEFAULT_PAGE);
  });
});

describe("the shortcuts in the docs", () => {
  const shortcuts = read("docs/guide/shortcuts.md");

  // "Mod-Shift-s" is written `Mod` `Shift` `S` there
  const keycaps = (binding: string) =>
    binding
      .split("-")
      .map((key) => `\`${key.length === 1 ? key.toUpperCase() : key}\``)
      .join(" ");

  // the docs list the headings in one row, `Mod` `1` … `6`
  const IN_ONE_ROW = new Set([
    "blocktype.heading2",
    "blocktype.heading3",
    "blocktype.heading4",
    "blocktype.heading5",
    "blocktype.heading6",
  ]);

  it("show every default binding", () => {
    for (const [command, binding] of Object.entries(defaults.keymap)) {
      if (IN_ONE_ROW.has(command)) continue;
      expect(shortcuts, command).toContain(keycaps(binding));
    }
    expect(shortcuts).toContain("`Mod` `1` … `6`");
  });
});
