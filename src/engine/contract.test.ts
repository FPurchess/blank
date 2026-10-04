import { describe, expect, it } from "vitest";

import { documentFields } from "../layout/bands";
import { resolveLayout } from "../layout/resolve";
import { DEFAULT_PAGE } from "../layout/settings";
import { Fragment, type Node } from "prosemirror-model";

import {
  checkDefinition,
  createForm,
  type Definition,
  definitionKey,
  schema,
} from "../markdown";
import {
  aligned,
  blockquote,
  captioned,
  codeBlock,
  docWithFrontmatter,
  h,
  li,
  ol,
  p,
  td,
  th,
  tr,
  ul,
} from "../test/editor";
import { settingsOf } from "./engine";
import { flatten } from "./flatten";

// What the webview sends the engine, for a document that uses every key of
// the items and the settings. model.rs reads the same file back
// (`reads_every_key_the_webview_sends`) and fails for a key it doesn't know,
// which serde would otherwise drop without a word.

const FRONTMATTER = [
  "title: Contract",
  "author: Someone",
  "page:",
  "  new-page-before: [1]",
  "  number-style: i",
  "  start-number: 3",
  "  header:",
  "    left: '{title}'",
  "  footer:",
  "    center: '{page} / {pages}'",
  "  first-page:",
  "    header:",
  "      right: '{author}'",
  "  even-pages:",
  "    footer:",
  "      left: '{chapter}'",
].join("\n");

const image = (src: string) =>
  schema.node("paragraph", null, [
    schema.nodes.image.create({ src, alt: "an image" }),
  ]);

// a paragraph with every mark the engine sets text in
const marked = schema.node("paragraph", null, [
  schema.text("bold ", [schema.marks.strong.create()]),
  schema.text("italic ", [schema.marks.em.create()]),
  schema.text("code ", [schema.marks.code.create()]),
  schema.text("link", [
    schema.marks.link.create({ href: "https://example.org" }),
  ]),
]);

// a form of every place a field can have: a frame, a grid's columns and the
// flow below them, with an empty heading that says its placeholder and an
// empty image field's box
const FORM = checkDefinition({
  id: "blank/contract",
  version: 1,
  name: "Contract",
  newPage: true,
  flowTop: "90mm",
  fields: [
    { name: "address", kind: "rich", label: "Address" },
    { name: "sender", kind: "text", style: "small", label: "From" },
    {
      name: "title",
      kind: "text",
      style: "h1",
      label: "Title",
      placeholder: "A title",
    },
    { name: "photo", kind: "image", label: "Photo", placeholder: "A photo" },
    { name: "notes", kind: "rich", label: "Notes" },
  ],
  layout: [
    { frame: { x: "20mm", y: "45mm", width: "85mm" }, field: "address" },
    { frame: { x: "20mm", y: "40mm", width: "85mm" }, field: "sender" },
    { field: "title" },
    {
      grid: { columns: ["40mm", "1fr"] },
      cells: [[{ field: "photo" }], [{ field: "notes" }]],
    },
  ],
}) as Definition;
const FORM_KEY = definitionKey(FORM);

const form = () => {
  const empty = createForm(FORM, FORM_KEY);
  const fill = (index: number, ...blocks: Node[]) =>
    empty.child(index).copy(Fragment.fromArray(blocks));
  return empty.copy(
    Fragment.fromArray([
      fill(0, p("Ann Example"), p("Long Street 12")),
      fill(1, p("Bea · Hill Road 3")),
      empty.child(2),
      empty.child(3),
      fill(4, p("a note")),
    ]),
  );
};

const rich = docWithFrontmatter(
  FRONTMATTER,
  h(1, "Chapter"),
  marked,
  blockquote(p("quoted"), p("more quoted")),
  ol(li(p("first"), schema.nodes.page_break.create())),
  ul(li(p("item"))),
  image("top.png"),
  aligned("center", p("centered")),
  aligned("right", h(2, "to the right")),
  aligned("center", image("centered.png")),
  codeBlock("code"),
  schema.nodes.horizontal_rule.create(),
  captioned(
    "A table",
    tr(th("left", { align: "left" }), th("right", { align: "right" })),
    tr(td("wide", { colspan: 2, colwidth: [40, 60] })),
    tr(
      td([codeBlock("code in a cell"), ul(li(p("a list")))], { rowspan: 1 }),
      td([image("cell.png"), blockquote(p("a quote"))]),
    ),
  ),
  schema.nodes.toc.create({ depth: 2, title: "Contents" }),
  schema.nodes.unknown_block.create({ raw: "<!-- blank:chart@3 -->" }),
  schema.nodes.embed.create({
    type: "org.example/sketch@1",
    id: "k3x9",
    width: "60mm",
    alt: "A sketch",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"/>',
  }),
  form(),
);
const withForm = rich.type.create(
  { ...rich.attrs, definitions: { [FORM_KEY]: FORM } },
  rich.content,
);

describe("the engine's contract", () => {
  it("sends every key the engine reads", async () => {
    const sizes = () => ({ width: 120, height: 80 });
    const items = flatten(withForm, sizes).map((record) => record.build());
    const { layout } = resolveLayout(
      rich.attrs.frontmatter as string,
      DEFAULT_PAGE,
      "de-DE",
    );
    const fields = documentFields(rich, "/notes/contract.md", {
      now: new Date("2026-01-01T00:00:00Z"),
      locale: "en-GB",
    });
    const sent = { items, settings: settingsOf(layout, fields) };
    expect(items.some((item) => item.barsContinue)).toBe(true);
    await expect(JSON.stringify(sent, null, 2) + "\n").toMatchFileSnapshot(
      "./__fixtures__/contract.json",
    );
  });
});
