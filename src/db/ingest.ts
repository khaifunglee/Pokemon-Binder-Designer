import { eq, max, sql } from 'drizzle-orm';

import {
  fetchCardDetails,
  fetchSetBriefs,
  fetchSetDetail,
  fetchSetDetails,
  fetchSeriesSetIds,
} from '../lib/tcgdex/api';
import { POCKET_SERIES_ID, selectSetsToFetch } from '../lib/tcgdex/filter';
import { extractPrices, mapCardDetail, mapSetDetail } from '../lib/tcgdex/mappers';
import type { DexSetDetail } from '../lib/tcgdex/types';
import type { Db } from './client';
import { cardPrices, cards, sets } from './schema';
import type { SetInsert } from './schema';

// Stay well under SQLite's bound-variable limit per statement.
const CHUNK_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function upsertSets(db: Db, rows: SetInsert[]): Promise<void> {
  if (rows.length === 0) return;
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

/**
 * Refresh the sets catalog: cheap brief listing, then full details only
 * for sets we don't have yet (details carry release dates). Runs in the
 * background at launch; the UI never waits on it.
 *
 * TCG Pocket (digital-only) sets are excluded and never fetched. Their
 * ids come from one small series lookup on every sync (no cache); if it
 * fails, the whole sync stops rather than ingesting unfiltered.
 */
export async function ingestSets(db: Db): Promise<number> {
  const pocketIds = new Set(await fetchSeriesSetIds(POCKET_SERIES_ID));
  const briefs = await fetchSetBriefs();
  const known = new Set(
    (await db.select({ id: sets.id }).from(sets)).map((r) => r.id),
  );
  const missing = selectSetsToFetch(briefs, known, pocketIds);
  if (missing.length === 0) return 0;
  const details = (await fetchSetDetails(missing)).filter(
    (d) => d.serie?.id !== POCKET_SERIES_ID,
  );
  await upsertSets(db, details.map(mapSetDetail));
  return details.length;
}

export interface IngestProgress {
  (done: number, total: number): void;
}

async function upsertSetPayload(
  db: Db,
  detail: DexSetDetail,
  cardRows: ReturnType<typeof mapCardDetail>[],
  priceRows: { cardId: string; variant: string; marketUsd: number }[],
): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    for (const batch of chunk(cardRows, CHUNK_SIZE)) {
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
    for (const batch of chunk(
      priceRows.map((p) => ({ ...p, fetchedAt: now })),
      CHUNK_SIZE,
    )) {
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
    const setRow = mapSetDetail(detail);
    await tx
      .insert(sets)
      .values({ ...setRow, cardsIngestedAt: now })
      .onConflictDoUpdate({
        target: sets.id,
        set: {
          name: sql`excluded.name`,
          series: sql`excluded.series`,
          printedTotal: sql`excluded.printed_total`,
          total: sql`excluded.total`,
          releaseDate: sql`excluded.release_date`,
          ptcgoCode: sql`excluded.ptcgo_code`,
          symbolUri: sql`excluded.symbol_uri`,
          logoUri: sql`excluded.logo_uri`,
          cardsIngestedAt: sql`excluded.cards_ingested_at`,
        },
      });
  });
}

/**
 * Ensure a set's full card data (details + prices) is in SQLite. TCGdex
 * serves card details per card, so this issues one pooled request per
 * card — report progress via `onProgress`. No-op once ingested unless
 * forced; all-or-nothing on failure (offline keeps whatever is local).
 */
export async function ensureSetCards(
  db: Db,
  setId: string,
  opts: { force?: boolean; onProgress?: IngestProgress } = {},
): Promise<void> {
  if (!opts.force) {
    const [row] = await db
      .select({ ingestedAt: sets.cardsIngestedAt })
      .from(sets)
      .where(eq(sets.id, setId));
    if (row?.ingestedAt != null) return;
  }
  const detail = await fetchSetDetail(setId);
  const details = await fetchCardDetails(
    detail.cards.map((c) => c.id),
    opts.onProgress,
  );
  await upsertSetPayload(
    db,
    detail,
    details.map(mapCardDetail),
    details.flatMap((c) =>
      extractPrices(c).map((p) => ({ cardId: c.id, ...p })),
    ),
  );
}

export const PRICE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Re-fetch a set (cards + prices arrive together) when its prices are
 * older than the TTL. Returns true when refreshed.
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
  await ensureSetCards(db, setId, { force: true });
  return true;
}

/** Sets whose card data has been fully ingested. */
export async function listIngestedSetIds(db: Db): Promise<string[]> {
  const rows = await db
    .select({ id: sets.id })
    .from(sets)
    .where(sql`${sets.cardsIngestedAt} IS NOT NULL`);
  return rows.map((r) => r.id);
}
