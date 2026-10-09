import { logWarning } from "../log";
import { mathML } from "./mathml";

export const M = "http://schemas.openxmlformats.org/officeDocument/2006/math";

/**
 * toOmml returns a formula as Word's equation (OMML, an `m:oMath`), from
 * its MathML, or null if it can't be converted
 */
export const toOmml = async (
  latex: string,
  display: boolean,
): Promise<string | null> => {
  // without the annotation, which OMML has no place for
  const mathml = await mathML(latex, display, false);
  // only the kind of failure: never what the formula says
  if (!mathml) {
    logWarning(
      "couldn't write an equation for Word",
      "Temml can't read the formula",
    );
    return null;
  }
  // loaded with the first equation, so the app's start doesn't carry it
  const { mml2omml } = await import("mathml2omml");
  let omml: string;
  try {
    // mathml2omml writes text as it is, without escaping it: with the
    // MathML's entities kept, a < of the formula stays &lt;
    omml = mml2omml(markColors(mathml), { disableDecode: true });
  } catch {
    logWarning("couldn't write an equation for Word", "mathml2omml threw");
    return null;
  }
  // what goes into the document must parse, or Word refuses the whole file
  const doc = new DOMParser().parseFromString(omml, "application/xml");
  const math = doc.documentElement;
  if (doc.getElementsByTagName("parsererror").length) {
    logWarning(
      "couldn't write an equation for Word",
      "the equation isn't well-formed",
    );
    return null;
  }
  if (math.namespaceURI !== M || math.localName !== "oMath") {
    logWarning("couldn't write an equation for Word", "no equation came out");
    return null;
  }
  return new XMLSerializer().serializeToString(fixOmml(math));
};

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

// around a character of a colour the author gave, which mathml2omml leaves
// out: its colour and background, then the character, between characters
// of the Private Use Area, which formulas don't hold
const COLOR_START = "\uE010";
const COLOR_TEXT = "\uE011";
const COLOR_END = "\uE012";
const COLORED = /\uE010([0-9a-f]*)\/([0-9a-f]*)\uE011([^\uE012]*)\uE012/gi;

const TOKENS = new Set(["mi", "mn", "mo", "mtext", "ms"]);

// operators OMML makes a structure of (n-ary operators, fences), whose
// character is an attribute there, not text a run can colour
const STRUCTURAL = /^[\s∑∏∐∫∬∭∮∯∰∱∲∳⋀⋁⋂⋃⨀⨁⨂⨄⨆()[\]{}|‖⟨⟩⌈⌉⌊⌋]*$/u;

/**
 * hexOf returns a colour Temml writes (#f00, #ff0000) as six hex digits
 */
const hexOf = (value: string | null | undefined) => {
  const hex = /#([0-9a-f]{6}|[0-9a-f]{3})\b/i.exec(value ?? "")?.[1];
  if (!hex) return "";
  return (
    hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex
  ).toUpperCase();
};

/**
 * markColors marks the text of the formula's characters the author gave a
 * colour or a background (`\color`, `\colorbox`), which mathml2omml would
 * drop, for colorRun
 */
const markColors = (mathml: string) => {
  if (!/color:|mathbackground|mathcolor/.test(mathml)) return mathml;
  const doc = new DOMParser().parseFromString(mathml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) return mathml;
  for (const token of [...doc.getElementsByTagName("*")]) {
    if (!TOKENS.has(token.localName)) continue;
    if (
      token.localName === "mo" &&
      (STRUCTURAL.test(token.textContent ?? "") ||
        token.getAttribute("stretchy") === "true" ||
        token.getAttribute("largeop") === "true")
    ) {
      continue;
    }
    let color = "";
    let background = "";
    for (
      let at: Element | null = token;
      at && (!color || !background);
      at = at.parentElement
    ) {
      color ||=
        hexOf(at.getAttribute("mathcolor")) ||
        hexOf(
          /(?:^|;)\s*color:\s*([^;]+)/.exec(
            at.getAttribute("style") ?? "",
          )?.[1],
        );
      background ||= hexOf(at.getAttribute("mathbackground"));
    }
    if (!color && !background) continue;
    token.textContent = `${COLOR_START}${color}/${background}${COLOR_TEXT}${token.textContent ?? ""}${COLOR_END}`;
  }
  return new XMLSerializer().serializeToString(doc);
};

/**
 * colorRun splits a run holding characters markColors marked into runs of
 * one colour each, which Word's run properties give their colour and
 * background (w:color, w:shd)
 */
