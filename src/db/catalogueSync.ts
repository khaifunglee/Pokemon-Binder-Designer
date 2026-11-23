import { count, eq, inArray, isNull, sql } from 'drizzle-orm';

import { logCatalogue, warnCatalogue } from '../lib/catalogueLog';
import { fetchCardDetails, pooledSettled } from '../lib/tcgdex/api';
import { fetchSetCards } from '../lib/tcgdex/graphql';
import { mapGraphqlCard } from '../lib/tcgdex/mappers';
import {
  cardsDuePriceRecheck,
  isDue,
  isPlausibleSetPayload,
  RECHECK_INTERVAL_MS,
  setsNeedingTopUp,
  setsToRecheck,
  setsToSync,
  topUpsToReopen,
} from '../lib/tcgdex/syncPlan';
import { isPlaceholderFlagSet, mergeVariants } from '../lib/tcgdex/variants';
import { createThrottle } from '../lib/throttle';
import { useSyncStore } from '../state/syncStore';
import {
  CATALOGUE_ONBOARDED_KEY,
  CATALOGUE_RECHECKED_KEY,
  getSetting,
  setSetting,
} from './appSettings';
import type { Db } from './client';
import { applyRestDetails, fetchSetCardDetails, ingestSets } from './ingest';
import { cards, sets } from './schema';
import { chunk, loadVariantSources } from './variantSources';

/**
 * Catalogue sync (roadmap step 2, D18). Card data comes from TCGdex
 * GraphQL, one query per set, only for sets `ingestSets` let in (so TCG
 * Pocket stays out). Variants are corrected from REST price keys by a
 * background top-up. Every stage reports to useSyncStore and logs
 * `[catalogue]` lines. Card rows are upserted, never deleted, and user
 * tables are never written here.
 */

const GRAPHQL_CONCURRENCY = 4;
/** Unpriced cards re-checked per pooled REST batch. */
const UNPRICED_BATCH = 60;
const PROGRESS_INTERVAL_MS = 250;

const status = () => useSyncStore.getState();

async function loadSetRows(db: Db) {
  return db
    .select({
      id: sets.id,
      name: sets.name,
      total: sets.total,
      releaseDate: sets.releaseDate,
      cardsIngestedAt: sets.cardsIngestedAt,
      placeholderFlags: sets.placeholderFlags,
      variantsCheckedAt: sets.variantsCheckedAt,
    })
    .from(sets);
}

/**
 * Download one set's cards over GraphQL and write them in one
 * transaction, re-merging stored price/manual/in-use variants so a
 * re-sync never undoes the top-up or the user's own variants.
 */
export async function syncSetCards(
  db: Db,
  setId: string,
): Promise<{ cards: number; placeholderFlags: boolean }> {
  const [setRow] = await db
    .select({ total: sets.total })
    .from(sets)
    .where(eq(sets.id, setId));
  if (!setRow) throw new Error(`set ${setId} is not in the catalogue`);

  const { cards: payload, dropped } = await fetchSetCards(setId);
  if (!isPlausibleSetPayload(payload.length, setRow.total)) {
    throw new Error(`set ${setId} returned no cards`);
  }
  const rows = payload.map(mapGraphqlCard);
  const placeholderFlags = isPlaceholderFlagSet(rows.map((r) => r.flagVariants));
  const now = new Date();

  await db.transaction(async (tx) => {
    const stored = await loadVariantSources(
      tx,
      rows.map((r) => r.id),
    );
    const merged = rows.map((row) => {
      const sources = stored.get(row.id);
      return {
        ...row,
        variants: mergeVariants({
          flags: row.flagVariants,
          prices: sources?.prices ?? null,
          manual: sources?.manual ?? [],
          inUse: sources?.inUse ?? [],
        }),
      };
    });
    for (const batch of chunk(merged)) {
      await tx
        .insert(cards)
        .values(batch)
        .onConflictDoUpdate({
          target: cards.id,
          // price_variants, price_checked_at and manual_variants are not
          // GraphQL's to change.
          set: {
            name: sql`excluded.name`,
            setId: sql`excluded.set_id`,
            number: sql`excluded.number`,
            rarity: sql`excluded.rarity`,
            supertype: sql`excluded.supertype`,
            types: sql`excluded.types`,
            nationalPokedexNumbers: sql`excluded.national_pokedex_numbers`,
            illustrator: sql`excluded.illustrator`,
            imageSmallUri: sql`excluded.image_small_uri`,
            imageLargeUri: sql`excluded.image_large_uri`,
            flagVariants: sql`excluded.flag_variants`,
            variants: sql`excluded.variants`,
          },
        });
    }
    await tx
      .update(sets)
      .set({ placeholderFlags, cardsIngestedAt: now })
      .where(eq(sets.id, setId));
  });

  logCatalogue(`synced ${setId} (${rows.length} cards)`);
  if (dropped > 0) logCatalogue(`${setId}: dropped ${dropped} malformed cards`);
  return { cards: rows.length, placeholderFlags };
}

