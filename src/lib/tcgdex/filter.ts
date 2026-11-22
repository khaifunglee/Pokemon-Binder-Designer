import type { DexSetBrief } from './types';

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
