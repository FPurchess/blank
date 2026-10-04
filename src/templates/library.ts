import { path } from "@tauri-apps/api";
import { exists, readDir, readTextFile } from "@tauri-apps/plugin-fs";

import { type Definition, readDefinition } from "../markdown";
import recipe from "./recipe.yaml?raw";

// The templates forms are placed from: Blank's own (blank/…), and the user's
// YAML files in the folder `templates` of the app config folder (user/…,
// named after the file). They are read whenever the block picker opens, so
// a template that was just written shows up right away.

export interface Template {
  id: string;
  // the definition, or what is wrong with the file
  definition: Definition | string;
}

const BUILT_IN: Record<string, string> = { recipe };

/**
 * templatesDir returns the folder of the user's templates
 */
export const templatesDir = async () =>
  await path.join(await path.appConfigDir(), "templates");

/**
 * idOf returns the id of a user's template file, or null for a file that
 * isn't one: `user/` and its name, in the letters an id has
 */
const idOf = (file: string) => {
  const match = /^(.+)\.ya?ml$/i.exec(file);
  if (!match) return null;
  const name = match[1]
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return name ? `user/${name}` : null;
};

/**
 * userTemplates reads the user's templates; none if the folder isn't there
 */
const userTemplates = async (): Promise<Template[]> => {
  try {
    const dir = await templatesDir();
    if (!(await exists(dir))) return [];
    const entries = await readDir(dir);
    const templates: Template[] = [];
    for (const entry of entries) {
      const id = entry.isFile ? idOf(entry.name) : null;
      if (!id) continue;
      try {
        const yaml = await readTextFile(await path.join(dir, entry.name));
        templates.push({ id, definition: readDefinition(yaml, id) });
      } catch (error) {
        templates.push({ id, definition: `it can't be read: ${error}` });
      }
    }
    // two files of one name in other letters, like Recipe.yml and
    // recipe.yaml, would be one id
    const seen = new Set<string>();
    return templates
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((template) => {
        if (!seen.has(template.id)) {
          seen.add(template.id);
          return template;
        }
        const definition = `another file of the templates folder has the name ${template.id.slice("user/".length)}`;
        return { ...template, definition };
      });
  } catch (error) {
    console.warn("failed to read the templates", error);
    return [];
  }
};

/**
 * loadTemplates returns Blank's templates, then the user's
 */
export const loadTemplates = async (): Promise<Template[]> => [
  ...Object.entries(BUILT_IN).map(([name, yaml]) => {
    const id = `blank/${name}`;
    return { id, definition: readDefinition(yaml, id) };
  }),
  ...(await userTemplates()),
];
