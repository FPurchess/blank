import { M } from "../../exporters/docx/math";

/*
 * ommlToLatex reads a Word equation (OMML) as LaTeX, for equations made in
 * Word or LibreOffice: those Blank exported come back as their LaTeX was
 * (see ./math.ts). It covers what Word's equation editor builds; an element
 * it doesn't know gives its text and is reported.
 */

// letters and symbols Word writes as characters, as LaTeX commands
const SYMBOLS: Record<string, string> = {
  α: "\\alpha",
  β: "\\beta",
  γ: "\\gamma",
  δ: "\\delta",
  ε: "\\epsilon",
  ϵ: "\\epsilon",
  ζ: "\\zeta",
  η: "\\eta",
  θ: "\\theta",
  ϑ: "\\vartheta",
  ι: "\\iota",
  κ: "\\kappa",
  λ: "\\lambda",
  μ: "\\mu",
  ν: "\\nu",
  ξ: "\\xi",
  π: "\\pi",
  ϖ: "\\varpi",
  ρ: "\\rho",
  ϱ: "\\varrho",
  σ: "\\sigma",
  ς: "\\varsigma",
  τ: "\\tau",
  υ: "\\upsilon",
  φ: "\\phi",
  ϕ: "\\phi",
  χ: "\\chi",
  ψ: "\\psi",
  ω: "\\omega",
  Γ: "\\Gamma",
  Δ: "\\Delta",
  Θ: "\\Theta",
  Λ: "\\Lambda",
  Ξ: "\\Xi",
  Π: "\\Pi",
  Σ: "\\Sigma",
  Υ: "\\Upsilon",
  Φ: "\\Phi",
  Ψ: "\\Psi",
  Ω: "\\Omega",
  "≤": "\\le",
  "≥": "\\ge",
  "≠": "\\ne",
  "≈": "\\approx",
  "≡": "\\equiv",
  "∼": "\\sim",
  "∝": "\\propto",
  "±": "\\pm",
  "∓": "\\mp",
  "×": "\\times",
  "÷": "\\div",
  "⋅": "\\cdot",
  "·": "\\cdot",
  "∘": "\\circ",
  "∞": "\\infty",
  "∂": "\\partial",
  "∇": "\\nabla",
  "∀": "\\forall",
  "∃": "\\exists",
  "¬": "\\neg",
  "∧": "\\land",
  "∨": "\\lor",
  "∈": "\\in",
  "∉": "\\notin",
  "⊂": "\\subset",
  "⊆": "\\subseteq",
  "⊃": "\\supset",
  "⊇": "\\supseteq",
  "∪": "\\cup",
  "∩": "\\cap",
  "∅": "\\emptyset",
  "→": "\\to",
  "←": "\\leftarrow",
  "↔": "\\leftrightarrow",
  "⇒": "\\Rightarrow",
  "⇐": "\\Leftarrow",
  "⇔": "\\Leftrightarrow",
  "↦": "\\mapsto",
  "…": "\\ldots",
  "⋯": "\\cdots",
  "⋮": "\\vdots",
  "⋱": "\\ddots",
  ℏ: "\\hbar",
  ℓ: "\\ell",
  ℜ: "\\Re",
  ℑ: "\\Im",
  ℵ: "\\aleph",
  "⊕": "\\oplus",
  "⊗": "\\otimes",
  "⟨": "\\langle",
  "⟩": "\\rangle",
  "‖": "\\|",
  "∠": "\\angle",
  "°": "^\\circ",
  "′": "'",
  "″": "''",
};

// the n-ary operators by their character
const OPERATORS: Record<string, string> = {
  "∑": "\\sum",
  "∏": "\\prod",
  "∐": "\\coprod",
  "∫": "\\int",
  "∬": "\\iint",
  "∭": "\\iiint",
  "∮": "\\oint",
  "⋃": "\\bigcup",
  "⋂": "\\bigcap",
  "⋁": "\\bigvee",
  "⋀": "\\bigwedge",
  "⨁": "\\bigoplus",
  "⨂": "\\bigotimes",
};

// accents by their combining character
const ACCENTS: Record<string, string> = {
  "̂": "\\hat",
  "̃": "\\tilde",
  "̄": "\\bar",
  "̅": "\\overline",
  "̇": "\\dot",
  "̈": "\\ddot",
  "⃗": "\\vec",
  "́": "\\acute",
  "̀": "\\grave",
  "̌": "\\check",
  "̆": "\\breve",
  "⃖": "\\overleftarrow",
};

