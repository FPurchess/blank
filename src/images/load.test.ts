import { describe, expect, it, vi } from "vitest";

import { readFile } from "@tauri-apps/plugin-fs";
import { fetch } from "@tauri-apps/plugin-http";

import { IMAGES, bytesOf, dataUrl } from "../test/images";
import { MAX_REMOTE_BYTES, loadImage } from "./load";

const png = bytesOf(IMAGES.png);

const response = (body: Uint8Array, init: ResponseInit = {}) =>
  new Response(body as BodyInit, init);

describe("images.loadImage", () => {
  it("decodes data URLs", async () => {
    expect(await loadImage(dataUrl("image/png", IMAGES.png), null)).toEqual({
      bytes: png,
      mime: "image/png",
    });
  });

  it("rejects invalid data URLs", async () => {
    expect(await loadImage("data:image/png;base64,***", null)).toEqual({
      error: "invalid data URL",
    });
  });

  it("reads relative images next to the document", async () => {
    vi.mocked(readFile).mockResolvedValue(png);

    const result = await loadImage("img/a%20b.png", "/home/u/notes.md");

    expect(readFile).toHaveBeenCalledWith("/home/u/img/a b.png");
    expect(result).toEqual({ bytes: png, mime: "image/png" });
  });

  it("can't read relative images of an unsaved document", async () => {
    expect(await loadImage("img/a.png", null)).toEqual({
      error: "save the document to resolve relative images",
    });
    expect(readFile).not.toHaveBeenCalled();
  });

  it("reports files that can't be read", async () => {
    vi.mocked(readFile).mockRejectedValue("No such file");

    expect(await loadImage("/a.png", null)).toEqual({ error: "No such file" });
  });

  it("rejects files that aren't images", async () => {
    vi.mocked(readFile).mockResolvedValue(new TextEncoder().encode("# text"));

    expect(await loadImage("/a.png", null)).toEqual({ error: "not an image" });
  });

  it("downloads remote images with a timeout", async () => {
    vi.mocked(fetch).mockResolvedValue(response(png));

    const result = await loadImage("https://example.com/a.png", null);

    expect(fetch).toHaveBeenCalledWith("https://example.com/a.png", {
      connectTimeout: 10000,
      signal: expect.any(AbortSignal),
    });
    expect(result).toEqual({ bytes: png, mime: "image/png" });
  });

  it("reports failed downloads", async () => {
    vi.mocked(fetch).mockResolvedValue(response(png, { status: 404 }));
    expect(await loadImage("https://example.com/a.png", null)).toEqual({
      error: "HTTP 404",
    });

    vi.mocked(fetch).mockRejectedValue(new Error("timed out"));
    expect(await loadImage("https://example.com/a.png", null)).toEqual({
      error: "timed out",
    });
  });

  it("refuses remote images that are too large", async () => {
    const tooLarge = String(MAX_REMOTE_BYTES + 1);
    vi.mocked(fetch).mockResolvedValue(
      response(png, { headers: { "content-length": tooLarge } }),
    );
    expect(await loadImage("https://example.com/a.png", null)).toEqual({
      error: "the image is too large",
    });

    vi.mocked(fetch).mockResolvedValue(
      response(new Uint8Array(MAX_REMOTE_BYTES + 1)),
    );
    expect(await loadImage("https://example.com/a.png", null)).toEqual({
      error: "the image is too large",
    });
  });
});
