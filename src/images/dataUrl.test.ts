import { describe, expect, it } from "vitest";

import { IMAGES, bytesOf, dataUrl } from "../test/images";
import { fromDataUrl, toDataUrl } from "./dataUrl";

describe("images.dataUrl", () => {
  it("encodes bytes as a base64 data URL", async () => {
    expect(await toDataUrl(bytesOf(IMAGES.png), "image/png")).toBe(
      dataUrl("image/png", IMAGES.png),
    );
  });

  it("decodes a base64 data URL", () => {
    expect(fromDataUrl(dataUrl("image/PNG", IMAGES.png))).toEqual({
      bytes: bytesOf(IMAGES.png),
      mime: "image/png",
    });
  });

  it("decodes a percent-encoded data URL", () => {
    expect(fromDataUrl("data:image/svg+xml,%3Csvg%3E")).toEqual({
      bytes: new TextEncoder().encode("<svg>"),
      mime: "image/svg+xml",
    });
  });

  it.each(["https://example.com", "data:image/png;base64,***"])(
    "rejects %j",
    (url) => {
      expect(fromDataUrl(url)).toBeNull();
    },
  );
});