// delimiters as \left and \right take them
const DELIMITERS: Record<string, string> = {
  "{": "\\{",
  "}": "\\}",
  "⟨": "\\langle",
  "⟩": "\\rangle",
  "|": "|",
  "‖": "\\|",
  "⌊": "\\lfloor",
  "⌋": "\\rfloor",
  "⌈": "\\lceil",
  "⌉": "\\rceil",
  "": ".",
};

// the functions LaTeX has a command for
const FUNCTIONS = new Set(
  "sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh coth log ln lg exp lim limsup liminf max min sup inf det dim ker deg gcd arg hom Pr".split(
    " ",
  ),
);

// what LaTeX reads as a command, a group or a script, written with a
// backslash for the character itself; the $ also, which would end the math
// in markdown
const ESCAPED = "{}#%&_$";

// the other characters LaTeX gives a meaning, in math
const MATH_LITERALS: Record<string, string> = {
  "\\": "\\backslash",
  "^": "\\hat{}",
  "~": "\\sim",
};

// and in \text{…}
const TEXT_LITERALS: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "^": "\\textasciicircum{}",
  "~": "\\textasciitilde{}",
};

/**
 * escapeText returns Word's text as LaTeX's text, for \text{…}
 */
const escapeText = (value: string) =>
  [...value]
    .map(
      (char) =>
        TEXT_LITERALS[char] ?? (ESCAPED.includes(char) ? `\\${char}` : char),
    )
    .join("");

const named = (element: Element, name: string) =>
  [...element.children].find(
    (child) => child.namespaceURI === M && child.localName === name,
  );

const property = (element: Element, props: string, name: string) => {
  const found = named(element, props);
  const prop = found && named(found, name);
  return prop?.getAttributeNS(M, "val") ?? prop?.getAttribute("m:val") ?? null;
};

export interface OmmlRead {
  latex: string;
  // the elements it read only the text of
  unknown: string[];
}

/**
 * ommlToLatex reads an `m:oMath`, or an `m:oMathPara` with its lines
 */
