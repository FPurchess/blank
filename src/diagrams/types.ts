// What a diagram is called, from the keyword its source starts with: the
// description it has where none is given, for screen readers, the PDF and
// Word, and what stands for it while it's drawn.

const NAMES: [RegExp, string][] = [
  [/^(?:flowchart|graph)\b/, "Flowchart"],
  [/^sequenceDiagram\b/, "Sequence diagram"],
  [/^gantt\b/, "Gantt chart"],
  [/^classDiagram(?:-v2)?\b/, "Class diagram"],
  [/^erDiagram\b/, "Entity relationship diagram"],
  [/^stateDiagram(?:-v2)?\b/, "State diagram"],
  [/^mindmap\b/, "Mind map"],
  [/^timeline\b/, "Timeline"],
  [/^journey\b/, "User journey"],
  [/^pie\b/, "Pie chart"],
  [/^gitGraph\b/, "Git graph"],
  [/^quadrantChart\b/, "Quadrant chart"],
  [/^xychart(?:-beta)?\b/, "Chart"],
  [/^requirementDiagram\b/, "Requirement diagram"],
  [/^C4\w*\b/, "C4 diagram"],
  [/^sankey(?:-beta)?\b/, "Sankey diagram"],
  [/^block(?:-beta)?\b/, "Block diagram"],
  [/^architecture(?:-beta)?\b/, "Architecture diagram"],
  [/^kanban\b/, "Kanban board"],
];

/**
 * diagramType returns what the diagram of `source` is called, e.g.
 * "Flowchart", or "Diagram" for a kind it doesn't know
 */
export const diagramType = (source: string): string => {
  const lines = source.split("\n");
  let index = 0;
  // front matter (`---` … `---`) and directives (`%%{init: …}%%`) and
  // comments come before the keyword
  if (lines[0]?.trim() === "---") {
    index = lines.findIndex((line, at) => at > 0 && line.trim() === "---") + 1;
  }
  for (; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line || line.startsWith("%%")) continue;
    return NAMES.find(([pattern]) => pattern.test(line))?.[1] ?? "Diagram";
  }
  return "Diagram";
};
