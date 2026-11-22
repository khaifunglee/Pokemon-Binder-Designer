import { batchInstructions, computeMoves } from '../lib/binder/diff';
import type { DiffPocket, Instruction } from '../lib/binder/diff';
import { layoutSpec } from '../lib/binder/layout';
import type { Db } from './client';
import { prepareOrganize } from './organize';
import type { SortStrategy } from './schema';

export interface MovePlan {
  instructions: Instruction[];
  slotsPerPage: number;
  /** Physical pages the user must add before starting. */
  pagesToAdd: number;
  /** Card name (with stack size) at each pocket's ORIGINAL position. */
  nameByOrdinal: Map<number, string>;
  /** Total pockets that end up moving. */
  movingCount: number;
}

/**
 * The physical re-sort plan for a binder: same target arrangement the
 * digital auto-organize would produce (buildSequence), diffed against
 * the current arrangement into batched, human-followable instructions.
 * Pinned pockets (merged/custom-image) neither move nor receive cards.
 */
export async function computeMovePlan(
  db: Db,
  binderId: string,
  strategy: Exclude<SortStrategy, 'custom'>,
): Promise<MovePlan> {
  const prep = await prepareOrganize(db, binderId, strategy);
  const { slotsPerPage } = layoutSpec(prep.binder.layout);

  // Array index in organizeSlots IS the binder-wide ordinal (every page
  // carries a full set of slot rows, ordered page-then-slot).
  const ordinalBySlotId = new Map<string, number>(
    prep.organizeSlots.map((s, i) => [s.slotId, i]),
  );

  const pockets: DiffPocket[] = prep.organizeSlots
    .map((s, i) => ({ ordinal: i, occupied: s.contents !== null }));

  // Pockets on pages the user will add: empty and usable.
  const existingCount = prep.organizeSlots.length;
  for (let i = 0; i < prep.pagesToAdd * slotsPerPage; i++) {
    pockets.push({ ordinal: existingCount + i, occupied: false });
  }

  // sequence[i] belongs in the i-th pocket.
  const movableOrdinals = pockets.map((p) => p.ordinal);
  const targetSources = new Map<number, number>();
  prep.sequence.forEach((entry, i) => {
    if (entry === null) return;
    const target = movableOrdinals[i];
    const source = ordinalBySlotId.get(entry.slotId);
    if (target === undefined || source === undefined) return;
    targetSources.set(target, source);
  });

  const nameByOrdinal = new Map<number, string>();
  prep.organizeSlots.forEach((s, i) => {
    if (s.contents === null || s.sortable === null) return;
    const stack = s.contents.quantity > 1 ? ` (stack of ${s.contents.quantity})` : '';
    nameByOrdinal.set(i, `${s.sortable.cardName}${stack}`);
  });

  const steps = computeMoves(pockets, targetSources);
  const movingCount = steps.reduce(
    (n, s) => n + (s.kind === 'place' ? 1 : s.ring.length),
    0,
  );

  return {
    instructions: batchInstructions(steps, slotsPerPage),
    slotsPerPage,
    pagesToAdd: prep.pagesToAdd,
    nameByOrdinal,
    movingCount,
  };
}