/** Sync many sets, 4 at a time; failures are returned, not thrown. */
async function syncSets(
  db: Db,
  setIds: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  const results = await pooledSettled(
    setIds,
    (id) => syncSetCards(db, id),
    GRAPHQL_CONCURRENCY,
    onProgress,
  );
  const failed: string[] = [];
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      failed.push(setIds[i]);
      warnCatalogue(`sync failed for ${setIds[i]}`, r.reason);
    }
  });
  return failed;
}

/**
 * Variant top-up for one set: REST details for every card, variants from
 * TCGplayer price keys. Prices are discarded (D19). All-or-nothing, so an
 * interrupted set is simply redone.
 */
export async function topUpSet(db: Db, setId: string): Promise<void> {
  const before = await db
    .select({ id: cards.id, variants: cards.variants })
    .from(cards)
    .where(eq(cards.setId, setId));
  const details = await fetchSetCardDetails(setId, (done, total) => {
    if (done % 10 === 0 || done === total) {
      logCatalogue(`variant top-up ${setId}: ${done}/${total} cards`);
    }
  });
  await applyRestDetails(db, details, { storePrices: false });
  await db.update(sets).set({ variantsCheckedAt: new Date() }).where(eq(sets.id, setId));

  const after = await db
    .select({ id: cards.id, variants: cards.variants })
    .from(cards)
    .where(eq(cards.setId, setId));
  const beforeById = new Map(before.map((c) => [c.id, c.variants]));
  const gained = new Map<string, number>();
  for (const card of after) {
    const old = beforeById.get(card.id) ?? [];
    for (const variant of card.variants) {
      if (!old.includes(variant)) gained.set(variant, (gained.get(variant) ?? 0) + 1);
    }
  }
  for (const [variant, n] of gained) logCatalogue(`${setId} +${variant} on ${n} cards`);
}

const isNetworkError = (e: unknown): boolean =>
  e instanceof TypeError || (e instanceof Error && e.name === 'AbortError');

/** Background: top up every placeholder-flag set not checked yet. */
export async function runVariantTopUp(db: Db): Promise<void> {
  const setRows = await loadSetRows(db);
  const due = setsNeedingTopUp(setRows);
  const names = new Map(setRows.map((s) => [s.id, s.name]));
  for (const [i, setId] of due.entries()) {
    status().setStatus({
      phase: 'topup',
      message: `Downloading per-card details for ${names.get(setId) ?? setId}… ${i + 1} of ${due.length} sets`,
      done: i,
      total: due.length,
    });
    try {
      await topUpSet(db, setId);
    } catch (e) {
      warnCatalogue(`variant top-up failed for ${setId}`, e);
      // Offline: stop here and resume at the next app start.
      if (isNetworkError(e)) break;
    }
  }
  if (status().phase === 'topup') status().setIdle();
}

export async function isOnboarded(db: Db): Promise<boolean> {
  return (await getSetting(db, CATALOGUE_ONBOARDED_KEY)) != null;
}

export async function markOnboarded(db: Db): Promise<void> {
  await setSetting(db, CATALOGUE_ONBOARDED_KEY, new Date().toISOString());
}

/**
 * First launch: set list (with the Pocket lookup), then every set's
 * cards. Throws when the set list can't be fetched (offline); individual
 * set failures are returned so the user can retry or continue. Resumes:
 * sets already synced are skipped.
 */
