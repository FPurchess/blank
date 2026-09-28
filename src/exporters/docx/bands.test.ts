import { describe, expect, it } from "vitest";

import { datePicture } from "./bands";

describe("datePicture", () => {
  it("writes the long date of the region as Word's picture", () => {
    expect(datePicture("de-DE")).toBe("d. MMMM yyyy");
    expect(datePicture("en-US")).toBe("MMMM d, yyyy");
    expect(datePicture("en-GB")).toBe("d MMMM yyyy");
  });

  it("quotes words between the parts", () => {
    expect(datePicture("es-ES")).toBe("d' de 'MMMM' de 'yyyy");
  });
});
