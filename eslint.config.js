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
    // Blank's schema has tables, and its parser and serializer read and write
    // them: use src/editor/schema.ts and src/editor/markdown/
    files: ["src/**/*.ts", "scripts/**/*.ts"],
    ignores: ["src/editor/schema.ts", "src/editor/markdown/**"],
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
              message:
                "Use the schema from src/editor/schema.ts and the parser and serializer from src/editor/markdown/.",
            },
          ],
        },
      ],
    },
  },
];
