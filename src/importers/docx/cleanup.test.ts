import { describe, expect, it } from "vitest";

import { DROPPED_IMAGE_SRC, cleanup } from "./cleanup";

const clean = (html: string) => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const report = cleanup(doc);
  return { html: doc.body.innerHTML, report };
};

describe("importers.docx.cleanup", () => {
  it("turns line breaks in code into newlines", () => {
    expect(clean("<pre>a<br>b</pre>").html).toBe("<pre>a\nb</pre>");
  });

  it("keeps footnotes at the end, after a line", () => {
    const { html, report } = clean(
      '<p>Text.<sup><a href="#footnote-2" id="footnote-ref-2">[1]</a></sup></p>' +
        '<ol><li id="footnote-2"><p> The note. <a href="#footnote-ref-2">↑</a></p></li></ol>',
    );

    expect(html).toBe(
      "<p>Text.<sup>[1]</sup></p><hr>" +
        '<ol data-tight="true"><li id="footnote-2"><p> The note. </p></li></ol>',
    );
    expect(report.footnotes).toBe(1);
  });

  it("leaves other numbered lists alone", () => {
    const { html, report } = clean("<ol><li>one</li></ol>");

    expect(html).toBe('<ol data-tight="true"><li>one</li></ol>');
    expect(report.footnotes).toBe(0);
  });

  it("removes comments and their markers", () => {
    const { html, report } = clean(
      '<p>text<sup><a href="#comment-0" id="comment-ref-0">[1]</a></sup> rest</p>' +
        '<dl><dt id="comment-0">Comment [1]</dt><dd><p>a remark</p></dd></dl><dl><dt>term</dt></dl>',
    );

    expect(html).toBe("<p>text rest</p><dl><dt>term</dt></dl>");
    expect(report.comments).toBe(1);
  });

  it("keeps tables, with an empty paragraph in every empty cell", () => {
    const { html, report } = clean(
      "<table><thead><tr><th><p>Name</p></th><th><p>Value</p></th></tr></thead>" +
        "<tbody><tr><td><p>a</p><p></p><p>more</p></td><td><p><em>1</em></p></td></tr>" +
        "<tr><td><p></p></td><td>2</td></tr></tbody></table>",
    );

    expect(html).toBe(
      "<table><thead><tr><th><p>Name</p></th><th><p>Value</p></th></tr></thead>" +
        "<tbody><tr><td><p>a</p><p>more</p></td><td><p><em>1</em></p></td></tr>" +
        "<tr><td><p></p></td><td>2</td></tr></tbody></table>",
    );
    expect(report.nestedTables).toBe(0);
  });

  it("makes the first row the header of a table without one", () => {
    const { html } = clean(
      '<table><tr><td>a</td><td colspan="2">b</td></tr><tr><td>1</td><td>2</td><td>3</td></tr></table>',
    );

    expect(html).toBe(
      '<table><tbody><tr><th>a</th><th colspan="2">b</th></tr><tr><td>1</td><td>2</td><td>3</td></tr></tbody></table>',
    );
  });

  it.each([
    [
      "before",
      '<p class="blank-caption">Stock</p><table><tr><th>a</th></tr></table>',
    ],
    [
      "after",
      '<table><tr><th>a</th></tr></table><p class="blank-caption">Stock</p>',
    ],
  ])("makes a caption %s a table its caption", (_, input) => {
    expect(clean(input).html).toBe(
      '<table data-caption="Stock"><tbody><tr><th>a</th></tr></tbody></table>',
    );
  });

  it("gives a caption between two tables to the table below it", () => {
    const { html } = clean(
      "<table><tr><th>a</th></tr></table>" +
        '<p class="blank-caption">Second</p>' +
        "<table><tr><th>b</th></tr></table>",
    );

    expect(html).toBe(
      "<table><tbody><tr><th>a</th></tr></tbody></table>" +
        '<table data-caption="Second"><tbody><tr><th>b</th></tr></tbody></table>',
    );
  });

  it("keeps the table heading style outside tables as plain paragraphs", () => {
    expect(clean('<p class="blank-th">heading</p>').html).toBe(
      "<p>heading</p>",
    );
  });

  it("keeps a caption that isn't next to a table as a paragraph", () => {
    expect(clean('<p class="blank-caption">Figure 1</p><p>text</p>').html).toBe(
      "<p>Figure 1</p><p>text</p>",
    );
  });

  it("makes cells in the table heading style header cells", () => {
    const { html } = clean(
      '<table><tr><th>a</th><th>b</th></tr><tr><td><p class="blank-th">c</p></td>' +
        '<td><p class="blank-th">d</p><p>e</p></td></tr></table>',
    );

    expect(html).toBe(
      "<table><tbody><tr><th>a</th><th>b</th></tr>" +
        "<tr><th><p>c</p></th><td><p>d</p><p>e</p></td></tr></tbody></table>",
    );
  });

  it("turns tables inside tables into text and counts them", () => {
    const { html, report } = clean(
      "<table><tr><td><p>outer</p><table><tr><th>x</th><th>y</th></tr></table></td></tr></table>",
    );

    expect(html).toBe(
      "<table><tbody><tr><th><p>outer</p><p>x | y</p></th></tr></tbody></table>",
    );
    expect(report.nestedTables).toBe(1);
  });

  it("keeps web and mail links and unwraps the others", () => {
    const { html } = clean(
      '<p><a href="https://example.com" id="x">web</a> <a href="mailto:a@b.c">mail</a> ' +
        '<a href="#section">anchor</a> <a href="javascript:alert(1)">script</a> ' +
        '<a href="file:///etc/passwd">file</a> <a id="bookmark"></a>end</p>',
    );

    expect(html).toBe(
      '<p><a href="https://example.com">web</a> <a href="mailto:a@b.c">mail</a> ' +
        "anchor script file end</p>",
    );
  });

  it("writes the alt text of images that couldn't be imported", () => {
    const { html, report } = clean(
      `<p><img src="${DROPPED_IMAGE_SRC}" alt="Chart"><img src="${DROPPED_IMAGE_SRC}"><img src="data:image/png;base64,AA"></p>`,
    );

    expect(html).toBe(
      '<p><em>Chart</em><img src="data:image/png;base64,AA"></p>',
    );
    expect(report.droppedImages).toBe(2);
  });

  it("turns horizontal lines into <hr> and drops empty paragraphs", () => {
    const { html } = clean(
      '<p>a</p><p class="blank-hr"></p><p>\n</p><p><br></p><p><img src="x"></p>',
    );

    expect(html).toBe('<p>a</p><hr><p><br></p><p><img src="x"></p>');
  });

  it("marks lists of single paragraphs as tight", () => {
    const { html } = clean(
      "<ul><li>a</li><li><p>b</p><ul><li>c</li></ul></li></ul>" +
        "<ol><li><p>d</p><p>more</p></li></ol>",
    );

    expect(html).toBe(
      '<ul data-tight="true"><li>a</li><li><p>b</p><ul data-tight="true"><li>c</li></ul></li></ul>' +
        "<ol><li><p>d</p><p>more</p></li></ol>",
    );
  });
});