export async function runOnboarding(db: Db): Promise<{ failedSetIds: string[] }> {
  status().setStatus({
    phase: 'onboarding',
    message: 'Downloading one-time card database…',
    done: 0,
    total: 0,
    failedSetIds: [],
  });
  logCatalogue('listing sets (Pocket lookup + set list)');
  try {
    await ingestSets(db);
  } catch (e) {
    warnCatalogue('set listing failed', e);
    status().setStatus({
      phase: 'onboarding-error',
      message: "Couldn't download the card catalogue. Check your connection.",
    });
    throw e;
  }

  const toSync = setsToSync(await loadSetRows(db));
  const emit = createThrottle(PROGRESS_INTERVAL_MS);
  const report = (done: number, total: number) => {
    if (!emit(done === total)) return;
    status().setStatus({
      message: `Downloading card database… ${done} of ${total} sets`,
      done,
      total,
    });
    logCatalogue(`onboarding ${done}/${total} sets`);
  };
  report(0, toSync.length);
  const failedSetIds = await syncSets(db, toSync, report);
  status().setStatus({ failedSetIds });
  if (failedSetIds.length === 0) await markOnboarded(db);
  return { failedSetIds };
}

async function missingImageCounts(db: Db): Promise<Map<string, number>> {
  const rows = await db
    .select({ setId: cards.setId, n: count() })
    .from(cards)
    .where(isNull(cards.imageSmallUri))
    .groupBy(cards.setId);
  return new Map(rows.map((r) => [r.setId, r.n]));
}

/** Daily: recent / incomplete sets, reopened top-ups, unpriced cards. */
async function runDailyRecheck(db: Db, now: Date): Promise<void> {
  const setRows = await loadSetRows(db);
  const missing = await missingImageCounts(db);
  const recheck = setsToRecheck(
    setRows.map((s) => ({
      id: s.id,
      releaseDate: s.releaseDate,
      missingImages: missing.get(s.id) ?? 0,
    })),
    now,
  );
  logCatalogue(`re-check: ${recheck.length} sets (recent or missing images)`);
  const failed = await syncSets(db, recheck);

  const reopen = topUpsToReopen(setRows, now);
  if (reopen.length > 0) {
    await db.update(sets).set({ variantsCheckedAt: null }).where(inArray(sets.id, reopen));
    logCatalogue(`re-opening variant top-up for ${reopen.join(', ')}`);
  }

  const unpricedRows = await db
    .select({
      id: cards.id,
      priceVariants: cards.priceVariants,
      priceCheckedAt: cards.priceCheckedAt,
    })
    .from(cards)
    .where(sql`${cards.priceVariants} = '[]'`);
  const unpriced = cardsDuePriceRecheck(unpricedRows, now);
  if (unpriced.length > 0) logCatalogue(`re-checking prices for ${unpriced.length} unpriced cards`);
  for (const ids of chunk(unpriced, UNPRICED_BATCH)) {
    await applyRestDetails(db, await fetchCardDetails(ids), { storePrices: false });
  }

  if (failed.length === 0) await setSetting(db, CATALOGUE_RECHECKED_KEY, now.toISOString());
}

/**
 * Every start after onboarding, in the background: new and unsynced
 * sets, the daily re-check, then the variant top-up. Never throws:
 * offline is normal and the next start retries.
 */
export async function runStartupSync(db: Db, now: Date = new Date()): Promise<void> {
  status().setStatus({
    phase: 'checking',
    message: 'Checking for card updates in the background…',
  });
  try {
    await ingestSets(db);
    await syncSets(db, setsToSync(await loadSetRows(db)));
    if (isDue(await getSetting(db, CATALOGUE_RECHECKED_KEY), now, RECHECK_INTERVAL_MS)) {
      await runDailyRecheck(db, now);
    }
    await runVariantTopUp(db);
    logCatalogue('up to date');
  } catch (e) {
    warnCatalogue('background sync stopped', e);
  } finally {
    status().setIdle();
  }
}

/** Checklist ↻: re-download one set, plus its top-up when needed. */
export async function resyncSet(db: Db, setId: string): Promise<void> {
  status().setStatus({
    phase: 'resync',
    message: 'Downloading per-card details for this set…',
  });
  logCatalogue(`resync ${setId} (manual)`);
  try {
    const result = await syncSetCards(db, setId);
    if (result.placeholderFlags) await topUpSet(db, setId);
  } finally {
    status().setIdle();
  }
}
