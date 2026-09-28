import { computed } from "vue";

// config is state too, a shallowRef next to its loader, see state.md
import { config } from "../config";
import { type DocumentFields, fieldsOf, sameFields } from "../layout/bands";
import { resolveLayout } from "../layout/resolve";
import { firstHeading, readProperties } from "../markdown";
import { path, transaction } from "./document";

// the frontmatter of the document, which only notifies when it changes,
// not on every key typed
export const frontmatter = computed(
  () => (transaction.value?.doc.attrs.frontmatter ?? null) as string | null,
);

// the page setup of the document over the user's defaults, with what of it
// can't be used; resolved again only when the frontmatter or the config
// changes
export const pageLayout = computed(() =>
  resolveLayout(frontmatter.value, config.value.layout.page),
);

// the title and author of the frontmatter, read again only when it changes
const properties = computed(() => readProperties(frontmatter.value));

// what the placeholders of headers and footers show for the document. The
// first heading is only looked for, on every transaction, while there is no
// title; the same values keep the same object, so watchers stay quiet.
export const pageFields = computed<DocumentFields>((previous) => {
  const next = fieldsOf(
    properties.value,
    () => (transaction.value ? firstHeading(transaction.value.doc) : ""),
    path.value,
  );
  return previous && sameFields(previous, next) ? previous : next;
});
