import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";

import type { Node } from "prosemirror-model";

import { parseMarkdown, schema } from "../../markdown";
import { createState, doc as docOf, p } from "../../test/editor";
import { displayMath } from "../../test/math";
import { testLayout } from "../../test/layout";
import toDOCX from ".";
import { addMath, M, structural } from "./math";

vi.mock("./font", () => ({
  loadFonts: async () => [],
}));

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

const exported = async (markdown: string | Node) => {
  const { contents, warnings } = await toDOCX(
    createState(
      typeof markdown === "string" ? parseMarkdown(markdown) : markdown,
    ),
    { docPath: null, layout: testLayout() },
  );
  const zip = await JSZip.loadAsync(contents);
  const xml = await zip.file("word/document.xml")!.async("string");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const part = Object.keys(zip.files).find((name) =>
    /^customXml\/item\d+\.xml$/.test(name),
  );
  const stored = part ? await zip.file(part)!.async("string") : "";
  return { doc, xml, warnings, stored };
};

describe("math in the Word export", () => {
  it("writes Word's equations", async () => {
    const { doc, xml, warnings } = await exported(
      "So $\\frac{a}{b}$ is.\n\n$$\nx^2\n$$",
    );
    expect(warnings).toEqual([]);
    // the inline one in its paragraph, the display one on a paragraph of
    // its own
    const inline = doc.getElementsByTagNameNS(M, "oMath")[0];
    expect(inline.getElementsByTagNameNS(M, "f")).toHaveLength(1);
    const paragraphs = doc.getElementsByTagNameNS(M, "oMathPara");
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].parentElement?.localName).toBe("p");
    // no placeholder is left
    expect(xml).not.toContain("BlankMath");
    expect(xml).toContain('w:val="Equation"');
  });

  it("puts what a sum adds up into it, not beside it", async () => {
    const { doc } = await exported("$$\n\\sum_{i=1}^n i = 1\n$$");
    const nary = doc.getElementsByTagNameNS(M, "nary")[0];
    const operand = [...nary.children].find(
      (child) => child.localName === "e",
    )!;
    expect(operand.textContent).toBe("i");
    // and the relation stays after it
    expect(nary.parentElement!.textContent).toContain("=1");
  });

  it("numbers a numbered equation with a SEQ field", async () => {
    const { doc, xml } = await exported("$$\na = b\n$$ {#eq-a}");
    expect(xml).toContain("SEQ Equation");
    expect(doc.getElementsByTagNameNS(M, "oMathPara")).toHaveLength(0);
    const math = doc.getElementsByTagNameNS(M, "oMath")[0];
    const paragraph = math.parentElement!;
    expect(paragraph.getElementsByTagNameNS(W, "tab").length).toBeGreaterThan(
      0,
    );
    expect(paragraph.textContent).toContain("(1)");
  });

  it("keeps the LaTeX of each equation for the import", async () => {
    const { stored, doc } = await exported(
      "$x$ and $$y$$\n\n$$\nz\n$$ {#eq-z}",
    );
    const kept = JSON.parse(
      new DOMParser().parseFromString(stored, "application/xml").documentElement
        .textContent!,
    );
    expect(kept.map((entry: { latex: string }) => entry.latex)).toEqual([
      "x",
      "y",
      "z",
    ]);
    expect(kept[2]).toMatchObject({ display: true, label: "eq-z" });
    // each with the hash of what its equation is made of
    const first = doc.getElementsByTagNameNS(M, "oMath")[0];
    expect(kept[0].hash).toMatch(/^[0-9a-f]{8}$/);
    expect(structural(first)).toContain('"x"');
  });

  it("writes what Word can't get as an equation as its LaTeX", async () => {
    const { doc, warnings } = await exported("$\\nosuchcommand$");
    expect(warnings).toEqual([
      "1 equation went into Word as its LaTeX, which Word can't read as an equation.",
    ]);
    expect(doc.getElementsByTagNameNS(M, "t")[0].textContent).toBe(
      "\\nosuchcommand",
    );
  });

  it("escapes what XML reserves in a formula", async () => {
    const cases: [string, string][] = [
      ["x<y", "x<y"],
      ["a>b", "a>b"],
      ["a \\& b", "a&b"],
      ["\\lt", "<"],
    ];
    for (const [latex, text] of cases) {
      const { doc, warnings } = await exported(`So $${latex}$ is.`);
      expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
      expect(warnings).toEqual([]);
      const math = doc.getElementsByTagNameNS(M, "oMath")[0];
      expect(math.textContent).toBe(text);
    }
  });

  it("writes runs as the schema has them", async () => {
    const { doc } = await exported("$\\mathrm{d}x$");
    const runs = [...doc.getElementsByTagNameNS(M, "r")];
    // a style OMML has, if any
    for (const sty of doc.getElementsByTagNameNS(M, "sty")) {
      expect(["p", "b", "i", "bi"]).toContain(sty.getAttributeNS(M, "val"));
    }
    for (const run of runs) {
      const names = [...run.children].map((child) => child.localName);
      // the math properties first, no empty Word properties
      if (names.includes("rPr")) expect(names[0]).toBe("rPr");
      for (const props of run.children) {
        if (props.namespaceURI === W && props.localName === "rPr")
          expect(props.children.length).toBeGreaterThan(0);
      }
    }
    expect(runs[0].getElementsByTagNameNS(M, "nor")).toHaveLength(1);
  });

  it("keeps the colours the author gave", async () => {
    const { doc, xml } = await exported(
      "$x\\color{red}{y}\\colorbox{yellow}{z}$",
    );
    const runs = [...doc.getElementsByTagNameNS(M, "r")].map((run) => ({
      text: run.textContent,
      color: run
        .getElementsByTagNameNS(W, "color")[0]
        ?.getAttributeNS(W, "val"),
      fill: run.getElementsByTagNameNS(W, "shd")[0]?.getAttributeNS(W, "fill"),
    }));
    expect(runs).toEqual([
      { text: "x", color: undefined, fill: undefined },
      { text: "y", color: "FF0000", fill: undefined },
      { text: "z", color: "FF0000", fill: "FFFF00" },
    ]);
    // nothing left of the marks
    expect(xml).not.toMatch(/[\uE010-\uE012]/);
    // Word's run properties after the math's, before the text
    for (const run of doc.getElementsByTagNameNS(M, "r")) {
      const names = [...run.children].map((child) => child.localName);
      expect(names.indexOf("t")).toBe(names.length - 1);
    }
  });

  it("keeps a coloured sum and integral Word's own", async () => {
    const { doc, xml } = await exported(
      "$\\color{red}{\\sum_{i=1}^n x_i + \\int_0^1 y}$",
    );
    expect(xml).not.toMatch(/[\uE010-\uE012]/);
    const chars = [...doc.getElementsByTagNameNS(M, "chr")].map((chr) =>
      chr.getAttributeNS(M, "val"),
    );
    expect(chars).toContain("∫");
    expect(doc.getElementsByTagNameNS(M, "nary").length).toBe(2);
  });

  it("puts in the LaTeX of an equation that doesn't parse", async () => {
    const zip = new JSZip();
    zip.file(
      "word/document.xml",
      `<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:rPr><w:rStyle w:val="BlankMath"/></w:rPr><w:t>0</w:t></w:r></w:p></w:body></w:document>`,
    );
    await addMath(zip, [
      {
        latex: "a<b",
        display: false,
        label: null,
        numbered: false,
        omml: `<m:oMath xmlns:m="${M}"><m:r><m:t>a<b</m:t></m:r></m:oMath>`,
      },
    ]);
    const xml = await zip.file("word/document.xml")!.async("string");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
    expect(doc.getElementsByTagNameNS(M, "t")[0].textContent).toBe("a<b");
  });

  it("puts in the LaTeX as text in a document it can't parse", async () => {
    const zip = new JSZip();
    const run = (n: number) =>
      `<w:r><w:rPr><w:rStyle w:val="BlankMath"/></w:rPr><w:t xml:space="preserve">${n}</w:t></w:r>`;
    zip.file(
      "word/document.xml",
      `<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>So</w:t></w:r>${run(0)}${run(1)}</w:p><broken></w:body></w:document>`,
    );
    const entry = {
      display: false,
      label: null,
      numbered: false,
      omml: null,
    };
    await addMath(zip, [{ ...entry, latex: "a<b" }]);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).not.toContain("BlankMath");
    expect(xml).toContain(
      '<w:r><w:t>So</w:t></w:r><w:r><w:t xml:space="preserve">a&lt;b</w:t></w:r></w:p>',
    );
  });

  // the positions of the tab stops of the paragraph with the equation
  const tabStops = (doc: Document) => {
    const paragraph = doc.getElementsByTagNameNS(M, "oMath")[0].parentElement!;
    return [...paragraph.getElementsByTagNameNS(W, "tab")]
      .filter((tab) => tab.parentElement?.localName === "tabs")
      .map((tab) => Number(tab.getAttributeNS(W, "pos")));
  };

  it("numbers equations as the pages do: not in a table's cell, nor with \\tag or \\notag", async () => {
    const cell = (content: Node) =>
      schema.nodes.table_cell.create(null, content);
    const table = schema.nodes.table.create(null, [
      schema.nodes.table_row.create(null, [cell(p("a")), cell(p("b"))]),
      schema.nodes.table_row.create(null, [
        cell(displayMath("a", { label: "eq-a" })),
        cell(p("c")),
      ]),
    ]);
    const { doc, xml } = await exported(
      docOf(
        table,
        displayMath("b \\notag", { label: "eq-b" }),
        displayMath("c % \\tag later", { label: "eq-c" }),
      ),
    );
    // only the last, whose \tag is in a comment, and it is the first
    expect(xml.match(/SEQ Equation/g)).toHaveLength(1);
    expect(doc.documentElement.textContent).toContain("(1)");
  });

  it("centers a numbered equation in a list between its indent and the margin", async () => {
    const { doc } = await exported("- item\n\n  $$\n  a\n  $$ {#eq-a}");
    const paragraph = doc.getElementsByTagNameNS(M, "oMath")[0].parentElement!;
    const left = Number(
      paragraph.getElementsByTagNameNS(W, "ind")[0].getAttributeNS(W, "left"),
    );
    const [center, right] = tabStops(doc);
    expect(left).toBeGreaterThan(0);
    expect(center).toBe(Math.round(left + (right - left) / 2));
  });

  it("keeps a formula in a link within the link", async () => {
    const { doc } = await exported("[link $z^2$](https://x)");
    const links = doc.getElementsByTagNameNS(W, "hyperlink");
    expect(links).toHaveLength(1);
    expect(links[0].getElementsByTagNameNS(M, "oMath")).toHaveLength(1);
  });
});
