/**
 * Per-binder completion vs the full variant-level checklists of the sets
 * the binder contains, and cost-to-complete from USD market prices.
 * Pure; the DB layer supplies checklists, ownership, and prices.
 */

export interface ChecklistEntryRef {
  cardId: string;
  variant: string;
}

export interface SetCompletionInput {
  setId: string;
  /** Full (card, variant) checklist of the set. */
  entries: ChecklistEntryRef[];
}

export interface SetCompletion {
  setId: string;
  total: number;
  ownedCount: number;
  missing: ChecklistEntryRef[];
  /** Sum of known market prices of missing entries. */
  costUsd: number;
  /** Missing entries with no price data (excluded from costUsd). */
  unpricedCount: number;
}

export interface CompletionSummary {
  sets: SetCompletion[];
  total: number;
  ownedCount: number;
  costUsd: number;
  unpricedCount: number;
}

export const entryKey = (e: ChecklistEntryRef): string => `${e.cardId}::${e.variant}`;

export function computeCompletion(
  sets: SetCompletionInput[],
  ownedKeys: ReadonlySet<string>,
  pricesUsd: ReadonlyMap<string, number>,
): CompletionSummary {
  const perSet: SetCompletion[] = sets.map((set) => {
    const missing = set.entries.filter((e) => !ownedKeys.has(entryKey(e)));
    let costUsd = 0;
    let unpricedCount = 0;
    for (const e of missing) {
      const price = pricesUsd.get(entryKey(e));
      if (price === undefined) unpricedCount++;
      else costUsd += price;
    }
    return {
      setId: set.setId,
      total: set.entries.length,
      ownedCount: set.entries.length - missing.length,
      missing,
      costUsd,
      unpricedCount,
    };
  });

  return {
    sets: perSet,
    total: perSet.reduce((n, s) => n + s.total, 0),
    ownedCount: perSet.reduce((n, s) => n + s.ownedCount, 0),
    costUsd: perSet.reduce((n, s) => n + s.costUsd, 0),
    unpricedCount: perSet.reduce((n, s) => n + s.unpricedCount, 0),
  };
}

export function completionPercent(owned: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((owned / total) * 100);
}
