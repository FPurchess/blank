import { describe, expect, it } from "vitest";

import { dateChoiceOf, settingsOf, today } from "./signaturePopoverModel";

const fields = {
  role: " Tenant ",
  name: "",
  place: "Berlin ",
  date: "signing" as const,
  fixed: "",
  width: "",
};

describe("a signature block's settings", () => {
  it("trim what is typed and leave the width to the default", () => {
    expect(settingsOf(fields)).toEqual({
      role: "Tenant",
      name: "",
      place: "Berlin",
      date: "signing",
      width: null,
    });
  });

  it("keep a fixed date, or take today for one that isn't a date", () => {
    expect(
      settingsOf({ ...fields, date: "fixed", fixed: "2026-01-02" }).date,
    ).toBe("2026-01-02");
    expect(settingsOf({ ...fields, date: "fixed", fixed: "soon" }).date).toBe(
      today(),
    );
  });

  it("tell a fixed date from the others", () => {
    expect(dateChoiceOf("none")).toBe("none");
    expect(dateChoiceOf("2026-01-02")).toBe("fixed");
    expect(today(new Date(2026, 0, 2))).toBe("2026-01-02");
  });
});
