import { describe, expect, it } from "vitest";

import { parseTimestampServer } from "./signingModel";

describe("Settings ▸ Signing", () => {
  it("takes a timestamp server's web address, or none", () => {
    expect(parseTimestampServer(" http://timestamp.digicert.com ")).toEqual({
      url: "http://timestamp.digicert.com",
    });
    expect(parseTimestampServer("")).toEqual({ url: "" });
    expect(parseTimestampServer("ftp://example.org")).toHaveProperty("error");
    expect(parseTimestampServer("timestamp")).toHaveProperty("error");
  });
});
