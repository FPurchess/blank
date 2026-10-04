import { compileAsync } from "sass-embedded";

/**
 * compileMain compiles src/scss/main.scss as the app loads it, compressed,
 * for the tests that check what the CSS says
 */
export const compileMain = async () =>
  (
    await compileAsync("src/scss/main.scss", {
      loadPaths: ["src/scss"],
      style: "compressed",
    })
  ).css;
