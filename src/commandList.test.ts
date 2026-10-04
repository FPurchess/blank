import { describe, expect, it } from "vitest";

import {
  commandGroups,
  commandInfo,
  commandLabel,
  commands,
} from "./commandList";
import { CommandIdentifier } from "./config";
import { iconNames } from "./icons";

// the commands that open a dialog, whose labels end in "…"
const DIALOGS = new Set([
  CommandIdentifier.FILE_OPEN,
  CommandIdentifier.FILE_SAVE_AS,
  CommandIdentifier.EXPORT_PDF,
  CommandIdentifier.EXPORT_DOCX,
  CommandIdentifier.INSERT_IMAGE,
  CommandIdentifier.FORMAT_LINK,
  CommandIdentifier.PAGE_SETUP,
]);

// words that keep their capital inside a label
const NAMES = new Set(["PDF", "Word"]);

describe("the command list", () => {
  it("lists every command once", () => {
    const ids = commands.map(({ id }) => id);
    expect([...ids].sort()).toEqual(Object.values(CommandIdentifier).sort());
  });

  it("lists the commands by group", () => {
    const order = commands.map(({ group }) => commandGroups.indexOf(group));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it.each(commands)("names $id in sentence case", ({ label }) => {
    const [first, ...rest] = label.split(" ");
    expect(first[0]).toBe(first[0].toUpperCase());
    for (const word of rest) {
      if (!NAMES.has(word.replace("…", ""))) {
        expect(word).toBe(word.toLowerCase());
      }
    }
  });

  it.each(commands)(
    "ends the label of $id in … if it opens a dialog",
    (info) => {
      expect(info.label.endsWith("…")).toBe(DIALOGS.has(info.id));
    },
  );

  it("gives every command its own label", () => {
    const labels = commands.map(({ label }) => label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it.each(commands)("draws $id with a known icon", ({ icon }) => {
    expect(iconNames).toContain(icon);
  });

  it.each(commands)("finds $id by lower case words", ({ aliases }) => {
    for (const alias of aliases) expect(alias).toBe(alias.toLowerCase());
    expect(new Set(aliases).size).toBe(aliases.length);
  });

  it("looks a command up", () => {
    expect(commandLabel(CommandIdentifier.PAGE_SETUP)).toBe("Page setup…");
    expect(commandInfo(CommandIdentifier.BLOCKTYPE_HEADING1)).toMatchObject({
      group: "Format",
      short: "H1",
      icon: "heading",
    });
  });
});
