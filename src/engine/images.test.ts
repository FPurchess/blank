import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fittedSize,
  forgetFailures,
  forgetImages,
  imageSizes,
  imagesLoaded,
  loadedImage,
  loadedImages,
} from "./images";

// the asset protocol's urls, as Tauri makes them
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (file: string) => `asset://localhost${file}`,
  invoke: vi.fn(),
}));

// the images the webview was asked to load
let requested: FakeImage[] = [];

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  src = "";
  constructor() {
    requested.push(this);
  }
  load(width: number, height: number) {
    this.naturalWidth = width;
    this.naturalHeight = height;
    this.onload?.();
  }
}

const room = { width: 450, height: 700 };

describe("the page view's images", () => {
  beforeEach(() => {
    requested = [];
    vi.stubGlobal("Image", FakeImage);
  });
  afterEach(() => forgetImages());

  it("loads a relative image next to each document", () => {
    expect(loadedImage("img.png", "/a/doc.md")).toBeNull();
    expect(loadedImage("img.png", "/b/doc.md")).toBeNull();
    expect(requested.map((image) => image.src)).toEqual([
      "asset://localhost/a/img.png",
      "asset://localhost/b/img.png",
    ]);
    requested[0].load(300, 150);
    requested[1].load(60, 60);

    expect(imageSizes("/a/doc.md", room)("img.png")).toEqual({
      width: 225,
      height: 112.5,
    });
    expect(imageSizes("/b/doc.md", room)("img.png")).toEqual({
      width: 45,
      height: 45,
    });
    expect(loadedImages.value).toEqual(
      new Set(["asset://localhost/a/img.png", "asset://localhost/b/img.png"]),
    );
    expect(imagesLoaded.value).toBe(2);
  });

  it("loads a relative image once the document has a folder", () => {
    expect(loadedImage("img.png", null)).toBeNull();
    expect(requested).toEqual([]);
    // saved as, say
    loadedImage("img.png", "/x/doc.md");
    expect(requested.map((image) => image.src)).toEqual([
      "asset://localhost/x/img.png",
    ]);
  });

  it("tries an image that failed again once asked to", () => {
    loadedImage("gone.png", "/x/doc.md");
    requested[0].onerror?.();
    loadedImage("gone.png", "/x/doc.md");
    expect(requested).toHaveLength(1);

    forgetFailures();
    loadedImage("gone.png", "/x/doc.md");
    expect(requested).toHaveLength(2);
  });

  it("loads each image once", () => {
    loadedImage("data:image/png;base64,AAAA", null);
    loadedImage("data:image/png;base64,AAAA", null);
    expect(requested).toHaveLength(1);
    requested[0].load(4, 4);
    expect(loadedImage("data:image/png;base64,AAAA", null)?.width).toBe(4);
  });

  it("fits an image into the room for the text", () => {
    expect(fittedSize({ width: 2000, height: 1000 }, room)).toEqual({
      width: 450,
      height: 225,
    });
    expect(fittedSize({ width: 40, height: 20 }, room)).toEqual({
      width: 30,
      height: 15,
    });
  });
});