const colorRun = (run: Element) => {
  const text = textOf(run);
  if (!text.includes(COLOR_START)) return;
  const parts: { text: string; color: string; background: string }[] = [];
  let last = 0;
  for (const match of text.matchAll(COLORED)) {
    if (match.index > last) {
      parts.push({
        text: text.slice(last, match.index),
        color: "",
        background: "",
      });
    }
    parts.push({ text: match[3], color: match[1], background: match[2] });
    last = match.index + match[0].length;
  }
  if (last < text.length)
    parts.push({ text: text.slice(last), color: "", background: "" });
  const doc = run.ownerDocument;
  for (const part of parts) {
    // anything left of a mark, should one be cut, isn't shown
    const clean = part.text.replace(/[\uE010-\uE012]/g, "");
    if (!clean) continue;
    const piece = run.cloneNode(true) as Element;
    setText(piece, clean);
    if (part.color || part.background) {
      let props = [...piece.children].find(
        (child) => child.namespaceURI === W && child.localName === "rPr",
      );
      if (!props) {
        props = doc.createElementNS(W, "w:rPr");
        piece.insertBefore(props, texts(piece)[0] ?? null);
      }
      if (part.color) {
        const color = doc.createElementNS(W, "w:color");
        color.setAttributeNS(W, "w:val", part.color);
        props.append(color);
      }
      if (part.background) {
        const shading = doc.createElementNS(W, "w:shd");
        shading.setAttributeNS(W, "w:val", "clear");
        shading.setAttributeNS(W, "w:color", "auto");
        shading.setAttributeNS(W, "w:fill", part.background);
        props.append(shading);
      }
    }
    run.before(piece);
  }
  run.remove();
};

// where the operand of a sum ends: at a relation
const RELATION = /[=<>≤≥≠≈≡∼≃∝→←↔⇒⇐⇔∈∉⊂⊆⊃⊇]/;

// the styles of math text OMML has (ST_Style)
const STYLES = new Set(["p", "b", "i", "bi"]);

const ofMath = (element: Element, name: string) => [
  ...element.getElementsByTagNameNS(M, name),
];
const texts = (run: Element) => ofMath(run, "t");
const textOf = (run: Element) =>
  texts(run)
    .map((t) => t.textContent ?? "")
    .join("");
// a run's text, in its first m:t
const setText = (run: Element, text: string) => {
  const [first, ...rest] = texts(run);
  if (first) first.textContent = text;
  for (const extra of rest) extra.remove();
};

/**
 * fixOmml corrects what mathml2omml writes wrong: runs with properties
 * Word refuses, and sums, integrals and products without their operand
 */
const fixOmml = (math: Element) => {
  for (const run of ofMath(math, "r")) colorRun(run);
  // no mark is left where a run can't take its colour, e.g. an n-ary's
  // character
  for (const element of [...math.getElementsByTagName("*")]) {
    for (const attribute of [...element.attributes]) {
      if (/[\uE010-\uE012]/.test(attribute.value)) {
        attribute.value = attribute.value.replace(
          /\uE010[0-9a-f]*\/[0-9a-f]*\uE011|\uE012/gi,
          "",
        );
      }
    }
  }
  for (const run of ofMath(math, "r")) fixRun(run);
  for (const nary of ofMath(math, "nary")) withOperand(nary);
  return math;
};

/**
 * fixRun drops a style OMML hasn't, which mathml2omml writes as
 * "undefined", and empty properties, and puts the math properties before
 * Word's, where the schema wants them
 */
const fixRun = (run: Element) => {
  for (const sty of ofMath(run, "sty")) {
    if (!STYLES.has(sty.getAttributeNS(M, "val") ?? "")) sty.remove();
  }
  for (const child of [...run.children]) {
    if (child.localName === "rPr" && !child.children.length) child.remove();
  }
  const props = [...run.children].find(
    (child) => child.namespaceURI === M && child.localName === "rPr",
  );
  if (props && props !== run.firstElementChild) run.prepend(props);
};

/**
 * withOperand moves what follows a sum, integral or product into it, where
 * mathml2omml leaves it out: Word and LibreOffice draw an empty box for an
 * n-ary operator without its operand
 */
const withOperand = (nary: Element) => {
  const operand = [...nary.children].find(
    (child) => child.namespaceURI === M && child.localName === "e",
  );
  const empty =
    operand &&
    [...operand.children].every((child) => child.localName === "ctrlPr");
  const next = nary.nextElementSibling;
  if (!operand || !empty || !next) return;
  // a run of text up to the first relation, e.g. the i of "i = 1"
  const text = next.localName === "r" ? textOf(next) : null;
  const relation = text === null ? -1 : text.search(RELATION);
  if (relation === 0) return;
  if (relation > 0 && text !== null) {
    const head = next.cloneNode(true) as Element;
    setText(head, text.slice(0, relation).trimEnd());
    setText(next, text.slice(relation));
    operand.append(head);
  } else operand.append(next);
};
