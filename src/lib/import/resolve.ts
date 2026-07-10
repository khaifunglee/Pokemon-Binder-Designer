import type { ImportRow } from './types';

/**
 * Pure matching for CSV import: set references and cards resolve against
 * data the caller loads from SQLite; no I/O here.
 */

export interface SetRef {
  id: string;
  name: string;
  ptcgoCode: string | null;
}

export interface CardRef {
  id: string;
  name: string;
  number: string;
  variants: string[];
}

/** Compare form for collector numbers: uppercase, leading zeros dropped. */
export function numberKey(raw: string): string {
  const upper = raw.trim().toUpperCase();
  const stripped = upper.replace(/^0+(?=.)/, '');
  return stripped;
}

/**
 * Resolve which set a row refers to. Priority: explicit set code against
 * ptcgoCode/API id, then the set-name column against name/id/ptcgoCode —
 * sources disagree about what goes in their "Set" column.
 */
export function resolveSetRef(
  row: Pick<ImportRow, 'setCode' | 'setName'>,
  sets: SetRef[],
): SetRef | null {
  const ci = (s: string) => s.trim().toLowerCase();
  for (const value of [row.setCode, row.setName]) {
    if (!value) continue;
    const needle = ci(value);
    const hit = sets.find(
      (s) =>
        (s.ptcgoCode !== null && ci(s.ptcgoCode) === needle) ||
        ci(s.id) === needle ||
        ci(s.name) === needle,
    );
    if (hit) return hit;
  }
  return null;
}

export type CardMatch =
  | { status: 'matched'; card: CardRef; variant: string }
  | { status: 'no-card' }
  | { status: 'ambiguous' };

/**
 * Match a row inside a set's card list: collector number first (name as
 * tie-breaker for shared numbers), else unique name match. The variant is
 * the row's hint when the card actually has it, else the card's default.
 */
export function matchCardInSet(
  row: Pick<ImportRow, 'name' | 'number' | 'variantHint'>,
  cards: CardRef[],
): CardMatch {
  const ciName = row.name?.trim().toLowerCase() ?? null;

  let candidates: CardRef[] = [];
  if (row.number !== null) {
    const key = numberKey(row.number);
    candidates = cards.filter((c) => numberKey(c.number) === key);
    if (candidates.length > 1 && ciName) {
      const byName = candidates.filter((c) => c.name.trim().toLowerCase() === ciName);
      if (byName.length > 0) candidates = byName;
    }
  } else if (ciName) {
    candidates = cards.filter((c) => c.name.trim().toLowerCase() === ciName);
  }

  if (candidates.length === 0) return { status: 'no-card' };
  if (candidates.length > 1) return { status: 'ambiguous' };

  const card = candidates[0];
  const variant =
    row.variantHint !== null && card.variants.includes(row.variantHint)
      ? row.variantHint
      : (card.variants[0] ?? 'normal');
  return { status: 'matched', card, variant };
}

export interface PlannedPlacement {
  cardId: string;
  variant: string;
  quantity: number;
}

/**
 * Collapse matched rows into pocket contents. With variant stacking on,
 * rows for the same card merge into one pocket (quantities summed);
 * otherwise same card+variant rows still merge (a CSV listing the same
 * printing twice means more copies, not more pockets), but distinct
 * variants get their own pockets.
 */
export function planPlacements(
  matched: { cardId: string; variant: string; quantity: number }[],
  variantStacking: boolean,
): PlannedPlacement[] {
  const byKey = new Map<string, PlannedPlacement>();
  for (const m of matched) {
    const key = variantStacking ? m.cardId : `${m.cardId}::${m.variant}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.quantity += m.quantity;
    } else {
      byKey.set(key, { ...m });
    }
  }
  return [...byKey.values()];
}
