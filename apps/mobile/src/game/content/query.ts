import { ContentBundle, ContentItem, ContentQuery } from "./types";

/** Approved items matching a query (type + optional category filter). */
export function selectItems(bundle: ContentBundle, q: Omit<ContentQuery, "min">): ContentItem[] {
  const types = new Set(q.types);
  const cats = q.categories?.length ? new Set(q.categories) : null;
  return bundle.items.filter(
    (i) => i.status === "approved" && types.has(i.type) && (!cats || i.categories.some((c) => cats.has(c))),
  );
}

/** First unmet query, or null when the bundle can start a session. */
export function missingContent(bundle: ContentBundle, queries: ContentQuery[]): ContentQuery | null {
  for (const q of queries) if (selectItems(bundle, q).length < q.min) return q;
  return null;
}
