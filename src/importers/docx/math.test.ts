import { describe, expect, it, vi } from "vitest";

import toDOCX from "../../exporters/docx";
import { M } from "../../exporters/docx/math";
import { resolveLayout } from "../../layout/resolve";
import { DEFAULT_PAGE } from "../../layout/settings";
import { parseMarkdown, serializeMarkdown } from "../../markdown";
import { createState } from "../../test/editor";
import { rewriteDocx } from "../../test/docx";
import { importDocx } from ".";
import { ommlToLatex } from "./omml";

vi.mock("../../images/codec", () => ({
  decodeSize: vi.fn(),
  rasterize: vi.fn(),
}));
vi.mock("../../exporters/docx/font", () => ({ loadFonts: async () => [] }));

const exportDocx = async (markdown: string) => {
  const doc = parseMarkdown(markdown);
  const { layout } = resolveLayout(doc.attrs.frontmatter, DEFAULT_PAGE);
  return (await toDOCX(createState(doc), { docPath: null, layout })).contents;
};

const roundTrip = async (markdown: string) => {
  const { doc, warnings } = await importDocx(
    await exportDocx(markdown),
    DEFAULT_PAGE,
  );
  return { markdown: serializeMarkdown(doc).trim(), warnings };
};

const omml = (inner: string) =>
  new DOMParser().parseFromString(
    `<m:oMath xmlns:m="${M}">${inner}</m:oMath>`,
    "application/xml",
  ).documentElement;

const r = (text: string) => `<m:r><m:t>${text}</m:t></m:r>`;

describe("math through Word and back", () => {
  it("keeps the LaTeX of every formula", async () => {
    const markdown = [
      "So $\\frac{a}{b}$ and $\\mathbb{R}^n$ are.",
      "$$\n\\int_0^\\infty e^{-x^2}\\,dx\n$$",
      "$$\na = b\n$$ {#eq-ab}",
    ].join("\n\n");
    const { markdown: back, warnings } = await roundTrip(markdown);
    expect(warnings).toEqual([]);
    expect(back).toBe(markdown);
  });

  it("keeps a formula in a link", async () => {
    const markdown = "See [link $z^2$](https://x).";
    expect((await roundTrip(markdown)).markdown).toBe(markdown);
  });

  it("keeps display math aligned", async () => {
    const markdown = '<div align="right">\n\n$$\nx\n$$\n\n</div>';
    expect((await roundTrip(markdown)).markdown).toBe(markdown);
  });

  it("reads an equation changed in Word from its OMML", async () => {
    const bytes = await exportDocx("So $a$ is.");
    // Word changed the a into a b
    const changed = await rewriteDocx(bytes, "word/document.xml", (xml) =>
      xml!.replace(/<m:t xml:space="preserve">a<\/m:t>/, "<m:t>b</m:t>"),
    );
    const { doc } = await importDocx(changed, DEFAULT_PAGE);
    expect(serializeMarkdown(doc).trim()).toBe("So $b$ is.");
  });

  it("keeps the LaTeX when Word saved the file again", async () => {
    const bytes = await exportDocx("So $x^2$ is.");
    // properties Word adds to every run when it saves
    const saved = await rewriteDocx(bytes, "word/document.xml", (xml) =>
      xml!.replaceAll(
        "<m:r>",
        '<m:r><w:rPr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rFonts w:ascii="Cambria Math"/></w:rPr>',
      ),
    );
    const { doc } = await importDocx(saved, DEFAULT_PAGE);
    expect(serializeMarkdown(doc).trim()).toBe("So $x^2$ is.");
  });

  it("keeps the LaTeX when Word split its runs and marked them", async () => {
    const bytes = await exportDocx("So $\\text{for all}$ is.");
    // Word's proofing marks and bookmarks in the equation, the text in two
    // runs and a run of a space
    const saved = await rewriteDocx(bytes, "word/document.xml", (xml) =>
      xml!.replace(
        /<m:t xml:space="preserve">for all<\/m:t><\/m:r>/,
        `<m:t>for</m:t></m:r><w:proofErr w:type="spellStart"/><w:bookmarkStart w:id="0" w:name="a"/><m:r><m:t xml:space="preserve"> all</m:t></m:r><w:bookmarkEnd w:id="0"/><m:r><m:t xml:space="preserve"> </m:t></m:r>`,
      ),
    );
    expect(saved).not.toEqual(bytes);
    const { doc } = await importDocx(saved, DEFAULT_PAGE);
    expect(serializeMarkdown(doc).trim()).toBe("So $\\text{for all}$ is.");
  });

  it("reads a line added to display math in Word", async () => {
    const bytes = await exportDocx("$$\nx\n$$");
    const changed = await rewriteDocx(bytes, "word/document.xml", (xml) =>
      xml!.replace(
        "</m:oMath></m:oMathPara>",
        "</m:oMath><m:oMath><m:r><m:t>y</m:t></m:r></m:oMath></m:oMathPara>",
      ),
    );
    const { doc } = await importDocx(changed, DEFAULT_PAGE);
    expect(serializeMarkdown(doc).trim()).toBe(
      "$$\n\\begin{gathered}x \\\\ y\\end{gathered}\n$$",
    );
  });
});

