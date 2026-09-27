import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";

/** @type {import('eslint').Linter.Config[]} */
export default [
  { files: ["**/*.{js,mjs,cjs,ts}"] },
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Blank's schema has tables and keeps the frontmatter, and node types of
    // two schemas can't be mixed: use src/markdown instead
    files: ["src/**/*.ts", "scripts/**/*.ts"],
    ignores: ["src/markdown/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "prosemirror-markdown",
              importNames: [
                "schema",
                "defaultMarkdownParser",
                "defaultMarkdownSerializer",
              ],
              message: "Import Blank's markdown from src/markdown instead.",
            },
          ],
        },
      ],
    },
  },
];
