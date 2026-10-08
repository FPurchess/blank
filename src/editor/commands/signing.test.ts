import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { schema } from "../../markdown";
import {
  importedFrom,
  path,
  savedMarks,
  signatureDialog,
  signDialog,
  signingPlace,
} from "../../state";
import { flushPromises } from "../../test/async";
import { createState, createTestView, doc, p } from "../../test/editor";
import type { SavedMark } from "../../signing/profile";
import { editMark, exportSigned, openSignatureDialog } from "./signing";

const toPDF = vi.hoisted(() => vi.fn());
vi.mock("../../exporters", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  toPDF,
}));
const renderMark = vi.hoisted(() => vi.fn());
vi.mock("../../signing/render", () => ({ renderMark }));
const marks = vi.hoisted(() => ({
  loadMarks: vi.fn(),
  saveMark: vi.fn(),
}));
vi.mock("../../signing/marks", () => marks);

const SIGNATURE: SavedMark = {
  source: { kind: "draw", strokes: [] },
  png: "data:image/png;base64,AAAA",
  width: 40,
  height: 20,
};

const signature = (attrs: Record<string, unknown> = {}) =>
  schema.nodes.signature.create(attrs);

const run = (...blocks: Parameters<typeof doc>) => {
  const state = createState(doc(...blocks));
  const view = createTestView(state);
  return exportSigned()(state, view.dispatch, view);
};

describe("signing", () => {
  beforeEach(() => {
    path.value = "/docs/lease.md";
    importedFrom.value = null;
    signingPlace.value = "Berlin";
    savedMarks.value = { signature: SIGNATURE, initials: null };
    toPDF.mockResolvedValue({
      contents: new Uint8Array([1]),
      warnings: [],
      pages: 1,
    });
    vi.mocked(save).mockResolvedValue("/docs/lease signed.pdf");
    marks.loadMarks.mockResolvedValue(undefined);
    marks.saveMark.mockResolvedValue(undefined);
  });

  afterEach(() => {
    signDialog.value = null;
    signatureDialog.value = null;
    savedMarks.value = undefined;
  });

  it("does nothing when only asked whether it can run", () => {
    const can = (state: ReturnType<typeof createState>) =>
      exportSigned()(state);
    expect(can(createState(doc(p("Text"), signature())))).toBe(true);
    expect(can(createState(doc(p())))).toBe(false);
    expect(sendNotification).not.toHaveBeenCalled();
    expect(signDialog.value).toBeNull();
  });

  it("says when there's no block to sign in", () => {
    expect(run(p("Text"))).toBe(true);
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("no signature block"),
      }),
    );
    expect(signDialog.value).toBeNull();
  });

  it("offers the blocks, the one with the signer's name chosen", async () => {
    run(
      p("Text"),
      signature({ role: "Landlord", name: "Bea" }),
      signature({ role: "Tenant" }),
    );
    await flushPromises();
    const request = signDialog.value!;
    expect(request.title).toBe("lease");
    expect(request.targets.map((target) => target.label)).toEqual([
      "Bea · Landlord",
      "Tenant",
    ]);
    // the one that names nobody, for whoever signs
    expect(request.chosen).toBe(request.targets[1].pos);
    expect(request.place).toBe("Berlin");
    expect(request.warnings).toEqual([]);
  });

  it("asks where to save, then fills the block in and writes the PDF", async () => {
    run(p("Text"), signature({ role: "Tenant" }));
    await flushPromises();
    const { targets } = signDialog.value!;
    signDialog.value!.submit(targets[0].pos, "Hamburg");
    await flushPromises();
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: "/docs/lease signed.pdf" }),
    );
    const context = toPDF.mock.calls[0][1];
    expect(context.signed).toMatchObject({
      pos: targets[0].pos,
      src: SIGNATURE.png,
      signing: { place: "Hamburg" },
    });
    expect(writeFile).toHaveBeenCalledWith(
      "/docs/lease signed.pdf",
      new Uint8Array([1]),
    );
    expect(signingPlace.value).toBe("Hamburg");
  });

  it("warns that an imported Word document's layout can differ", async () => {
    path.value = null;
    importedFrom.value = "/docs/offer.docx";
    run(p("Offer"), signature());
    await flushPromises();
    expect(signDialog.value!.title).toBe("offer");
    expect(signDialog.value!.warnings[0]).toContain("Word");
  });

  it("asks for the signature first when there is none", async () => {
    savedMarks.value = { signature: null, initials: null };
    run(p("Offer"), signature());
    await flushPromises();
    expect(signatureDialog.value?.mark).toBe("signature");
    expect(signDialog.value).toBeNull();
    // once it's saved, on to signing
    renderMark.mockResolvedValue(SIGNATURE);
    marks.saveMark.mockImplementation(async () => {
      savedMarks.value = { signature: SIGNATURE, initials: null };
    });
    expect(
      await signatureDialog.value!.submit({ kind: "draw", strokes: [] }),
    ).toBe(true);
    expect(signDialog.value).not.toBeNull();
  });

  it("opens the dialog of the initials, with what is saved", async () => {
    savedMarks.value = { signature: null, initials: SIGNATURE };
    const state = createState(doc(p()));
    editMark("initials")(state, () => {});
    await flushPromises();
    expect(signatureDialog.value).toMatchObject({
      mark: "initials",
      saved: SIGNATURE,
    });
  });

  it("saves nothing when there's no ink", async () => {
    await openSignatureDialog("signature");
    renderMark.mockResolvedValue(null);
    expect(
      await signatureDialog.value!.submit({ kind: "draw", strokes: [] }),
    ).toBe(false);
    expect(marks.saveMark).not.toHaveBeenCalled();
  });
});
