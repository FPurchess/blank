import { beforeEach, describe, expect, it, vi } from "vitest";
import { schema } from "prosemirror-markdown";

import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";

import type { exporterFunc } from "../../exporters";
import { path } from "../../state";
import { createState, doc, p } from "../../test/editor";
import { flushPromises } from "../../test/async";
import exportAs from "./exportAs";

const title = "PDF-Export";
const filters = [{ name: "PDF-File", extensions: ["pdf"] }];
const bytes = new Uint8Array([1, 2, 3]);
const state = createState(doc(p("Hello")));

const createExporter = (warnings: string[] = []) =>
  vi.fn<exporterFunc>().mockResolvedValue({ contents: bytes, warnings });

describe("command.exportAs", () => {
  beforeEach(() => {
    path.value = null;
  });

  it.each(["", "  \n "])(
    "refuses to export an empty document (%j)",
    (content) => {
      const exporter = createExporter();

      expect(
        exportAs(title, exporter, filters)(createState(doc(p(content)))),
      ).toBe(false);

      expect(sendNotification).toHaveBeenCalledWith({
        title,
        body: "Your document is empty. There is nothing to export.",
      });
      expect(save).not.toHaveBeenCalled();
      expect(exporter).not.toHaveBeenCalled();
    },
  );

  it("exports a document that only has an image", () => {
    const image = schema.node("image", { src: "a.png" });
    const onlyImage = createState(doc(schema.node("paragraph", null, [image])));
    vi.mocked(save).mockResolvedValue(null);

    expect(exportAs(title, createExporter(), filters)(onlyImage)).toBe(true);
  });

  it("exports the document to the chosen file", async () => {
    vi.mocked(save).mockResolvedValue("/out.pdf");
    const exporter = createExporter();

    expect(exportAs(title, exporter, filters)(state)).toBe(true);
    await flushPromises();

    expect(save).toHaveBeenCalledWith({ filters, defaultPath: undefined });
    expect(exporter).toHaveBeenCalledWith(state, { docPath: null });
    expect(writeFile).toHaveBeenCalledWith("/out.pdf", bytes);
    expect(sendNotification).toHaveBeenCalledWith({
      title,
      body: "Your file has been exported",
    });
  });

  it("suggests the document's name and passes its path", async () => {
    path.value = "/docs/report.md";
    vi.mocked(save).mockResolvedValue("/docs/report.pdf");
    const exporter = createExporter();

    exportAs(title, exporter, filters)(state);
    await flushPromises();

    expect(save).toHaveBeenCalledWith({
      filters,
      defaultPath: "/docs/report.pdf",
    });
    expect(exporter).toHaveBeenCalledWith(state, {
      docPath: "/docs/report.md",
    });
  });

  it("adds the exporter's warnings to the notification", async () => {
    vi.mocked(save).mockResolvedValue("/out.pdf");

    exportAs(
      title,
      createExporter(["1 image could not be embedded: a"]),
      filters,
    )(state);
    await flushPromises();

    expect(sendNotification).toHaveBeenCalledWith({
      title,
      body: "Your file has been exported. 1 image could not be embedded: a",
    });
  });

  it("refuses a file name with another extension", async () => {
    vi.mocked(save).mockResolvedValue("/docs/report.md");
    const exporter = createExporter();

    exportAs(title, exporter, filters)(state);
    await flushPromises();

    expect(exporter).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
    expect(sendNotification).toHaveBeenCalledWith({
      title,
      body: "Failed to export file: choose a .pdf file name",
    });
  });

  it("writes a file name without an extension as typed", async () => {
    vi.mocked(save).mockResolvedValue("/docs/report");

    exportAs(title, createExporter(), filters)(state);
    await flushPromises();

    expect(writeFile).toHaveBeenCalledWith("/docs/report", bytes);
  });

  it("does nothing when the dialog is cancelled", async () => {
    vi.mocked(save).mockResolvedValue(null);
    const exporter = createExporter();

    exportAs(title, exporter, filters)(state);
    await flushPromises();

    expect(exporter).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("reports a failing exporter with its message", async () => {
    vi.mocked(save).mockResolvedValue("/out.pdf");
    const exporter = vi
      .fn<exporterFunc>()
      .mockRejectedValue(new Error("no fonts"));

    exportAs(title, exporter, filters)(state);
    await flushPromises();

    expect(writeFile).not.toHaveBeenCalled();
    expect(sendNotification).toHaveBeenCalledWith({
      title,
      body: "Failed to export file: no fonts",
    });
  });

  it("reports a failed write that isn't an Error", async () => {
    vi.mocked(save).mockResolvedValue("/out.pdf");
    vi.mocked(writeFile).mockRejectedValue("forbidden path");

    exportAs(title, createExporter(), filters)(state);
    await flushPromises();

    expect(sendNotification).toHaveBeenCalledWith({
      title,
      body: "Failed to export file: forbidden path",
    });
  });
});
