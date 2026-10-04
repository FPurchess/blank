import { describe, expect, it } from "vitest";
import { stringify } from "yaml";

import { SHORT_KEY as KEY, SHORT_RECIPE as RECIPE } from "../../test/forms";
import { parseMarkdown, serializeMarkdown } from "../index";
import { checkDefinition, definitionKey, readDefinition } from "./definitions";

const section = (...fences: string[]) =>
  [
    "<!-- blank:definitions@1 -->",
    ...fences,
    "<!-- /blank:definitions -->",
  ].join("\n\n");

const yamlFence = (yaml: string) => `\`\`\`\`yaml\n${yaml}\`\`\`\``;

const form = [
  `<!-- blank:form@1 def="${KEY}" -->`,
  '<!-- blank:field name="title" -->',
  "# Pancakes",
  '<!-- blank:field name="steps" -->',
  "Mix.",
  "<!-- /blank:form -->",
].join("\n\n");

describe("checkDefinition", () => {
  it("takes a template's fields", () => {
    expect(RECIPE.fields.map((field) => field.name)).toEqual([
      "title",
      "steps",
    ]);
  });

  it.each([
    ["no fields", { id: "user/a", version: 1, name: "A", fields: [] }],
    ["a bad id", { id: "A", version: 1, name: "A", fields: [{}] }],
    [
      "a field twice",
      {
        id: "user/a",
        version: 1,
        name: "A",
        fields: [
          { name: "x", kind: "rich", label: "X" },
          { name: "x", kind: "rich", label: "X" },
        ],
      },
    ],
    [
      "a style on a rich field",
      {
        id: "user/a",
        version: 1,
        name: "A",
        fields: [{ name: "x", kind: "rich", label: "X", style: "h1" }],
      },
    ],
    [
      "a key it doesn't know",
      {
        id: "user/a",
        version: 1,
        name: "A",
        layout: [],
        fields: [{ name: "x", kind: "rich", label: "X" }],
      },
    ],
  ])("says what is wrong with %s", (_, value) => {
    expect(typeof checkDefinition(value)).toBe("string");
  });

  it.each([
    ["frames without a new page", {}],
    ["a table in a frame", { newPage: true, framed: "list" }],
    ["a flowTop that isn't a length", { newPage: true, flowTop: "low" }],
  ])("says what is wrong with %s", (_, extra) => {
    const { framed = "note", ...rest } = extra as {
      framed?: string;
      newPage?: boolean;
      flowTop?: string;
    };
    const value = {
      id: "user/letter",
      version: 1,
      name: "Letter",
      ...rest,
      fields: [
        { name: "note", kind: "rich", label: "Note" },
        { name: "list", kind: "table", label: "List" },
      ],
      layout: [
        {
          frame: { x: "20mm", y: "45mm", width: "85mm" },
          field: framed,
        },
        { field: framed === "note" ? "list" : "note" },
      ],
    };
    if (framed === "list") value.fields.reverse();
    expect(typeof checkDefinition(value)).toBe("string");
  });

  it("gives definitions that say different things different keys", () => {
    const renamed = { ...RECIPE, name: "Dish" };
    expect(definitionKey(renamed)).not.toBe(KEY);
    expect(definitionKey(renamed).startsWith("blank/recipe@1#")).toBe(true);
    // however the YAML was written
    expect(definitionKey({ ...RECIPE })).toBe(KEY);
  });
});

describe("the definitions section", () => {
  const definitions = section(yamlFence(stringify(RECIPE)));

  it("gives the same definition the same key, however its YAML is ordered", () => {
    const reordered = readDefinition(
      [
        "fields:",
        "  - { label: Title, name: title, kind: text, style: h1, placeholder: Recipe name }",
        "  - { kind: rich, name: steps, label: Steps }",
        "newPage: true",
        "name: Recipe",
        "version: 1",
        "id: blank/recipe",
      ].join("\n"),
    );
    expect(typeof reordered).not.toBe("string");
    expect(definitionKey(reordered as typeof RECIPE)).toBe(KEY);
  });

  it("keeps a section holding more than YAML as a block it can't show", () => {
    const markdown = `${form}\n\n${section("Text", yamlFence(stringify(RECIPE)))}`;
    const parsed = parseMarkdown(markdown);
    expect(parsed.attrs.definitions).toEqual({});
    expect(parsed.lastChild!.type.name).toBe("unknown_block");
    expect(serializeMarkdown(parsed)).toBe(markdown);
  });

  it("keeps a section of a newer format as a block it can't show", () => {
    const newer = definitions.replace("definitions@1", "definitions@2");
    const markdown = `${form}\n\n${newer}`;
    const parsed = parseMarkdown(markdown);
    expect(parsed.firstChild!.type.name).toBe("unknown_block");
    expect(serializeMarkdown(parsed)).toBe(markdown);
  });

  it("writes the section at the end, wherever it was", () => {
    const parsed = parseMarkdown(`${definitions}\n\n${form}\n\nAfter`);
    expect(serializeMarkdown(parsed)).toBe(
      `${form}\n\nAfter\n\n${definitions}`,
    );
  });

  it("reads a section after the frontmatter, with no text", () => {
    const markdown = `---\ntitle: Book\n---\n\n${section(yamlFence("id: user/x\nversion: one\n"))}`;
    const parsed = parseMarkdown(markdown);
    expect(parsed.attrs.rawDefinitions).toHaveLength(1);
    expect(serializeMarkdown(parsed)).toBe(markdown);
  });
});
