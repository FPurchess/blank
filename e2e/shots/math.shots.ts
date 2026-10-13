// the pictures of docs/guide/math.md (see shots.ts)
import { Key } from "../helpers.ts";
import { filmNew, finishShots, prepare, SHIFT } from "./shots.ts";

describe("docs shots: math", () => {
  before(() => prepare());
  after(() => finishShots());

  it("records typing math", async () => {
    const film = await filmNew();
    await film.type("The mean is $\\bar{x} = \\frac{1}{n}\\sum x_i$ ");
    await film.pause(0.8);
    await film.type("of all values, and $5 stays a price.");
    await film.enter(0.6);
    await film.type("$$");
    await film.press("Enter", Key.Enter, 0.6);
    await film.type("\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}");
    await film.pause(0.8);
    await film.press("Esc", Key.Escape, 1);
    await film.pause(2.5);
    film.save("math-typing.gif", 300 + SHIFT);
  });
});
