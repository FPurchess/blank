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
import { config } from "../../config";
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
const ipc = vi.hoisted(() => ({
  checkPassphrase: vi.fn(),
  signPdf: vi.fn(),
}));
vi.mock("../../signing/ipc", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...ipc,
}));
vi.mock("../../signing/certificate", () => ({
  loadCertificate: vi.fn(async () => {}),
  openCertificateDialog: vi.fn(),
  reportSigningFailure: vi.fn(),
}));

const SIGNATURE: SavedMark = {
  source: { kind: "draw", strokes: [] },
  png: "data:image/png;base64,AAAA",
  width: 40,
  height: 20,
};

const signature = (attrs: Record<string, unknown> = {}) =>
  schema.nodes.signature.create(attrs);

let view = createTestView(createState(doc(p())));
const run = (...blocks: Parameters<typeof doc>) => {
  const state = createState(doc(...blocks));
  view = createTestView(state);
  return exportSigned()(state, view.dispatch, view);
};
const BOX = { page: 0, x: 70, y: 600, width: 230, height: 70 };

const withName = (name: string) => {
  config.value = {
    ...config.value,
    signing: { ...config.value.signing, name },
  };
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
    withName("");
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
    signDialog.value!.submit(targets[0].pos, "Hamburg", null);
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

  it("remembers the place only once the PDF is written", async () => {
    vi.mocked(save).mockResolvedValue(null);
    run(p("Text"), signature());
    await flushPromises();
    signDialog.value!.submit(signDialog.value!.targets[0].pos, "Hamburg", null);
    await flushPromises();
    expect(signingPlace.value).toBe("Berlin");
  });

  it("chooses the block with the user's name, which signs as them", async () => {
    withName("Ada Lovelace");
    run(
      p("Text"),
      signature({ role: "Landlord" }),
      signature({ name: "Ada Lovelace" }),
    );
    await flushPromises();
    const request = signDialog.value!;
    expect(request.chosen).toBe(request.targets[1].pos);
    // a block that names nobody is signed in the user's name
    request.submit(request.targets[0].pos, "", null);
    await flushPromises();
    expect(toPDF.mock.calls[0][1].signed.signing.name).toBe("Ada Lovelace");
  });

  it("signs the document as it is once the dialog closes", async () => {
    run(p("Text"), signature({ role: "Tenant" }));
    await flushPromises();
    const { targets } = signDialog.value!;
    // typed meanwhile, before the block
    view.dispatch(view.state.tr.insertText("More ", 1));
    signDialog.value!.submit(targets[0].pos, "", null);
    await flushPromises();
    const [state, context] = toPDF.mock.calls[0];
    expect(state.doc).toBe(view.state.doc);
    expect(state.doc.nodeAt(context.signed.pos).type.name).toBe("signature");
  });

  it("signs digitally with the passphrase: the field over the filled in block", async () => {
    toPDF.mockResolvedValue({
      contents: new Uint8Array([1]),
      warnings: [],
      pages: 1,
      signatureBox: BOX,
    });
    ipc.signPdf.mockResolvedValue(new Uint8Array([2]));
    ipc.checkPassphrase.mockRejectedValue({ kind: "wrongPassphrase" });
    run(p("Text"), signature({ role: "Tenant" }));
    await flushPromises();
    const request = signDialog.value!;
    expect(await request.check("wrong")).toBe("The passphrase is wrong");
    ipc.checkPassphrase.mockResolvedValue(undefined);
    expect(await request.check("right")).toBeNull();
    request.submit(request.targets[0].pos, "Hamburg", "right");
    await flushPromises();
    expect(ipc.signPdf).toHaveBeenCalledWith(new Uint8Array([1]), "right", {
      page: 1,
      rect: [70, 600, 230, 70],
      location: "Hamburg",
      reason: null,
      timestampServer: null,
    });
    // the signed PDF is what is written
    expect(writeFile).toHaveBeenCalledWith(
      "/docs/lease signed.pdf",
      new Uint8Array([2]),
    );
  });

  it("writes nothing when signing fails, and says why", async () => {
    toPDF.mockResolvedValue({
      contents: new Uint8Array([1]),
      warnings: [],
      pages: 1,
      signatureBox: BOX,
    });
    ipc.signPdf.mockRejectedValue({
      kind: "failed",
      message: "The timestamp server didn't answer",
    });
    run(p("Text"), signature());
    await flushPromises();
    signDialog.value!.submit(signDialog.value!.targets[0].pos, "", "right");
    await flushPromises();
    expect(writeFile).not.toHaveBeenCalled();
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "Failed to export file: The timestamp server didn't answer",
      }),
    );
  });

  it("never signs a PDF without the block's place for the signature", async () => {
    run(p("Text"), signature());
    await flushPromises();
    signDialog.value!.submit(signDialog.value!.targets[0].pos, "", "right");
    await flushPromises();
    expect(ipc.signPdf).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
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
    signatureDialog.value!.done();
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
    await openSignatureDialog("signature", () => {});
    renderMark.mockResolvedValue(null);
    expect(
      await signatureDialog.value!.submit({ kind: "draw", strokes: [] }),
    ).toBe(false);
    expect(marks.saveMark).not.toHaveBeenCalled();
  });
});
