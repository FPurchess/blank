import { DIAGRAM_LANG } from "../markdown/blocks/diagrams";
import { registerSource } from "../sources/registry";
import { renderDiagram } from "./render";
import { diagramType } from "./types";

/**
 * registerDiagrams makes diagrams a kind of source: Mermaid, loaded when the
 * first one is drawn
 */
export const registerDiagrams = () =>
  registerSource({
    node: "diagram",
    lang: DIAGRAM_LANG,
    label: diagramType,
    render: renderDiagram,
  });
