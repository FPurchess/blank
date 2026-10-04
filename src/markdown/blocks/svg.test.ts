import { describe, expect, it } from "vitest";

import { sanitizeSvg } from "./svg";

const svg = (body: string, attrs = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10"${attrs}>${body}</svg>`;

describe("sanitizeSvg", () => {
  it("keeps what draws", () => {
    const drawing = svg(
      '<g fill="red"><rect width="4" height="4"/><text x="1" y="8">Hi</text></g><use href="#a"/>',
    );
    const kept = sanitizeSvg(drawing)!;
    expect(kept).toContain("<rect");
    expect(kept).toContain(">Hi</text>");
    expect(kept).toContain('href="#a"');
  });

  it.each([
    ["a script", svg("<script>alert(1)</script>"), "script"],
    [
      "foreignObject",
      svg(
        '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>',
      ),
      "foreignObject",
    ],
    ["an event handler", svg('<rect onclick="alert(1)"/>'), "onclick"],
    ["an event handler on the root", svg("", ' onload="alert(1)"'), "onload"],
    [
      "a link away",
      svg('<use xlink:href="https://example.com/x.svg#a"/>'),
      "example.com",
    ],
    [
      "a picture from the web",
      svg('<image href="https://example.com/a.png"/>'),
      "example.com",
    ],
    [
      "an import",
      svg(
        "<style>@import url(https://example.com/a.css); rect{fill:red}</style>",
      ),
      "example.com",
    ],
    [
      "a url() away",
      svg('<rect style="fill:url(https://example.com/a)"/>'),
      "example.com",
    ],
    [
      "a fill away",
      svg('<rect fill="url(https://example.com/a#g)"/>'),
      "example.com",
    ],
  ])("takes out %s", (_, drawing, gone) => {
    const kept = sanitizeSvg(drawing);
    expect(kept).not.toBeNull();
    expect(kept).not.toContain(gone);
  });

  it("keeps embedded pictures and the drawing's own links", () => {
    const picture = "data:image/png;base64,AAAA";
    const kept = sanitizeSvg(
      svg(`<image href="${picture}"/><rect style="fill:url(#g)"/>`),
    )!;
    expect(kept).toContain(picture);
    expect(kept).toContain("url(#g)");
  });

  it.each([
    ["HTML", "<div>no</div>"],
    ["broken XML", "<svg xmlns='http://www.w3.org/2000/svg'><g></svg>"],
    ["too much", svg("<g/>".repeat(600_000))],
  ])("refuses %s", (_, text) => {
    expect(sanitizeSvg(text)).toBeNull();
  });
});
