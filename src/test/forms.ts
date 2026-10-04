import type { Node } from "prosemirror-model";

import {
  checkDefinition,
  type Definition,
  definitionKey,
  schema,
} from "../markdown";

// The definitions the tests of forms place, and their keys.

// a recipe of every kind of field
export const RECIPE = checkDefinition({
  id: "blank/recipe",
  version: 1,
  name: "Recipe",
  fields: [
    { name: "title", kind: "text", style: "h1", label: "Title" },
    { name: "photo", kind: "image", label: "Photo" },
    {
      name: "ingredients",
      kind: "table",
      label: "Ingredients",
      columns: ["Amount", "Ingredient"],
    },
    { name: "steps", kind: "rich", label: "Steps" },
  ],
}) as Definition;
export const RECIPE_KEY = definitionKey(RECIPE);

// a recipe of a title and its steps, on a page of its own
export const SHORT_RECIPE = checkDefinition({
  id: "blank/recipe",
  version: 1,
  name: "Recipe",
  newPage: true,
  fields: [
    {
      name: "title",
      kind: "text",
      style: "h1",
      label: "Title",
      placeholder: "Recipe name",
    },
    { name: "steps", kind: "rich", label: "Steps" },
  ],
}) as Definition;
export const SHORT_KEY = definitionKey(SHORT_RECIPE);

/**
 * field returns a field of a form, holding `blocks`
 */
export const field = (name: string, ...blocks: Node[]) =>
  schema.node("form_field", { name }, blocks);

// a letter: its address in a frame, its details in another, and its text
// below them, on a page of its own
export const LETTER = checkDefinition({
  id: "blank/letter",
  version: 1,
  name: "Letter",
  newPage: true,
  flowTop: "100mm",
  fields: [
    { name: "sender", kind: "text", style: "small", label: "From" },
    { name: "address", kind: "rich", label: "Address" },
    { name: "date", kind: "text", label: "Date", placeholder: "The date" },
    { name: "body", kind: "rich", label: "Letter" },
  ],
  layout: [
    {
      frame: { x: "25mm", y: "58mm", width: "80mm" },
      field: "sender",
    },
    {
      frame: { x: "20mm", y: "45mm", width: "85mm", height: "45mm" },
      field: "address",
    },
    { frame: { x: "125mm", y: "50mm", width: "75mm" }, field: "date" },
    { field: "body" },
  ],
}) as Definition;
export const LETTER_KEY = definitionKey(LETTER);