export const ommlToLatex = (math: Element): OmmlRead => {
  const unknown: string[] = [];
  const group = (latex: string) =>
    latex.length === 1 || /^\\[a-zA-Z]+$/.test(latex) ? latex : `{${latex}}`;
  const arg = (element: Element, name: string) => {
    const found = named(element, name);
    return found ? children(found) : "";
  };
  const children = (element: Element): string => {
    let out = "";
    for (const child of element.children) {
      const latex = read(child);
      // a command followed by a letter needs a space between them
      if (/\\[a-zA-Z]+$/.test(out) && /^[a-zA-Z]/.test(latex)) out += " ";
      out += latex;
    }
    return out;
  };
  const text = (value: string, plain: boolean) => {
    if (plain) return `\\text{${escapeText(value)}}`;
    if (FUNCTIONS.has(value)) return `\\${value}`;
    let out = "";
    for (const char of value) {
      const symbol = SYMBOLS[char] ?? MATH_LITERALS[char];
      if (symbol) {
        out += /[a-zA-Z]$/.test(symbol) ? `${symbol} ` : symbol;
      } else if (ESCAPED.includes(char)) out += `\\${char}`;
      else out += char;
    }
    return out.replace(/ $/, "");
  };
  const read = (element: Element): string => {
    if (element.namespaceURI !== M) return "";
    switch (element.localName) {
      case "oMathPara": {
        const lines = [...element.children]
          .filter((child) => child.localName === "oMath")
          .map(read);
        return lines.length > 1
          ? `\\begin{gathered}${lines.join(" \\\\ ")}\\end{gathered}`
          : (lines[0] ?? "");
      }
      case "oMath":
      case "e":
      case "num":
      case "den":
      case "sub":
      case "sup":
      case "deg":
      case "lim":
      case "fName":
        return children(element);
      case "r": {
        const value = [...element.children]
          .filter((child) => child.localName === "t")
          .map((child) => child.textContent ?? "")
          .join("");
        // normal text, not math italic
        const props = named(element, "rPr");
        const plain =
          !!props &&
          (!!named(props, "nor") || property(element, "rPr", "sty") === "p") &&
          /[a-zA-Z]{2,}/.test(value) &&
          !FUNCTIONS.has(value);
        return text(value, plain);
      }
      case "f": {
        const type = property(element, "fPr", "type");
        const num = arg(element, "num");
        const den = arg(element, "den");
        if (type === "lin") return `${group(num)}/${group(den)}`;
        if (type === "noBar") return `\\binom{${num}}{${den}}`;
        return `\\frac{${num}}{${den}}`;
      }
      case "sSup":
        return `${group(arg(element, "e"))}^${group(arg(element, "sup"))}`;
      case "sSub":
        return `${group(arg(element, "e"))}_${group(arg(element, "sub"))}`;
      case "sSubSup":
        return `${group(arg(element, "e"))}_${group(arg(element, "sub"))}^${group(arg(element, "sup"))}`;
      case "sPre":
        return `{}_${group(arg(element, "sub"))}^${group(arg(element, "sup"))}${group(arg(element, "e"))}`;
      case "rad": {
        const degree = arg(element, "deg");
        const hidden = property(element, "radPr", "degHide");
        return degree && hidden !== "1" && hidden !== "on"
          ? `\\sqrt[${degree}]{${arg(element, "e")}}`
          : `\\sqrt{${arg(element, "e")}}`;
      }
      case "nary": {
        const char = property(element, "naryPr", "chr") ?? "∫";
        const op = OPERATORS[char] ?? text(char, false);
        const hideSub = ["1", "on"].includes(
          property(element, "naryPr", "subHide") ?? "",
        );
        const hideSup = ["1", "on"].includes(
          property(element, "naryPr", "supHide") ?? "",
        );
        const sub = arg(element, "sub");
        const sup = arg(element, "sup");
        return `${op}${!hideSub && sub ? `_${group(sub)}` : ""}${!hideSup && sup ? `^${group(sup)}` : ""} ${arg(element, "e")}`.trimEnd();
      }
      case "d": {
        const begin = property(element, "dPr", "begChr") ?? "(";
        const end = property(element, "dPr", "endChr") ?? ")";
        const separator = property(element, "dPr", "sepChr") ?? "|";
        const parts = [...element.children]
          .filter((child) => child.localName === "e")
          .map(children);
        const delimiter = (char: string) => DELIMITERS[char] ?? char;
        return `\\left${delimiter(begin)}${parts.join(text(separator, false))}\\right${delimiter(end)}`;
      }
      case "m": {
        const rows = [...element.children]
          .filter((child) => child.localName === "mr")
          .map((row) =>
            [...row.children]
              .filter((cell) => cell.localName === "e")
              .map(children)
              .join(" & "),
          );
        return `\\begin{matrix}${rows.join(" \\\\ ")}\\end{matrix}`;
      }
      case "eqArr": {
        const rows = [...element.children]
          .filter((child) => child.localName === "e")
          .map(children);
        return `\\begin{aligned}${rows.join(" \\\\ ")}\\end{aligned}`;
      }
      case "acc": {
        const char = property(element, "accPr", "chr") ?? "̂";
        return `${ACCENTS[char] ?? "\\hat"}{${arg(element, "e")}}`;
      }
      case "bar":
        return property(element, "barPr", "pos") === "bot"
          ? `\\underline{${arg(element, "e")}}`
          : `\\overline{${arg(element, "e")}}`;
      case "groupChr": {
        const char = property(element, "groupChrPr", "chr") ?? "⏟";
        const command = char === "⏞" ? "\\overbrace" : "\\underbrace";
        return `${command}{${arg(element, "e")}}`;
      }
      case "func": {
        const name = arg(element, "fName");
        return `${name}${/^\\[a-zA-Z]+$/.test(name) ? " " : ""}${group(arg(element, "e"))}`;
      }
      case "limLow":
        return `${arg(element, "e")}_${group(arg(element, "lim"))}`;
      case "limUpp":
        return `${arg(element, "e")}^${group(arg(element, "lim"))}`;
      case "box":
      case "phant":
        return arg(element, "e");
      case "borderBox":
        return `\\boxed{${arg(element, "e")}}`;
      default:
        if (element.localName.endsWith("Pr") || element.localName === "ctrlPr")
          return "";
        if (!unknown.includes(element.localName))
          unknown.push(element.localName);
        return text(element.textContent ?? "", false);
    }
  };
  return { latex: read(math).trim(), unknown };
};
