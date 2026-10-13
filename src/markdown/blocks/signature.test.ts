import { DOMParser } from "prosemirror-model";
import { describe, expect, it } from "vitest";

import { parseMarkdown, schema, serializeMarkdown } from "../index";
import { signatureLabel, signatureLines, signatureShare } from "./signature";

const attrs = (extra: Record<string, unknown> = {}) =>
  schema.nodes.signature.create(extra).attrs;

const signing = {
  name: "Ada Lovelace",
  place: "Berlin",
  date: new Date(2026, 9, 8),
  format: "long" as const,
  language: "en-GB",
};

describe("a signature block", () => {
  it("is read and written as one marker line", () => {
    const markdown = [
      '<!-- blank:signature@1 role="Tenant" name="Ada Lovelace" date="2026-10-08" width="75%" -->',
      "<!-- blank:signature@1 -->",
    ].join("\n\n");
    const doc = parseMarkdown(markdown);
    expect(doc.child(0).type.name).toBe("signature");
    expect(doc.child(0).attrs).toMatchObject({
      role: "Tenant",
      name: "Ada Lovelace",
      date: "2026-10-08",
      width: "75%",
    });
    expect(serializeMarkdown(doc)).toBe(markdown);
  });

  it("keeps a marker it can't read as it is", () => {
    const markdown = '<!-- blank:signature@1 date="tomorrow" -->';
    const doc = parseMarkdown(markdown);
    expect(doc.child(0).type.name).toBe("unknown_block");
    expect(serializeMarkdown(doc)).toBe(markdown);
  });

  it("leaves lines to fill in by hand while unsigned", () => {
    expect(signatureLines(attrs())).toEqual(["Place, date: ____________"]);
    expect(
      signatureLines(
        attrs({ name: "Ada Lovelace", role: "Tenant", place: "Berlin" }),
      ),
    ).toEqual(["Ada Lovelace · Tenant", "Berlin, ____________"]);
    // a fixed date is written as the signed ones are
    expect(
      signatureLines(attrs({ date: "2026-01-02" }), { dates: signing }),
    ).toEqual(["____________, 2 January 2026"]);
  });

  it("is filled in when signed: the signer's name, place and date", () => {
    expect(signatureLines(attrs({ role: "Tenant" }), { signing })).toEqual([
      "Ada Lovelace · Tenant",
      "Berlin, 8 October 2026",
    ]);
    expect(signatureLines(attrs({ date: "2026-01-02" }), { signing })).toEqual([
      "Ada Lovelace",
      "Berlin, 2 January 2026",
    ]);
    // a date left blank stays a line to write it by hand
    expect(signatureLines(attrs({ date: "none" }), { signing })).toEqual([
      "Ada Lovelace",
      "Berlin, ____________",
    ]);
  });

  it("takes only dates that are days of the calendar", () => {
    const markdown = '<!-- blank:signature@1 date="2026-02-30" -->';
    expect(parseMarkdown(markdown).child(0).type.name).toBe("unknown_block");
  });

  it("is pasted only with arguments a marker can hold", () => {
    const pasted = (args: object) => {
      const div = document.createElement("div");
      div.setAttribute("data-blank-signature", JSON.stringify(args));
      const wrapper = document.createElement("div");
      wrapper.append(div);
      const parsed = DOMParser.fromSchema(schema).parse(wrapper);
      return parsed.firstChild?.type.name;
    };
    expect(pasted({ role: "Tenant" })).toBe("signature");
    expect(pasted({ role: { evil: true } })).not.toBe("signature");
  });

  it("is named after whom it is for", () => {
    expect(
      signatureLabel(attrs({ name: "Ada Lovelace", role: "Tenant" })),
    ).toBe("Signature of Ada Lovelace, Tenant");
    expect(signatureLabel(attrs())).toBe("Signature");
  });

  it("takes the engine's default width unless it says", () => {
    expect(signatureShare(attrs())).toBeNull();
    expect(signatureShare(attrs({ width: "75%" }))).toBe(0.75);
  });
});
