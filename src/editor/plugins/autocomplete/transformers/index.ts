import type { BlockTransformer } from "../types";

import blockquote from "./blockquote";
import bullet_list from "./bullet_list";
import code_block from "./code_block";
import heading from "./heading";
import horizontal_rule from "./horizontal_rule";
import ordered_list from "./ordered_list";

// block shortcuts; the first one that matches and applies wins
const transformers: { [key: string]: BlockTransformer<any> } = {
  heading,
  blockquote,
  bullet_list,
  ordered_list,
  horizontal_rule,
  code_block,
};

export default transformers;
