// What Mermaid uses of JavaScript newer than the oldest WebKit Blank runs on
// (macOS 12's), filled in where it's missing; loaded with Mermaid only. The
// build lowers new syntax by itself, but not new functions: of those, the
// parser of Mermaid's newer diagrams (pie, git graph, architecture, …) calls
// Object.groupBy, which came with Safari 17.4. Check a Mermaid update with
// `bun run build` and a search of dist/assets for what came after 15.4.

const objects = Object as unknown as Record<string, unknown>;
objects.groupBy ??= <T>(
  items: Iterable<T>,
  key: (item: T, index: number) => PropertyKey,
) => {
  const groups: Record<PropertyKey, T[]> = Object.create(null);
  let index = 0;
  for (const item of items) (groups[key(item, index++)] ??= []).push(item);
  return groups;
};

export {};