// a paragraph a Word user added at the start of the document
const prepend = (bytes: Uint8Array, paragraph: string) =>
  rewriteDocx(bytes, "word/document.xml", (xml) =>
    xml!.replace("<w:body>", `<w:body>${paragraph}`),
  );
const ns = `xmlns:m="${M}"`;

describe("equations made in Word", () => {
  it("keep the LaTeX of the equations after them", async () => {
    const markdown = "So $\\mathbb{R}^n$ and $\\int_0^1 x\\,dx$ are.";
    const added = await prepend(
      await exportDocx(markdown),
      `<w:p><m:oMath ${ns}>${r("y")}</m:oMath></w:p>`,
    );
    const { doc } = await importDocx(added, DEFAULT_PAGE);
    expect(serializeMarkdown(doc).trim()).toBe(`$$\ny\n$$\n\n${markdown}`);
  });

  it("leave the ids of Blank's numbered equations as they were", async () => {
    const added = await prepend(
      await exportDocx("$$\nb\n$$ {#eq-1}"),
      `<w:p><m:oMath ${ns}>${r("c")}</m:oMath><w:r><w:tab/><w:t>(</w:t></w:r><w:fldSimple w:instr="SEQ Equation \\* ARABIC"><w:r><w:t>1</w:t></w:r></w:fldSimple><w:r><w:t>)</w:t></w:r></w:p>`,
    );
    const { doc } = await importDocx(added, DEFAULT_PAGE);
    expect(serializeMarkdown(doc).trim()).toBe(
      "$$\nc\n$$ {#eq-2}\n\n$$\nb\n$$ {#eq-1}",
    );
  });

  it("are numbered by a complex SEQ field", async () => {
    const run = (inner: string) => `<w:r>${inner}</w:r>`;
    const added = await prepend(
      await exportDocx("Text."),
      `<w:p><m:oMath ${ns}>${r("z")}</m:oMath>${run("<w:tab/><w:t>(</w:t>")}${run('<w:fldChar w:fldCharType="begin"/>')}${run(" <w:instrText> SEQ Equation \\* ARABIC </w:instrText>")}${run('<w:fldChar w:fldCharType="separate"/>')}${run("<w:t>4</w:t>")}${run('<w:fldChar w:fldCharType="end"/>')}${run("<w:t>)</w:t>")}</w:p>`,
    );
    const { doc } = await importDocx(added, DEFAULT_PAGE);
    expect(serializeMarkdown(doc).trim()).toBe("$$\nz\n$$ {#eq-1}\n\nText.");
  });

  it("keep a number typed by hand as text", async () => {
    const added = await prepend(
      await exportDocx("Text."),
      `<w:p><m:oMath ${ns}>${r("x")}</m:oMath><w:r><w:t xml:space="preserve"> (3)</w:t></w:r></w:p>`,
    );
    const { doc } = await importDocx(added, DEFAULT_PAGE);
    expect(serializeMarkdown(doc).trim()).toBe("$x$ (3)\n\nText.");
  });

  it("keep a $ of their text within the math", async () => {
    const added = await prepend(
      await exportDocx("Text."),
      `<w:p><w:r><w:t xml:space="preserve">It is </w:t></w:r><m:oMath ${ns}>${r("a$b")}</m:oMath><w:r><w:t xml:space="preserve"> here.</w:t></w:r></w:p>`,
    );
    const { doc } = await importDocx(added, DEFAULT_PAGE);
    const markdown = serializeMarkdown(doc).trim();
    expect(markdown).toBe("It is $a\\$b$ here.\n\nText.");
    // and reads back as the same formula
    let formula = "";
    parseMarkdown(markdown).descendants((node) => {
      if (node.type.name === "math_inline") formula = node.textContent;
    });
    expect(formula).toBe("a\\$b");
  });

  it("say how many came in only in part", async () => {
    const added = await prepend(
      await exportDocx("Text."),
      `<w:p><m:oMath ${ns}><m:sth>${r("z")}</m:sth></m:oMath></w:p>`,
    );
    const { warnings } = await importDocx(added, DEFAULT_PAGE);
    expect(warnings).toEqual([
      "1 equation came in only in part, with what Blank can't read as text",
    ]);
  });
});

