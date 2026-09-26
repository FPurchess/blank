import { beforeEach, describe, expect, it } from "vitest";
import { splitBlock } from "prosemirror-commands";
import { history, undo } from "prosemirror-history";
import { schema } from "prosemirror-markdown";
import type { Node } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";

import {
  codeBlock,
  createState,
  createTestView,
  doc,
  li,
  p,
  pressKey,
  typeText,
  ul,
} from "../../../test/editor";
import { config, type AutocorrectConfig } from "../../../config";
import { language } from "../../../state";
import autocomplete from ".";

const defaultConfig = config.value;

/**
 * setAutocorrect overrides autocorrect settings for a test
 */
const setAutocorrect = (settings: Partial<AutocorrectConfig>) => {
  config.value = {
    ...defaultConfig,
    autocorrect: { ...defaultConfig.autocorrect, ...settings },
  };
};

/**
 * setup creates a view with the autocomplete plugin for `node`, or for a
 * paragraph holding `node` where "|" marks the cursor
 */
const setup = (node: string | Node, cursor?: number | [number, number]) => {
  const plugin = autocomplete();
  if (typeof node === "string") {
    const index = node.indexOf("|");
    cursor = index < 0 ? undefined : 1 + index;
    node = doc(p(node.replace("|", "")));
  }
  const view = createTestView(
    createState(node, { cursor, plugins: [history(), plugin] }),
  );
  return {
    view,
    plugin,
    type: (text: string) => typeText(view, plugin, text),
    press: (key: string) => pressKey(view, plugin, key),
  };
};

/**
 * show returns the text of the doc's blocks with "|" at the cursor
 */
const show = (view: EditorView) => {
  const { doc: node, selection } = view.state;
  const text = (from: number, to: number) =>
    node.textBetween(from, to, "\n", "￼");
  return (
    text(0, selection.from) + "|" + text(selection.from, node.content.size)
  );
};

/**
 * typed types `text` into a paragraph holding `before` ("|" marks the
 * cursor) and returns the result with "|" at the cursor
 */
const typed = (before: string | Node, text: string) => {
  const { view, type } = setup(before);
  type(text);
  return show(view);
};

/**
 * unchanged returns what typing a space into `before` gives without
 * autocorrect
 */
const unchanged = (before: string) => before.replace("|", " |");

/**
 * marksAt returns the names of the marks on the node after `pos`
 */
const marksAt = (view: EditorView, pos: number) =>
  (view.state.doc.nodeAt(pos)?.marks ?? [])
    .map((mark) => mark.type.name)
    .sort();

/**
 * cursorMarks returns the names of the marks typing at the cursor would get
 */
const cursorMarks = (view: EditorView) =>
  (view.state.storedMarks ?? view.state.selection.$from.marks()).map(
    (mark) => mark.type.name,
  );

/**
 * paragraph builds a paragraph from text nodes and leaf nodes
 */
const paragraph = (...content: Node[]) =>
  doc(schema.node("paragraph", null, content));

