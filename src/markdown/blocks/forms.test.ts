import { describe, expect, it } from "vitest";
import type { Node } from "prosemirror-model";
import { stringify } from "yaml";

import {
  RECIPE as FULL,
  RECIPE_KEY as FULL_KEY,
  field,
  SHORT_KEY,
  SHORT_RECIPE,
} from "../../test/forms";
import { p } from "../../test/editor";
import { listedHeadings } from "../headings";
import { parseMarkdown, schema, serializeMarkdown } from "../index";
import { createForm, fitField, fitForm } from "./forms";

const RECIPE = SHORT_RECIPE;
const KEY = SHORT_KEY;

const section = (...yamls: string[]) =>
  [
    "<!-- blank:definitions@1 -->",
    ...yamls.map((yaml) => `\`\`\`\`yaml\n${yaml}\`\`\`\``),
    "<!-- /blank:definitions -->",
  ].join("\n\n");

const recipe = (title: string, steps: string) =>
  [
    `<!-- blank:form@1 def="${KEY}" -->`,
    '<!-- blank:field name="title" -->',
    title,
    '<!-- blank:field name="steps" -->',
    steps,
    "<!-- /blank:form -->",
  ]
    .filter(Boolean)
    .join("\n\n");

const types = (node: Node) => {
  const names: string[] = [];
  node.forEach((child) => names.push(child.type.name));
  return names;
};

describe("forms", () => {
  const file = (body: string) => `${body}\n\n${section(stringify(RECIPE))}`;

  it("reads a form with its fields and definition", () => {
    const parsed = parseMarkdown(
      file(`Intro\n\n${recipe("# Pancakes", "Mix.")}`),
    );
    expect(types(parsed)).toEqual(["paragraph", "form_block"]);
    const form = parsed.child(1);
    expect(form.attrs.def).toBe(KEY);
    expect(form.child(0).attrs.name).toBe("title");
    expect(form.child(0).firstChild?.type.name).toBe("heading");
    expect(form.child(1).textContent).toBe("Mix.");
    expect(parsed.attrs.definitions).toEqual({ [KEY]: RECIPE });
  });

  it("round-trips a form, its definition at the end", () => {
    const markdown = file(
      `${recipe("# Pancakes", "Mix.\n\n* flour\n* milk")}\n\nAfter`,
    );
    expect(serializeMarkdown(parseMarkdown(markdown))).toBe(markdown);
  });

  it("keeps an empty field empty", () => {
    const markdown = file(recipe("", "Mix."));
    const parsed = parseMarkdown(markdown);
    // in the style of its field
    expect(parsed.child(0).child(0).firstChild?.type.name).toBe("heading");
    expect(serializeMarkdown(parsed)).toBe(markdown);
  });

  it("reads a closing marker right after a field's text", () => {
    const tight = [
      `<!-- blank:form@1 def="${KEY}" -->`,
      '<!-- blank:field name="title" -->',
      "# Pancakes",
      '<!-- blank:field name="steps" -->',
      "Mix.",
      "<!-- /blank:form -->",
    ].join("\n");
    expect(types(parseMarkdown(file(tight)))).toEqual(["form_block"]);
  });

  it.each([
    [
      "without its definition",
      (markdown: string) => markdown.split("\n\n<!-- blank:definitions")[0],
    ],
    [
      "with a field it doesn't have",
      (markdown: string) => markdown.replace('name="steps"', 'name="notes"'),
    ],
    [
      "with a page break in a field",
      (markdown: string) =>
        markdown.replace("Mix.", "Mix.\n\n<!-- pagebreak -->"),
    ],
    [
      "with text before its first field",
      (markdown: string) =>
        markdown.replace(
          '<!-- blank:field name="title" -->',
          'Loose\n\n<!-- blank:field name="title" -->',
        ),
    ],
  ])("keeps a form %s as it is", (_, change) => {
    const markdown = change(file(recipe("# Pancakes", "Mix.")));
    const parsed = parseMarkdown(markdown);
    expect(types(parsed)[0]).toBe("unknown_block");
    expect(serializeMarkdown(parsed)).toBe(markdown);
  });

  it("writes only the definitions forms use, and those blocks it can't show name", () => {
    const unused = file("Text");
    expect(serializeMarkdown(parseMarkdown(unused))).toBe("Text");
    // a form of a newer format still names its definition
    const newer = file(
      recipe("# Pancakes", "Mix.").replace("form@1", "form@2"),
    );
    expect(serializeMarkdown(parseMarkdown(newer))).toBe(newer);
  });

  it("keeps a definition it can't read as it was written", () => {
    const odd = section("id: user/x\nversion: one # a note\n");
    const markdown = `Text\n\n${odd}`;
    const parsed = parseMarkdown(markdown);
    expect(parsed.attrs.rawDefinitions).toHaveLength(1);
    expect(serializeMarkdown(parsed)).toBe(markdown);
  });

  it("lists the headings in fields as the document's", () => {
    const parsed = parseMarkdown(
      file(`# Book\n\n${recipe("# Pancakes", "## Batter\n\n> ## Quoted")}`),
    );
    const listed = listedHeadings(parsed);
    expect(listed.map(({ level, text }) => [level, text])).toEqual([
      [1, "Book"],
      [1, "Pancakes"],
      [2, "Batter"],
    ]);
    // where each starts
    for (const { pos, text } of listed) {
      expect(parsed.nodeAt(pos)?.textContent).toBe(text);
    }
  });
});

