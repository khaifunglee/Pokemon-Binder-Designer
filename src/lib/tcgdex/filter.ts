import type { DexSetBrief, DexSetDetail } from './types';

/** TCGdex series id of TCG Pocket, which is digital-only and never ingested. */
export const POCKET_SERIES_ID = 'tcgp';

/**
 * Ids of the set briefs worth fetching details for: not already in the
 * catalogue and not excluded. Excluded sets are dropped *before* the
 * "is it new?" check so they never look missing and get re-fetched.
 */
export function selectSetsToFetch(
  briefs: DexSetBrief[],
  knownIds: ReadonlySet<string>,
  excludedIds: ReadonlySet<string>,
): string[] {
  return briefs
    .filter((b) => !knownIds.has(b.id) && !excludedIds.has(b.id))
    .map((b) => b.id);
}

/**
 * Second line of defence after selectSetsToFetch, applied to fetched set
 * details: keep a set only when its series is named and isn't TCG Pocket.
 * Fails closed, so a Pocket set missing from an out-of-date series list
 * can't slip in just because its detail omits the series. The cost: a
 * real set without a series is skipped (and retried each sync) until
 * TCGdex fills it in.
 */
export function isKnownNonPocketSet(detail: DexSetDetail): boolean {
  const seriesId = detail.serie?.id;
  return typeof seriesId === 'string' && seriesId.length > 0 && seriesId !== POCKET_SERIES_ID;
}
