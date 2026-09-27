import globals from "globals";
import pluginJs from "@eslint/js";
import pluginVue from "eslint-plugin-vue";
import { vueTsConfigs, withVueTs } from "@vue/eslint-config-typescript";
import prettier from "eslint-config-prettier/flat";

export default withVueTs(
  { files: ["**/*.{js,mjs,cjs,ts,vue}"] },
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  pluginJs.configs.recommended,
  pluginVue.configs["flat/recommended"],
  vueTsConfigs.recommended,
  {
    // Blank's schema has tables and keeps the frontmatter, and node types of
    // two schemas can't be mixed: use src/markdown instead
    files: ["src/**/*.{ts,vue}", "scripts/**/*.ts"],
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
  // Prettier formats everything, so no layout rules
  prettier,
);
