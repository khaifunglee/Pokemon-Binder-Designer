import { and, asc, eq, like, sql } from 'drizzle-orm';

import { likePattern } from '../lib/search';
import type { Db } from './client';
import { cards, sets } from './schema';
import type { CardRow } from './schema';

/**
 * Hides sets that synced with no cards: TCGdex lists a few (e.g. Jumbo
 * cards) that have no card data at all. Sets not downloaded yet stay.
 */
export const browsableSet = sql`NOT (${sets.cardsIngestedAt} IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM ${cards} WHERE ${cards.setId} = ${sets.id}))`;


/**
 * Card numbers are text ("025a", "TG12"); numeric-first ordering matches
 * the printed set order far better than plain lexicographic.
 */
const numberOrder = [
  asc(sql`CAST(${cards.number} AS INTEGER)`),
  asc(cards.number),
];

export async function listSetCards(db: Db, setId: string): Promise<CardRow[]> {
  return db
    .select()
    .from(cards)
    .where(eq(cards.setId, setId))
    .orderBy(...numberOrder);
}

export interface CardSearchFilter {
  name?: string;
  setId?: string;
  limit?: number;
  offset?: number;
}

/** Searches ingested cards only (offline-first: no network fallback). */
export async function searchCards(
  db: Db,
  filter: CardSearchFilter,
): Promise<CardRow[]> {
  const conds = [];
  const pattern = likePattern(filter.name ?? '');
  if (pattern !== null) {
    conds.push(sql`${like(cards.name, pattern)} ESCAPE '\\'`);
  }
  if (filter.setId) conds.push(eq(cards.setId, filter.setId));

  return db
    .select()
    .from(cards)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(cards.name), ...numberOrder)
    .limit(filter.limit ?? 100)
    .offset(filter.offset ?? 0);
}

export async function getCard(db: Db, cardId: string): Promise<CardRow | null> {
  const [card] = await db.select().from(cards).where(eq(cards.id, cardId));
  return card ?? null;
}
