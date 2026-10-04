import { path } from "@tauri-apps/api";
import { exists, readDir, readTextFile } from "@tauri-apps/plugin-fs";

import { type Definition, readDefinition } from "../markdown";
import recipe from "./recipe.yaml?raw";

// The forms the blocks pane offers, each from its form definition: Blank's
// own (blank/…), and the user's YAML files in the folder `forms` of the app
// config folder (user/…, named after the file). They are read whenever the
// pane opens, so a form that was just written shows up right away.

export interface Form {
  id: string;
  // the definition, or what is wrong with the file
  definition: Definition | string;
}

const BUILT_IN: Record<string, string> = { recipe };

/**
 * formsDir returns the folder of the user's forms
 */
export const formsDir = async () =>
  await path.join(await path.appConfigDir(), "forms");

/**
 * idOf returns the id of a user's form file, or null for a file that
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
 * userForms reads the user's forms; none if the folder isn't there
 */
const userForms = async (): Promise<Form[]> => {
  try {
    const dir = await formsDir();
    if (!(await exists(dir))) return [];
    const entries = await readDir(dir);
    const forms: Form[] = [];
    for (const entry of entries) {
      const id = entry.isFile ? idOf(entry.name) : null;
      if (!id) continue;
      try {
        const yaml = await readTextFile(await path.join(dir, entry.name));
        forms.push({ id, definition: readDefinition(yaml, id) });
      } catch (error) {
        forms.push({ id, definition: `it can't be read: ${error}` });
      }
    }
    // two files of one name in other letters, like Recipe.yml and
    // recipe.yaml, would be one id
    const seen = new Set<string>();
    return forms
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((form) => {
        if (!seen.has(form.id)) {
          seen.add(form.id);
          return form;
        }
        const definition = `another file of the forms folder has the name ${form.id.slice("user/".length)}`;
        return { ...form, definition };
      });
  } catch (error) {
    console.warn("failed to read the forms", error);
    return [];
  }
};

/**
 * loadForms returns Blank's forms, then the user's
 */
export const loadForms = async (): Promise<Form[]> => [
  ...Object.entries(BUILT_IN).map(([name, yaml]) => {
    const id = `blank/${name}`;
    return { id, definition: readDefinition(yaml, id) };
  }),
  ...(await userForms()),
];
