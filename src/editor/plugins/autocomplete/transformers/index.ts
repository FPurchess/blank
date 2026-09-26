import type { BlockTransformer } from "../types";

import blockquote from "./blockquote";
import bullet_list from "./bullet_list";
import code_block from "./code_block";
import heading from "./heading";
import horizontal_rule from "./horizontal_rule";
import ordered_list from "./ordered_list";

// block shortcuts; the first one that matches and applies wins. Their props
// types differ, but each `transform` only gets its own `activate` result
const transformers = {
  heading,
  blockquote,
  bullet_list,
  ordered_list,
  horizontal_rule,
  code_block,
} as Record<string, BlockTransformer<unknown>>;

export default transformers;
