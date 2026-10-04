import { afterEach, describe, expect, it } from "vitest";

import { schema } from "../markdown";
import { listedHeadings } from "../markdown/headings";
import { blockquote, doc, h, li, p, ul } from "../test/editor";
import { headings, headingsOf, publishHeadings } from "./headings";

describe("headingsOf", () => {
  it("lists the top-level headings in order, with their level and position", () => {
    const node = doc(h(1, "One"), p("text"), h(2, "Two"), h(6, "Six"));
    expect(headingsOf(node)).toEqual([
      { level: 1, text: "One", pos: 0 },
      { level: 2, text: "Two", pos: 11 },
      { level: 6, text: "Six", pos: 16 },
    ]);
  });

  it("leaves out headings in quotes and lists, as the PDF's bookmarks do", () => {
    const node = doc(
      blockquote(h(1, "Quoted")),
      ul(li(h(2, "Listed"))),
      h(1, "Top"),
    );
    expect(headingsOf(node).map((heading) => heading.text)).toEqual(["Top"]);
  });

  it("reads an image in a heading as a space", () => {
    const node = doc(
      schema.node("heading", { level: 1 }, [
        schema.text("Two"),
        schema.node("image", { src: "a.png" }),
        schema.text("words"),
      ]),
    );
    expect(headingsOf(node)[0].text).toBe("Two words");
  });

  it("leaves out an empty heading, as a table of contents does", () => {
    const node = doc(h(1, "One"), h(2), h(2, "Two"));
    expect(headingsOf(node)).toEqual(listedHeadings(node));
    expect(headingsOf(node).map((heading) => heading.text)).toEqual([
      "One",
      "Two",
    ]);
  });
});

describe("publishHeadings", () => {
  afterEach(() => {
    headings.value = [];
  });

  it("publishes the headings of a document", () => {
    publishHeadings(doc(h(1, "One"), h(2, "Two")));
    expect(headings.value.map((heading) => heading.text)).toEqual([
      "One",
      "Two",
    ]);
  });

  it("keeps the same list while the headings stay the same", () => {
    publishHeadings(doc(h(1, "One"), p("a")));
    const before = headings.value;
    publishHeadings(doc(h(1, "One"), p("ab")));
    expect(headings.value).toBe(before);
  });

  it.each([
    ["text", doc(h(1, "Once"), p("a"))],
    ["level", doc(h(2, "One"), p("a"))],
    ["position", doc(p("x"), h(1, "One"), p("a"))],
  ])("publishes a new list when a heading's %s changes", (_, next) => {
    publishHeadings(doc(h(1, "One"), p("a")));
    const before = headings.value;
    publishHeadings(next);
    expect(headings.value).not.toBe(before);
  });
});
