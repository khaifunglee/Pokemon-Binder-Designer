/**
 * Re-sort diff engine: turns "current arrangement → target arrangement"
 * into the minimal sequence of physical moves a human can follow at a
 * real binder. Pockets are addressed by binder-wide ordinal
 * (pageIndex * slotsPerPage + slotIndex); stacked pockets move as one
 * unit. Every card is touched at most once:
 *
 * - `place` steps move a card into a pocket that is empty at that moment
 *   (chains execute in an order that frees pockets just in time).
 * - `swapCycle` steps cover cards that displace each other in a ring —
 *   physically: take the first card in hand, place it, picking up the
 *   displaced card, and continue until the ring closes.
 */

export interface DiffPocket {
  ordinal: number;
  occupied: boolean;
}

export type DiffStep =
  | { kind: 'place'; from: number; to: number }
  | {
      /** Contents rotate forward: ring[i]'s card moves to ring[i+1]. */
      kind: 'swapCycle';
      ring: number[];
    };

/**
 * @param pockets  The binder's pockets.
 * @param targetSources  targetOrdinal → ordinal currently holding the
 *   card that must end up there. Pockets absent as targets end empty;
 *   every occupied pocket must appear exactly once as a source.
 */
export function computeMoves(
  pockets: DiffPocket[],
  targetSources: ReadonlyMap<number, number>,
): DiffStep[] {
  // Pending moves, keyed by the card's current pocket.
  const destBySource = new Map<number, number>();
  const wantsPocket = new Map<number, number>(); // target → source
  for (const [target, source] of targetSources) {
    if (target === source) continue;
    destBySource.set(source, target);
    wantsPocket.set(target, source);
  }

  const steps: DiffStep[] = [];

  // Phase 1 — chains: repeatedly move cards whose destination is free;
  // each move frees the card's own pocket, possibly unblocking another.
  const queue = pockets.filter((p) => !p.occupied).map((p) => p.ordinal);
  while (queue.length > 0) {
    const freePocket = queue.pop()!;
    const source = wantsPocket.get(freePocket);
    if (source === undefined) continue;
    if (destBySource.get(source) !== freePocket) continue; // already handled
    steps.push({ kind: 'place', from: source, to: freePocket });
    destBySource.delete(source);
    queue.push(source); // the vacated pocket may unblock the next card
  }

  // Phase 2 — cycles: what remains displaces each other in rings.
  while (destBySource.size > 0) {
    const start = destBySource.keys().next().value as number;
    const ring: number[] = [];
    let current = start;
    do {
      ring.push(current);
      const next = destBySource.get(current)!;
      destBySource.delete(current);
      current = next;
    } while (current !== start);
    steps.push({ kind: 'swapCycle', ring });
  }

  return steps;
}

/** Human-facing instructions after batching adjacent moves. */
export type Instruction =
  | { kind: 'place'; from: number; to: number }
  | {
      /** Pockets fromStart..fromEnd (inclusive) all move by `offset`;
       * physically executed from the far end so nothing is overwritten. */
      kind: 'shift';
      fromStart: number;
      fromEnd: number;
      offset: 1 | -1;
    }
  | { kind: 'swap'; a: number; b: number }
  | { kind: 'swapCycle'; ring: number[] };

const samePage = (a: number, b: number, slotsPerPage: number) =>
  Math.floor(a / slotsPerPage) === Math.floor(b / slotsPerPage);

/**
 * Collapse runs of chained single-step places into "shift by one"
 * instructions ("shift pockets 5–9 right by one") when the whole run
 * stays on one page, and name two-card rings swaps.
 */
export function batchInstructions(
  steps: DiffStep[],
  slotsPerPage: number,
): Instruction[] {
  const out: Instruction[] = [];
  let i = 0;
  while (i < steps.length) {
    const step = steps[i];
    if (step.kind === 'swapCycle') {
      out.push(
        step.ring.length === 2
          ? { kind: 'swap', a: step.ring[0], b: step.ring[1] }
          : step,
      );
      i++;
      continue;
    }
    const offset = step.to - step.from;
    if (offset === 1 || offset === -1) {
      // Extend while each next step moves the adjacent pocket into the
      // one just vacated, staying on a single page end to end.
      let end = i;
      while (end + 1 < steps.length) {
        const prev = steps[end];
        const next = steps[end + 1];
        if (prev.kind !== 'place' || next.kind !== 'place') break;
        if (next.to !== prev.from) break;
        if (next.to - next.from !== offset) break;
        end++;
      }
      if (end > i) {
        const froms = steps
          .slice(i, end + 1)
          .map((s) => (s as { kind: 'place'; from: number }).from);
        const lo = Math.min(...froms);
        const hi = Math.max(...froms);
        const pageOk =
          samePage(lo, hi, slotsPerPage) &&
          samePage(lo + offset, hi + offset, slotsPerPage);
        if (pageOk) {
          out.push({ kind: 'shift', fromStart: lo, fromEnd: hi, offset: offset as 1 | -1 });
          i = end + 1;
          continue;
        }
      }
    }
    out.push({ kind: 'place', from: step.from, to: step.to });
    i++;
  }
  return out;
}