describe("createForm", () => {
  it("makes each field as its kind starts", () => {
    const form = createForm(FULL, FULL_KEY);
    expect(form.attrs.def).toBe(FULL_KEY);
    expect(form.childCount).toBe(4);
    expect(form.child(0).firstChild?.type.name).toBe("heading");
    expect(form.child(1).firstChild?.type.name).toBe("paragraph");
    const table = form.child(2).firstChild!;
    expect(table.type.name).toBe("table");
    expect(table.firstChild!.textContent).toBe("AmountIngredient");
    expect(table.childCount).toBe(2);
  });
});

describe("fitForm", () => {
  it("leaves a form as its definition says alone", () => {
    expect(fitForm(createForm(FULL, FULL_KEY), FULL)).toBeNull();
  });

  it("puts the fields in order, makes the missing ones and keeps what others held", () => {
    const form = schema.node("form_block", { def: FULL_KEY }, [
      field("steps", p("Mix.")),
      field("notes", p("A note")),
    ]);
    const fitted = fitForm(form, FULL)!;
    expect(fitted.form.content.content.map((each) => each.attrs.name)).toEqual([
      "title",
      "photo",
      "ingredients",
      "steps",
    ]);
    expect(fitted.form.child(3).textContent).toBe("Mix.");
    expect(fitted.rest.map((block) => block.textContent)).toEqual(["A note"]);
  });

  it("keeps a text field to one line in its style, and a table field with a table", () => {
    const title = fitField(
      field("title", p("Pan"), p("cakes")),
      FULL.fields[0],
    );
    expect(title.childCount).toBe(1);
    expect(title.firstChild!.type.name).toBe("heading");
    expect(title.textContent).toBe("Pan cakes");
    const table = fitField(field("ingredients", p("x")), FULL.fields[2]);
    expect(table.lastChild!.type.name).toBe("table");
    expect(table.firstChild!.textContent).toBe("x");
  });

  it("takes page breaks out of a field", () => {
    const steps = fitField(
      field(
        "steps",
        schema.node("blockquote", null, [
          p("a"),
          schema.node("page_break"),
          p("b"),
        ]),
      ),
      FULL.fields[3],
    );
    let breaks = 0;
    steps.descendants((node) => {
      if (node.type.name === "page_break") breaks++;
    });
    expect(breaks).toBe(0);
    expect(steps.textContent).toBe("ab");
  });
});