describe("ommlToLatex", () => {
  const latex = (inner: string) => ommlToLatex(omml(inner)).latex;

  it("reads fractions, scripts and roots", () => {
    expect(
      latex(`<m:f><m:num>${r("a")}</m:num><m:den>${r("b")}</m:den></m:f>`),
    ).toBe("\\frac{a}{b}");
    expect(
      latex(`<m:sSup><m:e>${r("x")}</m:e><m:sup>${r("2")}</m:sup></m:sSup>`),
    ).toBe("x^2");
    expect(
      latex(
        `<m:sSubSup><m:e>${r("x")}</m:e><m:sub>${r("i")}</m:sub><m:sup>${r("10")}</m:sup></m:sSubSup>`,
      ),
    ).toBe("x_i^{10}");
    expect(
      latex(
        `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${r("y")}</m:e></m:rad>`,
      ),
    ).toBe("\\sqrt{y}");
    expect(
      latex(`<m:rad><m:deg>${r("3")}</m:deg><m:e>${r("y")}</m:e></m:rad>`),
    ).toBe("\\sqrt[3]{y}");
  });

  it("reads sums, delimiters and matrices", () => {
    expect(
      latex(
        `<m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr><m:sub>${r("i=1")}</m:sub><m:sup>${r("n")}</m:sup><m:e>${r("i")}</m:e></m:nary>`,
      ),
    ).toBe("\\sum_{i=1}^n i");
    expect(latex(`<m:d><m:e>${r("x")}</m:e></m:d>`)).toBe("\\left(x\\right)");
    expect(
      latex(
        `<m:d><m:dPr><m:begChr m:val="{"/><m:endChr m:val=""/></m:dPr><m:e>${r("a")}</m:e></m:d>`,
      ),
    ).toBe("\\left\\{a\\right.");
    expect(
      latex(
        `<m:m><m:mr><m:e>${r("a")}</m:e><m:e>${r("b")}</m:e></m:mr><m:mr><m:e>${r("c")}</m:e><m:e>${r("d")}</m:e></m:mr></m:m>`,
      ),
    ).toBe("\\begin{matrix}a & b \\\\ c & d\\end{matrix}");
  });

  it("reads symbols, functions and accents", () => {
    expect(latex(r("α≤β"))).toBe("\\alpha \\le \\beta");
    expect(
      latex(
        `<m:func><m:fName>${r("sin")}</m:fName><m:e>${r("x")}</m:e></m:func>`,
      ),
    ).toBe("\\sin x");
    expect(
      latex(
        `<m:acc><m:accPr><m:chr m:val="⃗"/></m:accPr><m:e>${r("v")}</m:e></m:acc>`,
      ),
    ).toBe("\\vec{v}");
    expect(latex(`<m:r><m:rPr><m:nor/></m:rPr><m:t>for all</m:t></m:r>`)).toBe(
      "\\text{for all}",
    );
  });

  it("escapes what LaTeX gives a meaning", () => {
    expect(latex(r("a\\b^c~d$e{f}#%&amp;_"))).toBe(
      "a\\backslash b\\hat{}c\\sim d\\$e\\{f\\}\\#\\%\\&\\_",
    );
    expect(
      latex(
        `<m:r><m:rPr><m:nor/></m:rPr><m:t>costs $5 &amp; a_b {x} ^~\\</m:t></m:r>`,
      ),
    ).toBe(
      "\\text{costs \\$5 \\& a\\_b \\{x\\} \\textasciicircum{}\\textasciitilde{}\\textbackslash{}}",
    );
  });

  it("names what it reads only as text", () => {
    const read = ommlToLatex(omml(`<m:sth>${r("z")}</m:sth>`));
    expect(read).toEqual({ latex: "z", unknown: ["sth"] });
  });
});
