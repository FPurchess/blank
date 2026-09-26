import { describe, expect, it } from "vitest";

import { fitBox } from "./fit";

describe("images.fitBox", () => {
  it("keeps sizes that fit", () => {
    expect(fitBox({ width: 100, height: 50 }, 200, 200)).toEqual({
      width: 100,
      height: 50,
    });
  });

  it("scales down to the width, keeping the aspect ratio", () => {
    expect(fitBox({ width: 400, height: 200 }, 200, 1000)).toEqual({
      width: 200,
      height: 100,
    });
  });

  it("scales down to the height, keeping the aspect ratio", () => {
    expect(fitBox({ width: 100, height: 400 }, 1000, 200)).toEqual({
      width: 50,
      height: 200,
    });
  });
});
