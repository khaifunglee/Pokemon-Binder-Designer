import { eq, isNotNull, max, sql } from 'drizzle-orm';

import { fetchAllSets, fetchCardsBySet } from '../lib/tcg/api';
import { extractPrices, mapApiCard, mapApiSet } from '../lib/tcg/mappers';
import type { ApiCard, ApiSet } from '../lib/tcg/types';
import type { Db } from './client';
import { cardPrices, cards, sets } from './schema';

// Stay well under SQLite's bound-variable limit per statement.
const CHUNK_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function upsertSets(db: Db, apiSets: ApiSet[]): Promise<void> {
  const rows = apiSets.map(mapApiSet);
  await db.transaction(async (tx) => {
    for (const batch of chunk(rows, CHUNK_SIZE)) {
      await tx
        .insert(sets)
        .values(batch)
        .onConflictDoUpdate({
          target: sets.id,
          // cardsIngestedAt deliberately preserved on refresh.
          set: {
            name: sql`excluded.name`,
            series: sql`excluded.series`,
            printedTotal: sql`excluded.printed_total`,
            total: sql`excluded.total`,
            releaseDate: sql`excluded.release_date`,
            ptcgoCode: sql`excluded.ptcgo_code`,
            symbolUri: sql`excluded.symbol_uri`,
            logoUri: sql`excluded.logo_uri`,
          },
        });
    }
  });
}

export async function upsertSetCards(
  db: Db,
  setId: string,
  apiCards: ApiCard[],
): Promise<void> {
  const rows = apiCards.map(mapApiCard);
  await db.transaction(async (tx) => {
    for (const batch of chunk(rows, CHUNK_SIZE)) {
      await tx
        .insert(cards)
        .values(batch)
        .onConflictDoUpdate({
          target: cards.id,
          set: {
            name: sql`excluded.name`,
            setId: sql`excluded.set_id`,
            number: sql`excluded.number`,
            rarity: sql`excluded.rarity`,
            supertype: sql`excluded.supertype`,
            types: sql`excluded.types`,
            nationalPokedexNumbers: sql`excluded.national_pokedex_numbers`,
            imageSmallUri: sql`excluded.image_small_uri`,
            imageLargeUri: sql`excluded.image_large_uri`,
            variants: sql`excluded.variants`,
          },
        });
    }
    // Prices ride along in the same payload; keep card_prices current.
    const now = new Date();
    const priceRows = apiCards.flatMap((c) =>
      extractPrices(c).map((p) => ({
        cardId: c.id,
        variant: p.variant,
        marketUsd: p.marketUsd,
        fetchedAt: now,
      })),
    );
    for (const batch of chunk(priceRows, CHUNK_SIZE)) {
      await tx
        .insert(cardPrices)
        .values(batch)
        .onConflictDoUpdate({
          target: [cardPrices.cardId, cardPrices.variant],
          set: {
            marketUsd: sql`excluded.market_usd`,
            fetchedAt: sql`excluded.fetched_at`,
          },
        });
    }
    await tx
      .update(sets)
      .set({ cardsIngestedAt: new Date() })
      .where(eq(sets.id, setId));
  });
}

export const PRICE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Re-fetch a set (cards + prices) when its prices are older than the TTL.
 * Offline failures propagate — callers show stale data regardless, so
 * they typically fire-and-forget this. Returns true when refreshed.
 */
export async function refreshSetPrices(
  db: Db,
  setId: string,
  ttlMs: number = PRICE_TTL_MS,
): Promise<boolean> {
  const [row] = await db
    .select({ newest: max(cardPrices.fetchedAt) })
    .from(cardPrices)
    .innerJoin(cards, eq(cardPrices.cardId, cards.id))
    .where(eq(cards.setId, setId));
  if (row?.newest != null && Date.now() - row.newest.getTime() < ttlMs) {
    return false;
  }
  const apiCards = await fetchCardsBySet(setId);
  await upsertSetCards(db, setId, apiCards);
  return true;
}

/**
 * Refresh the sets catalog from the network. Cheap (~160 rows); intended to
 * run in the background at launch. Failures are the caller's concern — the
 * UI must keep working from whatever is already in SQLite.
 */
export async function ingestSets(db: Db): Promise<number> {
  const apiSets = await fetchAllSets();
  await upsertSets(db, apiSets);
  return apiSets.length;
}

/**
 * Ensure a set's cards are in SQLite, fetching them once on demand.
 * No-op when already ingested (offline-safe) unless `force` is set.
 */
export async function ensureSetCards(
  db: Db,
  setId: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  if (!opts.force) {
    const [row] = await db
      .select({ ingestedAt: sets.cardsIngestedAt })
      .from(sets)
      .where(eq(sets.id, setId));
    if (row?.ingestedAt != null) return;
  }
  const apiCards = await fetchCardsBySet(setId);
  await upsertSetCards(db, setId, apiCards);
}

export async function listIngestedSetIds(db: Db): Promise<string[]> {
  const rows = await db
    .select({ id: sets.id })
    .from(sets)
    .where(isNotNull(sets.cardsIngestedAt));
  return rows.map((r) => r.id);
}
