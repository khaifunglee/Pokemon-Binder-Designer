/**
 * Which catalogue work is due. Pure, with `now` injected, so the timing
 * rules are testable; src/db/catalogueSync.ts does the I/O.
 */

export const DAY_MS = 86_400_000;
export const RECHECK_WINDOW_DAYS = 90;
/** Daily re-check of recent / incomplete sets. */
export const RECHECK_INTERVAL_MS = DAY_MS;
/** Cards with no TCGplayer data are re-checked weekly. */
export const UNPRICED_RECHECK_MS = 7 * DAY_MS;
/** Recent placeholder-flag sets re-run the variant top-up at most weekly. */
export const TOPUP_RERUN_MS = 7 * DAY_MS;

const olderThan = (date: Date | null, now: Date, ms: number): boolean =>
  date == null || now.getTime() - date.getTime() > ms;

/** Sets whose cards aren't on the device yet (resume skips the rest). */
export function setsToSync(
  sets: { id: string; total: number; cardsIngestedAt: Date | null }[],
): string[] {
  return sets.filter((s) => s.cardsIngestedAt == null && s.total > 0).map((s) => s.id);
}

/**
 * Fewer cards on the device than TCGdex's cardCount.total: the set is
 * stored anyway (4 sets have no cards anywhere in TCGdex, and 2 only some)
 * and re-checked daily until TCGdex fills it in.
 */
export function isIncompleteSet(localCards: number, total: number): boolean {
  return localCards < total;
}

export function isDue(lastRunIso: string | null, now: Date, intervalMs: number): boolean {
  if (lastRunIso == null) return true;
  const last = Date.parse(lastRunIso);
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= intervalMs;
}

/** Released within the window. '' (TCGdex omitted it) is never recent. */
export function isRecent(
  releaseDate: string,
  now: Date,
  windowDays: number = RECHECK_WINDOW_DAYS,
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) return false;
  const released = Date.parse(`${releaseDate}T00:00:00Z`);
  if (Number.isNaN(released)) return false;
  const age = now.getTime() - released;
  return age >= -DAY_MS && age <= windowDays * DAY_MS;
}

export interface RecheckCandidate {
  id: string;
  releaseDate: string;
  missingImages: number;
  localCards: number;
  total: number;
}

/** New sets arrive half-finished; TCGdex fills them in over weeks. */
export function setsToRecheck(sets: RecheckCandidate[], now: Date): string[] {
  return sets
    .filter(
      (s) =>
        isRecent(s.releaseDate, now) ||
        s.missingImages > 0 ||
        isIncompleteSet(s.localCards, s.total),
    )
    .map((s) => s.id);
}

/**
 * Sets whose REST set row (total, release date, name) should be fetched
 * again: the re-checked ones, plus sets first seen with no cards, which
 * otherwise never sync or re-check.
 */
export function setsToRefreshMetadata(sets: RecheckCandidate[], now: Date): string[] {
  const recheck = new Set(setsToRecheck(sets, now));
  return sets.filter((s) => recheck.has(s.id) || s.total === 0).map((s) => s.id);
}

export function setsNeedingTopUp(
  sets: { id: string; placeholderFlags: boolean; variantsCheckedAt: Date | null }[],
): string[] {
  return sets.filter((s) => s.placeholderFlags && s.variantsCheckedAt == null).map((s) => s.id);
}

/** Recent placeholder sets whose price keys may have appeared since. */
export function topUpsToReopen(
  sets: {
    id: string;
    releaseDate: string;
    placeholderFlags: boolean;
    variantsCheckedAt: Date | null;
  }[],
  now: Date,
): string[] {
  return sets
    .filter(
      (s) =>
        s.placeholderFlags &&
        s.variantsCheckedAt != null &&
        isRecent(s.releaseDate, now) &&
        olderThan(s.variantsCheckedAt, now, TOPUP_RERUN_MS),
    )
    .map((s) => s.id);
}

/** Cards checked and found without TCGplayer data, due again weekly. */
export function cardsDuePriceRecheck(
  cards: { id: string; priceVariants: string[] | null; priceCheckedAt: Date | null }[],
  now: Date,
): string[] {
  return cards
    .filter(
      (c) =>
        c.priceVariants != null &&
        c.priceVariants.length === 0 &&
        olderThan(c.priceCheckedAt, now, UNPRICED_RECHECK_MS),
    )
    .map((c) => c.id);
}
