import { describe, expect, it } from "vitest";

import { documentFields } from "../layout/bands";
import { resolveLayout } from "../layout/resolve";
import { DEFAULT_PAGE } from "../layout/settings";
import { schema } from "../markdown";
import {
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

const document = docWithFrontmatter(
  FRONTMATTER,
  h(1, "Chapter"),
  marked,
  blockquote(p("quoted"), p("more quoted")),
  ol(li(p("first"), schema.nodes.page_break.create())),
  ul(li(p("item"))),
  image("top.png"),
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
);

describe("the engine's contract", () => {
  it("sends every key the engine reads", async () => {
    const sizes = () => ({ width: 120, height: 80 });
    const items = flatten(document, sizes).map((record) => record.build());
    const { layout } = resolveLayout(
      document.attrs.frontmatter as string,
      DEFAULT_PAGE,
      "de-DE",
    );
    const fields = documentFields(document, "/notes/contract.md", {
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
