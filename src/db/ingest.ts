import { eq, max, sql } from 'drizzle-orm';

import { logCatalogue } from '../lib/catalogueLog';
import {
  fetchCardDetails,
  fetchSetBriefs,
  fetchSetDetail,
  fetchSetDetails,
  fetchSeriesSetIds,
} from '../lib/tcgdex/api';
import { isKnownNonPocketSet, POCKET_SERIES_ID, selectSetsToFetch } from '../lib/tcgdex/filter';
import { deriveVariants, extractPrices, mapSetDetail } from '../lib/tcgdex/mappers';
import type { DexCardDetail } from '../lib/tcgdex/types';
import { mergeVariants, priceVariants } from '../lib/tcgdex/variants';
import type { Db } from './client';
import { cardPrices, cards, sets } from './schema';
import type { SetInsert } from './schema';
import { chunk, loadVariantSources } from './variantSources';

export async function upsertSets(db: Db, rows: SetInsert[]): Promise<void> {
  if (rows.length === 0) return;
  await db.transaction(async (tx) => {
    for (const batch of chunk(rows)) {
      await tx
        .insert(sets)
        .values(batch)
        .onConflictDoUpdate({
          target: sets.id,
          // cardsIngestedAt and the variant bookkeeping are preserved.
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
 * for sets we don't have yet (details carry release dates and the
 * TCGplayer set code GraphQL lacks). Card data comes from
 * catalogueSync.ts, only for sets this function let in.
 *
 * TCG Pocket (digital-only) sets are excluded and never fetched. Their
 * ids come from one small series lookup on every sync (no cache), run
 * alongside the set list. If either fails, the whole sync stops before
 * anything is stored, rather than ingesting unfiltered.
 */
export async function ingestSets(db: Db): Promise<number> {
  const [pocketSetIds, briefs] = await Promise.all([
    fetchSeriesSetIds(POCKET_SERIES_ID),
    fetchSetBriefs(),
  ]);
  const pocketIds = new Set(pocketSetIds);
  const known = new Set(
    (await db.select({ id: sets.id }).from(sets)).map((r) => r.id),
  );
  const missing = selectSetsToFetch(briefs, known, pocketIds);
  if (missing.length === 0) return 0;
  const details = (await fetchSetDetails(missing)).filter(isKnownNonPocketSet);
  await upsertSets(db, details.map(mapSetDetail));
  return details.length;
}

/**
 * Write what REST card details say about variants (TCGplayer price keys)
 * and, for the stats path only, their prices. Never touches card
 * metadata or the set's sync marker, so it can't regress GraphQL data.
 * Cards not in SQLite are skipped.
 */
export async function applyRestDetails(
  db: Db,
  details: DexCardDetail[],
  opts: { storePrices: boolean },
): Promise<void> {
  if (details.length === 0) return;
  const now = new Date();
  const unknownKeys = new Set<string>();
  await db.transaction(async (tx) => {
    const stored = await loadVariantSources(
      tx,
      details.map((d) => d.id),
    );
    const known = details.filter((d) => stored.has(d.id));
    for (const detail of known) {
      const sources = stored.get(detail.id)!;
      const flags = deriveVariants(detail);
      const prices = priceVariants(detail.pricing?.tcgplayer, (key) => unknownKeys.add(key));
      await tx
        .update(cards)
        .set({
          flagVariants: flags,
          priceVariants: prices,
          priceCheckedAt: now,
          variants: mergeVariants({
            flags,
            prices,
            manual: sources.manual,
            inUse: sources.inUse,
          }),
        })
        .where(eq(cards.id, detail.id));
    }
    if (!opts.storePrices) return;
    const priceRows = known.flatMap((c) =>
      extractPrices(c).map((p) => ({ cardId: c.id, ...p, fetchedAt: now })),
    );
    for (const batch of chunk(priceRows)) {
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
  });
  if (unknownKeys.size > 0) {
    logCatalogue(`unknown price keys: ${[...unknownKeys].sort().join(', ')}`);
  }
}

/** REST details for every card TCGdex lists in a set. */
export async function fetchSetCardDetails(
  setId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<DexCardDetail[]> {
  const detail = await fetchSetDetail(setId);
  return fetchCardDetails(
    detail.cards.map((c) => c.id),
    onProgress,
  );
}

export const PRICE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Re-fetch a set's prices (REST, per card) when they're older than the
 * TTL. Template stats only (D19). Returns true when refreshed.
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
  await applyRestDetails(db, await fetchSetCardDetails(setId), { storePrices: true });
  return true;
}

/** Sets whose card data has been synced. */
export async function listIngestedSetIds(db: Db): Promise<string[]> {
  const rows = await db
    .select({ id: sets.id })
    .from(sets)
    .where(sql`${sets.cardsIngestedAt} IS NOT NULL`);
  return rows.map((r) => r.id);
}
