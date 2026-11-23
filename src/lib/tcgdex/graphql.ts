import { SET_CARDS_QUERY } from './queries';
import type { GqlCard } from './types';

export const GRAPHQL_URL = 'https://api.tcgdex.net/v2/graphql';

const TIMEOUT_MS = 30_000;

interface GraphqlResponse<T> {
  data?: T | null;
  errors?: { message?: string }[];
}

/**
 * POST a GraphQL query. GraphQL reports failures with HTTP 200 and an
 * `errors` array, so both the status and the body are checked.
 */
export async function postGraphql<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`TCGdex GraphQL failed: ${res.status}`);
    const body = (await res.json()) as GraphqlResponse<T> | null;
    if (body?.errors && body.errors.length > 0) {
      throw new Error(`TCGdex GraphQL error: ${body.errors[0]?.message ?? 'unknown'}`);
    }
    if (body?.data == null) throw new Error('TCGdex GraphQL returned no data');
    return body.data;
  } finally {
    clearTimeout(timer);
  }
}

const isString = (v: unknown): v is string => typeof v === 'string';

/** Shape guard for external input: the fields mapping relies on. */
export function isGqlCard(value: unknown): value is GqlCard {
  if (value == null || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  const set = c.set as Record<string, unknown> | null | undefined;
  return (
    isString(c.id) &&
    isString(c.localId) &&
    isString(c.name) &&
    isString(c.category) &&
    set != null &&
    typeof set === 'object' &&
    isString(set.id)
  );
}

/** A set's cards; malformed entries are counted, other sets' ignored. */
export async function fetchSetCards(
  setId: string,
): Promise<{ cards: GqlCard[]; dropped: number }> {
  const data = await postGraphql<{ cards?: unknown }>(SET_CARDS_QUERY, {
    prefix: `${setId}-`,
  });
  if (!Array.isArray(data.cards)) {
    throw new Error(`TCGdex GraphQL returned no cards list for ${setId}`);
  }
  const cards: GqlCard[] = [];
  let dropped = 0;
  for (const entry of data.cards) {
    if (!isGqlCard(entry)) dropped++;
    else if (entry.set.id === setId) cards.push(entry);
  }
  return { cards, dropped };
}