describe("plugin.autocomplete", () => {
  beforeEach(() => {
    config.value = defaultConfig;
    language.value = "en";
  });

  describe("arrows", () => {
    it.each([
      ["The -->|", "The → |"],
      ["-->|", "→ |"],
      ["The <--|", "The ← |"],
      ["The <-->|", "The ↔ |"],
      ["The ->|", "The → |"],
      ["The <-|", "The ← |"],
      ["The <->|", "The ↔ |"],
      ["The ==>|", "The ⇒ |"],
      ["The <==|", "The ⇐ |"],
      ["The <==>|", "The ⇔ |"],
    ])("replaces %j", (before, after) => {
      expect(typed(before, " ")).toBe(after);
    });

    it.each([
      ["in the middle of the text", "The -->| end", " ", "The → | end"],
      ["before a word", "The -->|end", " ", "The → |end"],
      ["inside brackets", "The (-->)|", " ", "The (→) |"],
      ["inside quotes", "The “-->”|", " ", "The “→” |"],
      ["before a period", "The -->|", ".", "The →.|"],
      ["before a comma", "The -->|", ",", "The →,|"],
      ["before a question mark", "The -->|", "?", "The →?|"],
    ])("replaces an arrow %s", (_, before, text, after) => {
      expect(typed(before, text)).toBe(after);
    });

    it.each([
      ["<-- ", "The ← |"],
      ["<--> ", "The ↔ |"],
      ["<== ", "The ⇐ |"],
      ["<==> ", "The ⇔ |"],
      ["-> ", "The → |"],
    ])("lets %j be typed char by char", (text, after) => {
      expect(typed("The |", text)).toBe(after);
    });

    it.each([
      ["attached to a word", "x-->|"],
      ["followed by more", "The -->>|"],
    ])("ignores an arrow %s", (_, before) => {
      expect(typed(before, " ")).toBe(unchanged(before));
    });

    it("ignores a token after a line break", () => {
      const node = paragraph(
        schema.text("The"),
        schema.nodes.hard_break.create(),
        schema.text("-->"),
      );

      expect(typed(node, " ")).toBe("The￼→ |");
    });
  });

  describe("symbols", () => {
    it.each([
      ["(c)", "The ©|"],
      ["(C)", "The ©|"],
      ["(r)", "The ®|"],
      ["(tm)", "The ™|"],
      ["(TM)", "The ™|"],
    ])("replaces %j as soon as it is closed", (text, after) => {
      expect(typed("The |", text)).toBe(after);
    });

    it.each([
      ["...", "The … |"],
      ["1/2", "The ½ |"],
      ["1/4", "The ¼ |"],
      ["3/4", "The ¾ |"],
      ["+-", "The ± |"],
      ["!=", "The ≠ |"],
      ["<=", "The ≤ |"],
      [">=", "The ≥ |"],
    ])("replaces %j", (text, after) => {
      expect(typed("The |", text + " ")).toBe(after);
    });

    it("leaves dates alone", () => {
      expect(typed("On |", "1/2/2026 ")).toBe("On 1/2/2026 |");
    });

    it("leaves a closing bracket without an entry alone", () => {
      expect(typed("The (x|", ")")).toBe("The (x)|");
    });
  });

  describe("words named like object properties", () => {
    it.each([
      "constructor",
      "toString",
      "valueOf",
      "hasOwnProperty",
      "__proto__",
    ])("leaves %j alone", (word) => {
      expect(typed("The |", word + " ")).toBe(`The ${word} |`);
      expect(typed("The |", word + ".")).toBe(`The ${word}.|`);
    });

    it("leaves them alone with custom replacements", () => {
      setAutocorrect({ replace: { "*": { btw: "by the way" } } });
      language.value = "de";
      expect(typed("The |", "constructor ")).toBe("The constructor |");
      expect(typed("The |", "__proto__ ")).toBe("The __proto__ |");
    });

    it("leaves them alone as symbols", () => {
      expect(typed("The |", "(constructor)")).toBe("The (constructor)|");
    });
  });

  describe("custom replacements", () => {
    beforeEach(() => {
      setAutocorrect({
        replace: {
          "*": { btw: "by the way", "(x)": "✓" },
          de: { mfg: "Mit freundlichen Grüßen" },
        },
      });
    });

    it("applies the replacements for all languages", () => {
      expect(typed("So |", "btw ")).toBe("So by the way |");
    });

    it("applies the replacements for the current language only", () => {
      expect(typed("So |", "mfg ")).toBe("So mfg |");

      language.value = "de";
      expect(typed("So |", "mfg ")).toBe("So Mit freundlichen Grüßen |");
    });

    it("applies a replacement ending with ')' when it is closed", () => {
      expect(typed("So |", "(x)")).toBe("So ✓|");
    });

    it("applies the replacements of the base language to a regional one", () => {
      setAutocorrect({
        replace: {
          "*": {},
          de: { mfg: "Mit freundlichen Grüßen" },
          "de-CH": { gruss: "Grüezi" },
        },
      });
      language.value = "de-CH";

      expect(typed("So |", "mfg ")).toBe("So Mit freundlichen Grüßen |");
      expect(typed("So |", "gruss ")).toBe("So Grüezi |");
    });

    it("prefers the language's replacement over the global one", () => {
      setAutocorrect({
        replace: { "*": { btw: "by the way" }, de: { btw: "übrigens" } },
      });
      language.value = "de";

      expect(typed("So |", "btw ")).toBe("So übrigens |");
    });
  });

  describe("dashes", () => {
    it.each([
      ["A - B|", "A – B |"],
      ["A -- B|", "A – B |"],
      ["A --B|", "A –B |"],
      ["A--B|", "A—B |"],
      ["1--2|", "1–2 |"],
      ["A - (B)|", "A – (B) |"],
      ["A--B--C|", "A—B—C |"],
    ])("turns %j into %j", (before, after) => {
      expect(typed(before, " ")).toBe(after);
    });

    it.each(["A-B|", "A -B|", "A --|", "--|", "A - -|", "- B|"])(
      "leaves %j alone",
      (before) => {
        expect(typed(before, " ")).toBe(unchanged(before));
      },
    );

    it("waits for the word after the dashes to be complete", () => {
      expect(typed("A--B|", ".")).toBe("A--B.|");
      expect(typed("A--B.|", " ")).toBe("A—B. |");
    });

    it.each([
      ["de", "„Das“ - sagte|", "„Das“ – sagte |"],
      ["de", "Er - „sagte|", "Er – „sagte |"],
      ["en", "[a] - {b|", "[a] – {b |"],
    ])(
      "sets a dash next to quotes and brackets in %s: %j",
      (lang, before, after) => {
        language.value = lang;
        expect(typed(before, " ")).toBe(after);
      },
    );

    it("uses em dashes between words in Russian", () => {
      language.value = "ru";
      expect(typed("A - B|", " ")).toBe("A — B |");
    });

    it("uses en dashes within words in Finnish", () => {
      language.value = "fi";
      expect(typed("A--B|", " ")).toBe("A–B |");
    });

    it("leaves URLs alone", () => {
      setAutocorrect({ links: false });
      expect(typed("See www.my--site.com|", " ")).toBe(
        "See www.my--site.com |",
      );
    });
  });

  describe("formatting", () => {
    it.each([
      ["The **bold**|", "strong", "The bold |"],
      ["The **two words**|", "strong", "The two words |"],
      ["The *em*|", "em", "The em |"],
      ["The _em_|", "em", "The em |"],
      ["The `code`|", "code", "The code |"],
      ["The `a*b*`|", "code", "The a*b* |"],
      ["The (*em*)|", "em", "The (em) |"],
    ])("formats %j as %s", (before, mark, after) => {
      const { view, type } = setup(before);
      type(" ");

      expect(show(view)).toBe(after);
      // the last char of the formatted text
      const end = after.replace(/\)? \|$/, "").length;
      expect(marksAt(view, end)).toEqual([mark]);
      expect(cursorMarks(view)).toEqual([]);
    });

    it.each([
      ["So »*x*«|", "So »x« |"],
      ["So „*x*“|", "So „x“ |"],
      ["So ‹*x*›|", "So ‹x› |"],
      ["So {*x*}|", "So {x} |"],
    ])("formats inside quotes and brackets: %j", (before, after) => {
      const { view, type } = setup(before);
      type(" ");

      expect(show(view)).toBe(after);
      expect(marksAt(view, 5)).toEqual(["em"]);
    });

    it("formats before a punctuation mark", () => {
      expect(typed("The *em*|", ".")).toBe("The em.|");
    });

    it("formats only the last pair of markers", () => {
      expect(typed("A **b** and **c**|", " ")).toBe("A **b** and c |");
    });

    it.each([
      "snake_case_|",
      "2*3*|",
      "The **x*|",
      "The ___|",
      "The ***|",
      "The * x *|",
      "The **|",
    ])("leaves %j alone", (before) => {
      expect(typed(before, " ")).toBe(unchanged(before));
    });

    it("stops the mark after a trigger that inserts no char", () => {
      const { view, press } = setup("The **bold**|");

      expect(press("Tab")).toBe(false);
      expect(show(view)).toBe("The bold|");
      expect(view.state.storedMarks).toEqual([]);
    });
  });

  describe("links", () => {
    it("turns a Markdown link into a link", () => {
      const { view, type } = setup("The [site](https://a.io)|");
      type(" ");

      expect(show(view)).toBe("The site |");
      const link = view.state.doc.nodeAt(5)!.marks[0];
      expect(link.type.name).toBe("link");
      expect(link.attrs.href).toBe("https://a.io");
    });

    it("keeps the marks of a link's title", () => {
      const bold = schema.marks.strong.create();
      const { view, type } = setup(paragraph(schema.text("[b](u)", [bold])));
      type(" ");

      expect(show(view)).toBe("b |");
      expect(marksAt(view, 1)).toEqual(["link", "strong"]);
    });

    it("turns Markdown image syntax into an image", () => {
      const { view, type } = setup("The ![alt](a.png)|");
      type(" ");

      expect(show(view)).toBe("The ￼ |");
      const image = view.state.doc.nodeAt(5)!;
      expect(image.type.name).toBe("image");
      expect(image.attrs).toMatchObject({ src: "a.png", alt: "alt" });
    });

    it.each([
      "The [x](javascript:alert(1)|",
      "The [x](javascript:void)|",
      "The [x](file:///etc/passwd)|",
      "The ![x](javascript:void)|",
      "The ![x](vbscript:x)|",
    ])("leaves %j as typed, since saving would drop it", (before) => {
      const { view, type } = setup(before);
      type(" ");

      expect(show(view)).toBe(unchanged(before));
      expect(
        view.state.doc.rangeHasMark(
          0,
          view.state.doc.content.size,
          schema.marks.link,
        ),
      ).toBe(false);
      expect(view.state.doc.firstChild!.childCount).toBe(1);
    });

    it.each(["data:image/png;base64,AAAA", "a.png", "https://a.io/a.png"])(
      "turns an image with a savable src into an image: %j",
      (src) => {
        const { view, type } = setup(`The ![a](${src})|`);
        type(" ");

        expect(view.state.doc.nodeAt(5)!.attrs.src).toBe(src);
      },
    );

    it("turns image syntax without alt text into an image", () => {
      const { view, type } = setup("The ![](a.png)|");
      type(" ");

      expect(view.state.doc.nodeAt(5)!.attrs.alt).toBeNull();
    });

    it.each([
      ["See https://a.io/x|", "https://a.io/x", "https://a.io/x"],
      ["See http://a.io|", "http://a.io", "http://a.io"],
      [
        "See http://localhost:3000|",
        "http://localhost:3000",
        "http://localhost:3000",
      ],
      ["See www.a.io|", "www.a.io", "https://www.a.io"],
      ["See https://a.io.|", "https://a.io", "https://a.io"],
      ["See (https://a.io)|", "https://a.io", "https://a.io"],
      [
        "See https://w.org/A_(b)|",
        "https://w.org/A_(b)",
        "https://w.org/A_(b)",
      ],
      [
        "See (https://w.org/A_(b)).|",
        "https://w.org/A_(b)",
        "https://w.org/A_(b)",
      ],
      ["Mail me@a.io|", "me@a.io", "mailto:me@a.io"],
    ])("links %j", (before, text, href) => {
      const { view, type } = setup(before);
      type(" ");

      const node = view.state.doc.nodeAt(before.indexOf(text) + 1)!;
      expect(node.text).toBe(text);
      expect(node.marks[0]?.attrs.href).toBe(href);
    });

    it.each(["See www.a|", "See https://|", "See a@b|", "See https://a|"])(
      "leaves %j alone",
      (before) => {
        const { view, type } = setup(before);
        type(" ");

        expect(
          view.state.doc.rangeHasMark(0, before.length, schema.marks.link),
        ).toBe(false);
      },
    );

    it.each([
      ["de", '"https://blank.app/docs" ', "https://blank.app/docs"],
      ["de", "'https://blank.app/docs' ", "https://blank.app/docs"],
      ["cs", '"https://blank.app/docs". ', "https://blank.app/docs"],
      ["ru", '"https://blank.app/docs" ', "https://blank.app/docs"],
      ["ru", "'https://blank.app/docs' ", "https://blank.app/docs"],
      ["en", "[https://blank.app] ", "https://blank.app"],
      ["en", "{https://blank.app} ", "https://blank.app"],
      ["en", "(https://blank.app/a]) ", "https://blank.app/a"],
      ["en", "https://w.org/A_(b) ", "https://w.org/A_(b)"],
      ["en", "(https://w.org/A_(b)). ", "https://w.org/A_(b)"],
      ["en", "[https://w.org/A_[b]] ", "https://w.org/A_[b]"],
      ["en", "https://a.io/{id} ", "https://a.io/{id}"],
    ])("links a URL in %s quotes and brackets: %j", (lang, text, href) => {
      language.value = lang;
      const { view, type } = setup("See |");
      type(text);

      const node = view.state.doc.nodeAt(
        view.state.doc.textContent.indexOf("h") + 1,
      )!;
      expect(node.text).toBe(href);
      expect(node.marks[0]?.attrs.href).toBe(href);
    });

    it("links a URL in single quotes and closes the quote", () => {
      language.value = "de";
      const { view, type } = setup("See |");
      type("'https://blank.app' ");

      expect(show(view)).toBe("See ‚https://blank.app‘ |");
      expect(view.state.doc.nodeAt(6)!.marks[0]?.attrs.href).toBe(
        "https://blank.app",
      );
      expect(view.state.doc.nodeAt(23)!.marks).toEqual([]);
    });

    it("links a URL only once the word ends", () => {
      const { view, type } = setup("See https://a.io|");
      type(".");

      expect(view.state.doc.rangeHasMark(0, 17, schema.marks.link)).toBe(false);
    });

    it("leaves a linked URL alone", () => {
      const link = schema.marks.link.create({ href: "https://b.io" });
      const { view, type } = setup(
        paragraph(schema.text("https://a.io", [link])),
      );
      type(" ");

      expect(view.state.doc.nodeAt(1)!.marks[0].attrs.href).toBe(
        "https://b.io",
      );
    });
  });

  describe("capitalization", () => {
    it.each([
      ["hello|", "Hello |"],
      ["  hello|", "  Hello |"],
      ["Hi. there|", "Hi. There |"],
      ["Hi! there|", "Hi! There |"],
      ["Hi? there|", "Hi? There |"],
      ["Hi.) there|", "Hi.) There |"],
      ["Hi. “there|", "Hi. “There |"],
      ["Hi. there.|", "Hi. There. |"],
      ["Hi. **there**|", "Hi. There |"],
      ["THe|", "The |"],
      ["So THis|", "So This |"],
      ["So i|", "So I |"],
    ])("corrects %j", (before, after) => {
      expect(typed(before, " ")).toBe(after);
    });

    it.each([
      ["after an abbreviation", "Use e.g. this|"],
      ["after a number", "Step 1. then|"],
      ["after an ellipsis", "Well... then|"],
      ["mid-sentence", "Hi there|"],
      ["a URL", "Hi. www.a.io|"],
      ["a word with digits", "Hi. abc1|"],
      ["plural acronyms", "So IDs|"],
      ["exceptions", "So MHz|"],
    ])("leaves %s alone", (_, before) => {
      setAutocorrect({ links: false });
      expect(typed(before, " ")).toBe(unchanged(before));
    });

    it("leaves a word after a line break alone", () => {
      const node = paragraph(
        schema.text("Hi."),
        schema.nodes.hard_break.create(),
        schema.text("there"),
      );

      expect(typed(node, " ")).toBe("Hi.￼there |");
    });

    it("waits for the word to be complete", () => {
      expect(typed("hello|", ",")).toBe("hello,|");
      expect(typed("hello,|", " ")).toBe("Hello, |");
    });

    it("follows the abbreviations of the language", () => {
      language.value = "de";
      expect(typed("Siehe z.B. das|", " ")).toBe("Siehe z.B. das |");
    });

    it.each([
      ["Use it, |", "i.e. this", "Use it, i.e. this|"],
      ["Use it, |", "i.e., x", "Use it, i.e., x|"],
      ["So |", "i think", "So I think|"],
      ["So |", "i, too", "So I, too|"],
    ])("corrects 'i' but not 'i.e.': %j", (before, text, after) => {
      expect(typed(before, text)).toBe(after);
    });

    it("corrects 'i' in English only", () => {
      language.value = "de";
      expect(typed("So i|", " ")).toBe("So i |");
    });
  });

  describe("smart quotes", () => {
    it.each([
      ["en", "\"Hi\" 'x'", "“Hi” ‘x’"],
      ["de", "\"Hi\" 'x'", "„Hi“ ‚x‘"],
      ["fr", '"Salut"', "« Salut »"],
      ["ru", "\"Hi\" 'x'", "«Hi» „x“"],
      ["xx", '"Hi"', "“Hi”"],
    ])("uses the quotes of %s", (lang, text, after) => {
      language.value = lang;
      // a single quote closes once the word ends
      expect(typed("|", text + " ")).toBe(after + " |");
    });

    it.each([
      ["fr", "« C'est l'heure »", "« C’est l’heure »"],
      ["fr", "J'ai dit", "J’ai dit"],
      ["it", "'l'uomo'.", "“l’uomo”."],
      ["pl", "'l'uomo' ", "«l’uomo» "],
      ["de", "'Haus'", "‚Haus’"],
      ["de", "'Haus' ", "‚Haus‘ "],
      ["de", "'Haus',", "‚Haus‘,"],
      ["de", "'Geht's' ", "‚Geht’s‘ "],
      ["en", "'don't' ", "‘don’t’ "],
      ["en", "the dogs' ", "the dogs’ "],
      ["de", "Hans' Buch ", "Hans’ Buch "],
    ])("keeps apostrophes in %s: %j", (lang, text, after) => {
      language.value = lang;
      expect(typed("So |", text)).toBe("So " + after + "|");
    });

    it("closes a single quote after an apostrophe mid-word only at its end", () => {
      language.value = "it";
      const { view, type } = setup("E |");
      type("'l'");
      expect(show(view)).toBe("E “l’|");
      type("uomo'");
      expect(show(view)).toBe("E “l’uomo’|");
      type(" ");
      expect(show(view)).toBe("E “l’uomo” |");
    });

    it("leaves the closing quote alone with quotes turned off", () => {
      language.value = "de";
      const { view, type } = setup("‚Haus’|");
      setAutocorrect({ quotes: false });
      type(" ");
      expect(show(view)).toBe("‚Haus’ |");
    });

    it.each([
      ["en", "don't", "don’t"],
      ["de", "geht's", "geht’s"],
      ["en", "So '90s", "So ‘90s"],
    ])("types an apostrophe in %s: %j", (lang, text, after) => {
      language.value = lang;
      expect(typed("|", text)).toBe(after + "|");
    });

    it("opens a quote after an opening bracket, dash or quote", () => {
      expect(typed("(|", '"')).toBe("(“|");
      expect(typed("a —|", '"')).toBe("a —“|");
      expect(typed("“|", "'")).toBe("“‘|");
    });

    it("can be undone to a straight quote", () => {
      const { view, type } = setup("|");
      type('"');
      undo(view.state, view.dispatch);

      expect(show(view)).toBe('"|');
    });
  });

  describe("block shortcuts", () => {
    it.each([
      ["#|", "heading"],
      ["###|", "heading"],
      ["-|", "bullet_list"],
      ["*|", "bullet_list"],
      ["+|", "bullet_list"],
      [">|", "blockquote"],
      ["3.|", "ordered_list"],
    ])("turns %j into a %s on Space", (before, type) => {
      const { view, type: typeInto } = setup(before);
      typeInto(" ");

      expect(view.state.doc.firstChild!.type.name).toBe(type);
      expect(view.state.doc.textContent).toBe("");
    });

    it.each([
      ["---|", "horizontal_rule"],
      ["```ts|", "code_block"],
    ])("turns %j into a %s on Enter", (before, type) => {
      const { view, press } = setup(before);

      expect(press("Enter")).toBe(true);
      expect(view.state.doc.firstChild!.type.name).toBe(type);
    });

    it.each(["#|Title", "-|item", "The #|"])(
      "needs the shortcut to be the whole line: %j",
      (before) => {
        expect(typed(before, " ")).toBe(unchanged(before));
      },
    );

    it("leaves a line with more than the shortcut alone on Enter", () => {
      const { view, press } = setup("---|x");

      expect(press("Enter")).toBe(false);
      expect(show(view)).toBe("---|x");
    });

    it.each([
      ["-|", "bullet_list"],
      ["*|", "bullet_list"],
      ["3.|", "ordered_list"],
      [">|", "blockquote"],
      ["#|", "heading"],
      ["###|", "heading"],
    ])("reverts %j with a single undo", (before) => {
      const { view, type } = setup(before);
      type(" ");
      undo(view.state, view.dispatch);

      expect(view.state.doc.toJSON()).toEqual(
        doc(p(before.replace("|", ""))).toJSON(),
      );
      expect(show(view)).toBe(before);
    });

    it.each([
      ["---|", "horizontal_rule"],
      ["```ts|", "code_block"],
    ])("reverts %j on Enter with a single undo", (before) => {
      const { view, press } = setup(before);
      press("Enter");
      undo(view.state, view.dispatch);

      expect(view.state.doc.toJSON()).toEqual(
        doc(p(before.replace("|", ""))).toJSON(),
      );
      expect(show(view)).toBe(before);
    });

    it("keeps the text typed just before when a shortcut is undone", () => {
      const { view, type } = setup(doc(p()));
      type("Intro");
      splitBlock(view.state, view.dispatch);
      type("## ");

      expect(view.state.doc.child(1).type.name).toBe("heading");
      undo(view.state, view.dispatch);
      expect(show(view)).toBe("Intro\n##|");
      undo(view.state, view.dispatch);
      expect(show(view)).toBe("|");
    });

    it("keeps what is typed in the new block when the shortcut is undone", () => {
      const { view, type } = setup("-|");
      type(" item");
      undo(view.state, view.dispatch);

      expect(view.state.doc.firstChild!.type.name).toBe("bullet_list");
      expect(show(view)).toBe("|");
      undo(view.state, view.dispatch);
      expect(show(view)).toBe("-|");
    });

    it("falls back to typing the space when the shortcut can't apply", () => {
      const { view, type } = setup(doc(ul(li(p("-")))));
      type(" ");

      expect(view.state.doc.textContent).toBe("- ");
    });
  });

  describe("Enter and Tab", () => {
    it("corrects before Enter and lets the keymap split", () => {
      const { view, press } = setup("The -->|");

      expect(press("Enter")).toBe(false);
      expect(show(view)).toBe("The →|");
    });

    it("corrects before Tab and lets the keymap indent", () => {
      const { view, press } = setup(doc(ul(li(p("a")), li(p("The -->")))));

      expect(press("Tab")).toBe(false);
      expect(view.state.doc.textContent).toBe("aThe →");
    });

    it.each(["Shift-Enter", "Mod-Enter", "Shift-Tab", "a"])(
      "ignores %s",
      (key) => {
        const { view, press } = setup("The -->|");

        expect(press(key)).toBe(false);
        expect(show(view)).toBe("The -->|");
      },
    );

    it("ignores Enter with a range selection", () => {
      const node = doc(p("The -->"));
      const { view, press } = setup(node, [1, 4]);

      expect(press("Enter")).toBe(false);
      expect(view.state.doc).toBe(node);
    });
  });

  describe("undo", () => {
    it("reverts the correction and keeps the trigger", () => {
      const { view, type } = setup("The -->|");
      type(" ");
      undo(view.state, view.dispatch);

      expect(show(view)).toBe("The --> |");
    });

    it("doesn't merge the next keystrokes into the correction", () => {
      const { view, type } = setup("The -->|");
      type(" next");
      undo(view.state, view.dispatch);

      expect(show(view)).toBe("The → |");
      undo(view.state, view.dispatch);
      expect(show(view)).toBe("The --> |");
    });
  });

  describe("code", () => {
    it.each([
      ["an arrow", "a -->", " ", "a --> "],
      ["a heading shortcut", "#", " ", "# "],
      ["a bullet shortcut", "-", " ", "- "],
      ["a quote", "a", '"', 'a"'],
      ["a symbol", "a (c", ")", "a (c)"],
      ["a link", "[a](b)", " ", "[a](b) "],
    ])("leaves %s in a code block alone", (_, text, typedText, after) => {
      const { view, type } = setup(doc(codeBlock(text)));
      type(typedText);

      expect(view.state.doc.toJSON()).toEqual(doc(codeBlock(after)).toJSON());
    });

    it("leaves a fence in a code block alone on Enter", () => {
      const { press } = setup(doc(codeBlock("---")));

      expect(press("Enter")).toBe(false);
    });

    it("leaves inline code alone", () => {
      const code = schema.marks.code.create();
      const { view, type } = setup(paragraph(schema.text("a -->", [code])));
      type(" ");

      expect(view.state.doc.textContent).toBe("a --> ");
    });
  });

  describe("settings", () => {
    it.each([
      ["arrows", "The -->|", " ", "The --> |"],
      ["symbols", "The |", "(c)", "The (c)|"],
      ["dashes", "A--B|", " ", "A--B |"],
      ["formatting", "The *em*|", " ", "The *em* |"],
      ["links", "The [a](b)|", " ", "The [a](b) |"],
      ["quotes", "|", '"', '"|'],
      ["capitalize", "hello|", " ", "hello |"],
      ["blocks", "#|", " ", "# |"],
    ])("can turn off %s", (setting, before, text, after) => {
      setAutocorrect({ [setting]: false });
      expect(typed(before, text)).toBe(after);
    });
  });

  it("ignores typing over a selection", () => {
    const { view, plugin } = setup(doc(p("The -->")), [1, 4]);
    const handled = plugin.props.handleTextInput?.call(
      plugin,
      view,
      1,
      4,
      " ",
      () => view.state.tr,
    );

    expect(handled).toBe(false);
  });

  it("ignores pasted text", () => {
    const { view, plugin } = setup("The -->|");
    const handled = plugin.props.handleTextInput?.call(
      plugin,
      view,
      8,
      8,
      " x",
      () => view.state.tr,
    );

    expect(handled).toBe(false);
  });
});
