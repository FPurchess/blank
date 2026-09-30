import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { documentFields } from "../layout/bands";
import { doc, h, p } from "../test/editor";
import { testEngine } from "../test/engine";
import { testLayout } from "../test/layout";
import { settingsOf } from "./engine";
import { FONT_FILES } from "./fonts";
import { flatten } from "./flatten";
import { type PdfJob, writePdf } from "./pdfJob";
import { handleJob } from "./pdfWorker";
import { LayoutEngine } from "./wasm/blank_layout.js";

const LONG =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";

const fonts = FONT_FILES.map((file) =>
  readFileSync(resolve(import.meta.dirname, "../../fonts", file)),
);

const jobOf = (node = doc(h(1, "Title"), ...Array(40).fill(p(LONG)))) => {
  const layout = testLayout();
  const fields = documentFields(node);
  const job: PdfJob = {
    fonts,
    fallbacks: [],
    images: [],
    settings: JSON.stringify(settingsOf(layout, fields)),
    items: JSON.stringify(
      flatten(node, () => undefined).map((record) => record.build()),
    ),
    title: "Title",
    author: "",
  };
  return { job, node, layout, fields };
};

describe("writePdf", () => {
  it("lays out the pages the page view shows", () => {
    const { job, node, layout, fields } = jobOf();
    const screen = testEngine();
    screen.setSettings(layout, fields);
    screen.sync(node, () => undefined);

    const result = writePdf(LayoutEngine, job);

    expect(result.pages).toBe(screen.pages());
    expect(result.pages).toBeGreaterThan(1);
    expect(new TextDecoder().decode(result.pdf.slice(0, 5))).toBe("%PDF-");
    expect(result.missing).toBe("");
  });

  it("writes the language, and what it left out", () => {
    testEngine();
    const { job } = jobOf(doc(p("Grüezi")));
    const result = writePdf(LayoutEngine, {
      ...job,
      language: "de-CH",
      images: [{ src: "x.png", bytes: new Uint8Array([1, 2, 3]), jpeg: false }],
      items: JSON.stringify([
        ...JSON.parse(job.items),
        {
          kind: "image",
          pos: 9,
          src: "x.png",
          width: 30,
          height: 20,
          alt: "x",
          indent: 0,
          before: 0,
          after: 0,
          bars: [],
          barsContinue: false,
        },
      ]),
    });
    expect(new TextDecoder("latin1").decode(result.pdf)).toMatch(
      /\/Lang\s*\(de-CH\)/,
    );
    expect(result.warnings).toEqual([{ kind: "image", src: "x.png" }]);
  });

  it("tells which characters no font has", () => {
    testEngine();
    const { job } = jobOf(doc(p("中文")));
    expect(writePdf(LayoutEngine, job).missing).toContain("中");
  });
});

describe("the PDF worker", () => {
  it("replies with the PDF", async () => {
    testEngine();
    const reply = vi.fn();
    await handleJob(jobOf().job, reply);
    const [message, transfer] = reply.mock.calls[0];
    expect(message.result.pages).toBeGreaterThan(1);
    expect(transfer).toEqual([message.result.pdf.buffer]);
  });

  it("replies with the error of a job that fails", async () => {
    testEngine();
    const reply = vi.fn();
    await handleJob({ ...jobOf().job, items: "not json" }, reply);
    expect(reply).toHaveBeenCalledWith({ error: expect.any(String) }, []);
  });
});
