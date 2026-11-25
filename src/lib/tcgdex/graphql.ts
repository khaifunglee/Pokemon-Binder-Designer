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

/** Caps for untrusted API strings and lists (real data is far smaller). */
const MAX_ID = 64;
const MAX_TEXT = 200;
const MAX_TYPES = 10;
const MAX_DEX_IDS = 20;
const MAX_DEX_NUMBER = 5000;

const isString = (v: unknown, max: number = MAX_TEXT): v is string =>
  typeof v === 'string' && v.length <= max;

/** Shape guard for external input: the fields mapping relies on. */
export function isGqlCard(value: unknown): value is GqlCard {
  if (value == null || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  const set = c.set as Record<string, unknown> | null | undefined;
  return (
    isString(c.id, MAX_ID) &&
    isString(c.localId, MAX_ID) &&
    isString(c.name) &&
    isString(c.category, MAX_ID) &&
    set != null &&
    typeof set === 'object' &&
    isString(set.id, MAX_ID)
  );
}

const optionalText = (v: unknown): string | null => (isString(v) ? v : null);

/**
 * Normalise the optional fields of a card that passed isGqlCard: wrong
 * types or oversized values become null / [] rather than being stored
 * (a huge dexId list would overflow Math.min in the Pokédex sort).
 */
export function sanitizeGqlCard(card: GqlCard): GqlCard {
  const types = Array.isArray(card.types) && card.types.length <= MAX_TYPES
    ? card.types.filter((t): t is string => isString(t, MAX_ID))
    : [];
  const dexId = Array.isArray(card.dexId) && card.dexId.length <= MAX_DEX_IDS
    ? card.dexId.filter(
        (n): n is number => Number.isInteger(n) && n > 0 && n <= MAX_DEX_NUMBER,
      )
    : [];
  const flags = (card.variants ?? {}) as Record<string, unknown>;
  const flag = (k: string): boolean => flags[k] === true;
  const image = optionalText(card.image);
  return {
    id: card.id,
    localId: card.localId,
    name: card.name,
    category: card.category,
    set: { id: card.set.id },
    rarity: optionalText(card.rarity),
    illustrator: optionalText(card.illustrator),
    image: image != null && image.startsWith('https://') ? image : null,
    types,
    dexId,
    variants: {
      normal: flag('normal'),
      reverse: flag('reverse'),
      holo: flag('holo'),
      firstEdition: flag('firstEdition'),
    },
  };
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
    else if (entry.set.id === setId) cards.push(sanitizeGqlCard(entry));
  }
  return { cards, dropped };
}
