/**
 * Card-name search normalization for SQLite LIKE queries. Kept pure;
 * the DB layer wraps the result in drizzle's like().
 */

/** Collapse whitespace; empty result means "no name filter". */
export function normalizeQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/** Escape LIKE wildcards in user input (paired with ESCAPE '\'). */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** Substring-match pattern for a user query, or null for no filter. */
export function likePattern(raw: string): string | null {
  const normalized = normalizeQuery(raw);
  if (normalized === '') return null;
  return `%${escapeLike(normalized)}%`;
}
