import { afterEach, describe, expect, it, vi } from "vitest";

import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";

import type { exporterFunc } from "../../exporters";
import { createState, doc, p, setEditorDomText } from "../../test/editor";
import { flushPromises } from "../../test/async";
import exportAs from "./exportAs";

const title = "PDF-Export";
const filters = [{ name: "PDF-File", extensions: ["pdf"] }];
const bytes = new Uint8Array([1, 2, 3]);
const state = createState(doc(p("Hello")));

const createExporter = () => vi.fn<exporterFunc>().mockResolvedValue(bytes);

describe("command.exportAs", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it.each(["", "  \n "])(
    "refuses to export an empty document (%j)",
    (content) => {
      setEditorDomText(content);
      const exporter = createExporter();

      expect(exportAs(title, exporter, filters)(state)).toBe(false);

      expect(sendNotification).toHaveBeenCalledWith({
        title,
        body: "Your document is empty. There is nothing to export.",
      });
      expect(save).not.toHaveBeenCalled();
      expect(exporter).not.toHaveBeenCalled();
    },
  );

  it("refuses to export when the editor isn't mounted", () => {
    expect(exportAs(title, createExporter())(state)).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it("exports the document to the chosen file", async () => {
    setEditorDomText("Hello");
    vi.mocked(save).mockResolvedValue("/out.pdf");
    const exporter = createExporter();

    expect(exportAs(title, exporter, filters)(state)).toBe(true);
    await flushPromises();

    expect(save).toHaveBeenCalledWith({ filters });
    expect(exporter).toHaveBeenCalledWith(state);
    expect(writeFile).toHaveBeenCalledWith("/out.pdf", bytes);
    expect(sendNotification).toHaveBeenCalledWith({
      title,
      body: "Your file has been exported",
    });
  });

  it("does nothing when the dialog is cancelled", async () => {
    setEditorDomText("Hello");
    vi.mocked(save).mockResolvedValue(null);
    const exporter = createExporter();

    exportAs(title, exporter, filters)(state);
    await flushPromises();

    expect(exporter).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("reports a failing exporter with its message", async () => {
    setEditorDomText("Hello");
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
    setEditorDomText("Hello");
    vi.mocked(save).mockResolvedValue("/out.pdf");
    vi.mocked(writeFile).mockRejectedValue("forbidden path");

    exportAs(title, createExporter(), filters)(state);
    await flushPromises();

    expect(sendNotification).toHaveBeenCalledWith({
      title,
      body: 'Failed to export file: "forbidden path"',
    });
  });
});
