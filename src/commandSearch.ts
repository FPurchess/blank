import { type CommandInfo, commands } from "./commandList";
import type { CommandIdentifier } from "./config";

// Searching Blank's commands by their words in the command list: the
// settings' list of shortcuts filters them, the main menu's search ranks
// them. See .claude/rules/main-menu.md.

// how many commands the main menu's search shows at most
export const SEARCH_LIMIT = 12;

/**
 * queryWords returns the words of a search, in lower case
 */
const queryWords = (query: string) =>
  query.trim().toLowerCase().split(/\s+/).filter(Boolean);

// the words a command is found by: its label, its group and its aliases
const searchText = (info: CommandInfo) =>
  [info.label, info.group, ...info.aliases].join(" ").toLowerCase();

/**
 * matchCommands returns the commands of `list` whose label, group or aliases
 * contain every word of `query`, in the order of the list
 */
export const matchCommands = (
  query: string,
  list: readonly CommandInfo[] = commands,
): readonly CommandInfo[] => {
  const words = queryWords(query);
  if (words.length === 0) return list;
  return list.filter((info) => {
    const text = searchText(info);
    return words.every((word) => text.includes(word));
  });
};

// a command a search found, and the part of its label that matched, to mark
export interface RankedCommand {
  info: CommandInfo;
  match: [from: number, to: number] | null;
}

// what ends a word in a label, e.g. "Pages / page ends"
const WORD_BREAK = /[\s/-]/;

/**
 * rankOf returns how well `label` matches `query`, the best first, and
 * where: its start, the start of one of its words, anywhere in it, or (3)
 * only in its group or aliases
 */
const rankOf = (label: string, query: string) => {
  const lower = label.toLowerCase();
  if (lower.startsWith(query)) return { rank: 0, at: 0 };
  const inside = lower.indexOf(query);
  if (inside < 0) return { rank: 3, at: -1 };
  // the first place a word starts with it, after a space, "/" or "-"
  for (let at = inside; at >= 0; at = lower.indexOf(query, at + 1)) {
    if (WORD_BREAK.test(lower[at - 1])) return { rank: 1, at };
  }
  return { rank: 2, at: inside };
};

/**
 * rankCommands returns the commands that match `query` (see matchCommands),
 * at most SEARCH_LIMIT, the best first: those whose label starts with it,
 * then one of whose words does, then whose label contains it, then those
 * only an alias or the group matches. Within each, the commands used more
 * recently come first, and then the command list's order.
 * @param recent the commands used last, newest first
 * @param exclude commands the search never offers
 */
export const rankCommands = (
  query: string,
  recent: readonly CommandIdentifier[],
  exclude: ReadonlySet<CommandIdentifier> = new Set(),
): RankedCommand[] => {
  const wanted = queryWords(query).join(" ");
  if (!wanted) return [];
  const recency = (id: CommandIdentifier) => {
    const index = recent.indexOf(id);
    return index < 0 ? recent.length : index;
  };
  return matchCommands(query)
    .filter((info) => !exclude.has(info.id))
    .map((info, order) => {
      const { rank, at } = rankOf(info.label, wanted);
      return { info, rank, at, order, recency: recency(info.id) };
    })
    .sort(
      (a, b) => a.rank - b.rank || a.recency - b.recency || a.order - b.order,
    )
    .slice(0, SEARCH_LIMIT)
    .map(({ info, at }) => ({
      info,
      match: at >= 0 ? [at, at + wanted.length] : null,
    }));
};
