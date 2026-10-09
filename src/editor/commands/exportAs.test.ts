import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { schema } from "../../markdown";

import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";

import type { exporterFunc } from "../../exporters";
import { announcement, path } from "../../state";
import { forgetEngineFailure, useFallbackEditor } from "../../engine/engine";
import { config } from "../../config";
import { layoutOf } from "../../layout/resolve";
import { DEFAULT_PAGE } from "../../layout/settings";
import { createState, doc, docWithFrontmatter, p } from "../../test/editor";
import { flushPromises } from "../../test/async";
import exportAs, { PDF_UNAVAILABLE } from "./exportAs";

const title = "PDF-Export";
const filters = [{ name: "PDF-File", extensions: ["pdf"] }];
const bytes = new Uint8Array([1, 2, 3]);
const state = createState(doc(p("Hello")));
// runs the export, as a key or the menu does
const dispatch = () => {};

const createExporter = (warnings: string[] = []) =>
  vi.fn<exporterFunc>().mockResolvedValue({ contents: bytes, warnings });

describe("command.exportAs", () => {
  it("only says whether there's something to export when asked", () => {
    expect(exportAs(title, createExporter(), filters)(state)).toBe(true);
    expect(
      exportAs(title, createExporter(), filters)(createState(doc(p("")))),
    ).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    path.value = null;
  });

  it.each(["", "  \n "])(
    "refuses to export an empty document (%j)",
    (content) => {
      const exporter = createExporter();

      expect(
        exportAs(
          title,
          exporter,
          filters,
        )(createState(doc(p(content))), dispatch),
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

    expect(
      exportAs(title, createExporter(), filters)(onlyImage, dispatch),
    ).toBe(true);
  });

  it("exports the document to the chosen file", async () => {
    vi.mocked(save).mockResolvedValue("/out.pdf");
    const exporter = createExporter();

    expect(exportAs(title, exporter, filters)(state, dispatch)).toBe(true);
    await flushPromises();

    expect(save).toHaveBeenCalledWith({ filters, defaultPath: undefined });
    // jsdom's locale is en-US, so the page is Letter
    expect(exporter).toHaveBeenCalledWith(state, {
      docPath: null,
      layout: layoutOf(DEFAULT_PAGE, "en-US"),
    });
    expect(writeFile).toHaveBeenCalledWith("/out.pdf", bytes);
    expect(sendNotification).toHaveBeenCalledWith({
      title,
      body: "Exported on Letter pages",
    });
  });

  it("suggests the document's name and passes its path", async () => {
    path.value = "/docs/report.md";
    vi.mocked(save).mockResolvedValue("/docs/report.pdf");
    const exporter = createExporter();

    exportAs(title, exporter, filters)(state, dispatch);
    await flushPromises();

    expect(save).toHaveBeenCalledWith({
      filters,
      defaultPath: "/docs/report.pdf",
    });
    expect(exporter).toHaveBeenCalledWith(
      state,
      expect.objectContaining({ docPath: "/docs/report.md" }),
    );
  });

  it("adds the exporter's warnings to the notification", async () => {
    vi.mocked(save).mockResolvedValue("/out.pdf");

    exportAs(
      title,
      createExporter(["1 image could not be embedded: a"]),
      filters,
    )(state, dispatch);
    await flushPromises();

    expect(sendNotification).toHaveBeenCalledWith({
      title,
      body: "Exported on Letter pages. 1 image could not be embedded: a",
    });
  });

  it.each([
    [1, "Exported 1 Letter page"],
    [12, "Exported 12 Letter pages"],
  ])("tells how many pages it exported: %d", async (pages, body) => {
    vi.mocked(save).mockResolvedValue("/out.pdf");
    const exporter = vi
      .fn<exporterFunc>()
      .mockResolvedValue({ contents: bytes, warnings: [], pages });

    exportAs(title, exporter, filters)(state, dispatch);
    await flushPromises();

    expect(sendNotification).toHaveBeenCalledWith({ title, body });
  });

  it("lays the document out on its own page setup", async () => {
    vi.mocked(save).mockResolvedValue("/out.pdf");
    const exporter = createExporter();
    const landscape = createState(
      docWithFrontmatter(
        "page:\n  size: a5\n  orientation: landscape",
        p("Hello"),
      ),
    );

    exportAs(title, exporter, filters)(landscape, dispatch);
    await flushPromises();

    const [, { layout }] = exporter.mock.calls[0];
    expect(layout.paper.name).toBe("a5");
    expect(layout.orientation).toBe("landscape");
    expect(sendNotification).toHaveBeenCalledWith({
      title,
      body: "Exported on A5 landscape pages",
    });
  });

  it("follows the user's default page setup", async () => {
    vi.mocked(save).mockResolvedValue("/out.pdf");
    const exporter = createExporter();
    const before = config.value;
    config.value = {
      ...before,
      layout: { page: { ...DEFAULT_PAGE, size: "legal" } },
    };

    try {
      exportAs(title, exporter, filters)(state, dispatch);
      await flushPromises();
    } finally {
      config.value = before;
    }

    expect(exporter.mock.calls[0][1].layout.paper.name).toBe("legal");
  });

  it("tells which page settings it couldn't use", async () => {
    vi.mocked(save).mockResolvedValue("/out.pdf");

    exportAs(
      title,
      createExporter(),
      filters,
    )(
      createState(docWithFrontmatter("page:\n  size: a2", p("Hello"))),
      dispatch,
    );
    await flushPromises();

    expect(sendNotification).toHaveBeenCalledWith({
      title,
      body: "Exported on Letter pages. Blank used the default page setup where its paper size is unknown",
    });
  });

  it("refuses a file name with another extension", async () => {
    vi.mocked(save).mockResolvedValue("/docs/report.md");
    const exporter = createExporter();

    exportAs(title, exporter, filters)(state, dispatch);
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

    exportAs(title, createExporter(), filters)(state, dispatch);
    await flushPromises();

    expect(writeFile).toHaveBeenCalledWith("/docs/report", bytes);
  });

  it("does nothing when the dialog is cancelled", async () => {
    vi.mocked(save).mockResolvedValue(null);
    const exporter = createExporter();

    exportAs(title, exporter, filters)(state, dispatch);
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

    exportAs(title, exporter, filters)(state, dispatch);
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

    exportAs(title, createExporter(), filters)(state, dispatch);
    await flushPromises();

    expect(sendNotification).toHaveBeenCalledWith({
      title,
      body: "Failed to export file: forbidden path",
    });
  });
});

describe("the PDF export without the engine", () => {
  afterEach(() => forgetEngineFailure());

  it.each(["off", "unavailable"] as const)(
    "tells that it needs the page layout, which is %s",
    (status) => {
      useFallbackEditor(status);
      const exporter = createExporter();

      expect(exportAs(title, exporter, filters)(state, dispatch)).toBe(true);

      expect(sendNotification).toHaveBeenCalledWith({
        title,
        body: PDF_UNAVAILABLE,
      });
      expect(announcement.value?.text).toBe(PDF_UNAVAILABLE);
      expect(save).not.toHaveBeenCalled();
      expect(exporter).not.toHaveBeenCalled();
    },
  );

  it("still exports after the engine failed while Blank ran", () => {
    useFallbackEditor("failed");
    vi.mocked(save).mockResolvedValue(null);
    exportAs(title, createExporter(), filters)(state, dispatch);
    expect(save).toHaveBeenCalled();
  });

  it("exports to Word without the engine", () => {
    useFallbackEditor("unavailable");
    vi.mocked(save).mockResolvedValue(null);
    exportAs(title, createExporter(), [{ name: "Word", extensions: ["docx"] }])(
      state,
      dispatch,
    );
    expect(save).toHaveBeenCalled();
  });
});
