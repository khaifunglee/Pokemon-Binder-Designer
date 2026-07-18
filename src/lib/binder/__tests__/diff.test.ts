import { batchInstructions, computeMoves } from '../diff';
import type { DiffPocket, DiffStep } from '../diff';

/** occupied: list of ordinals holding a card; universe 0..size-1. */
const pockets = (size: number, occupied: number[]): DiffPocket[] => {
  const set = new Set(occupied);
  return Array.from({ length: size }, (_, ordinal) => ({
    ordinal,
    occupied: set.has(ordinal),
  }));
};

/** Simulate a plan to verify it reaches the target with valid steps. */
function simulate(
  size: number,
  occupied: number[],
  targetSources: Map<number, number>,
  steps: DiffStep[],
): void {
  // pocket → card id (card id = its starting ordinal)
  const state = new Map<number, number>(occupied.map((o) => [o, o]));
  for (const step of steps) {
    if (step.kind === 'place') {
      expect(state.has(step.to)).toBe(false); // destination must be empty
      expect(state.has(step.from)).toBe(true);
      state.set(step.to, state.get(step.from)!);
      state.delete(step.from);
    } else {
      // Forward rotation: ring[i]'s card moves to ring[i+1], last wraps.
      const ring = step.ring;
      for (const p of ring) expect(state.has(p)).toBe(true);
      const carry = state.get(ring[ring.length - 1])!;
      for (let i = ring.length - 1; i >= 1; i--) {
        state.set(ring[i], state.get(ring[i - 1])!);
      }
      state.set(ring[0], carry);
    }
  }
  // Verify final positions match targetSources.
  for (const [target, source] of targetSources) {
    expect(state.get(target)).toBe(source);
  }
  const targetCount = targetSources.size;
  expect(state.size).toBe(targetCount);
}

describe('computeMoves', () => {
  it('returns nothing when already arranged', () => {
    const t = new Map([
      [0, 0],
      [1, 1],
    ]);
    expect(computeMoves(pockets(4, [0, 1]), t)).toEqual([]);
  });

  it('moves a card into an empty pocket', () => {
    const t = new Map([[0, 3]]);
    const steps = computeMoves(pockets(4, [3]), t);
    expect(steps).toEqual([{ kind: 'place', from: 3, to: 0 }]);
  });

  it('chains moves so each destination is free in time (compaction)', () => {
    // Cards at 1,2,3 → targets 0,1,2 (shift left); executes 1→0, 2→1, 3→2.
    const t = new Map([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
    const occ = [1, 2, 3];
    const steps = computeMoves(pockets(4, occ), t);
    simulate(4, occ, t, steps);
    expect(steps).toEqual([
      { kind: 'place', from: 1, to: 0 },
      { kind: 'place', from: 2, to: 1 },
      { kind: 'place', from: 3, to: 2 },
    ]);
  });

  it('emits a swap for two cards that trade places', () => {
    const t = new Map([
      [0, 1],
      [1, 0],
    ]);
    const occ = [0, 1];
    const steps = computeMoves(pockets(2, occ), t);
    simulate(2, occ, t, steps);
    expect(steps).toEqual([{ kind: 'swapCycle', ring: expect.arrayContaining([0, 1]) }]);
  });

  it('handles a 3-cycle in one ring', () => {
    // 0→1, 1→2, 2→0 (full pockets, no empties).
    const t = new Map([
      [1, 0],
      [2, 1],
      [0, 2],
    ]);
    const occ = [0, 1, 2];
    const steps = computeMoves(pockets(3, occ), t);
    simulate(3, occ, t, steps);
    expect(steps).toHaveLength(1);
    expect(steps[0].kind).toBe('swapCycle');
  });

  it('prefers breaking cycles via empty pockets when one is involved', () => {
    // 0→1, 1→0 would be a swap, but with target 1 also… instead:
    // card 0 → pocket 2 (empty), card 1 → pocket 0, i.e. a chain when
    // the target layout itself uses the empty pocket.
    const t = new Map([
      [2, 0],
      [0, 1],
    ]);
    const occ = [0, 1];
    const steps = computeMoves(pockets(3, occ), t);
    simulate(3, occ, t, steps);
    expect(steps.every((s) => s.kind === 'place')).toBe(true);
  });

  it('solves a mixed arrangement (chains + cycle) touching each card once', () => {
    // 6 pockets: cards at 0,1,2,4,5. Targets: 0↔1 (cycle), 2→3 (chain
    // into empty), 4→5, 5→4 (cycle).
    const t = new Map([
      [0, 1],
      [1, 0],
      [3, 2],
      [4, 5],
      [5, 4],
    ]);
    const occ = [0, 1, 2, 4, 5];
    const steps = computeMoves(pockets(6, occ), t);
    simulate(6, occ, t, steps);
    const touches = steps.reduce(
      (n, s) => n + (s.kind === 'place' ? 1 : s.ring.length),
      0,
    );
    expect(touches).toBe(5); // every moving card touched exactly once
  });
});

describe('batchInstructions', () => {
  it('collapses a chained run into a shift', () => {
    const steps: DiffStep[] = [
      { kind: 'place', from: 1, to: 0 },
      { kind: 'place', from: 2, to: 1 },
      { kind: 'place', from: 3, to: 2 },
    ];
    expect(batchInstructions(steps, 9)).toEqual([
      { kind: 'shift', fromStart: 1, fromEnd: 3, offset: -1 },
    ]);
  });

  it('collapses rightward shifts (executed far end first)', () => {
    const steps: DiffStep[] = [
      { kind: 'place', from: 8, to: 9 },
      { kind: 'place', from: 7, to: 8 },
      { kind: 'place', from: 6, to: 7 },
    ];
    // 6..9 span pages of 9 (pocket 9 is on page 2): the cross-page move
    // stays single, the same-page remainder still batches.
    expect(batchInstructions(steps, 9)).toEqual([
      { kind: 'place', from: 8, to: 9 },
      { kind: 'shift', fromStart: 6, fromEnd: 7, offset: 1 },
    ]);
    // With 12-pocket pages it stays on one page and batches.
    expect(batchInstructions(steps, 12)).toEqual([
      { kind: 'shift', fromStart: 6, fromEnd: 8, offset: 1 },
    ]);
  });

  it('labels 2-rings as swaps and leaves longer rings intact', () => {
    const steps: DiffStep[] = [
      { kind: 'swapCycle', ring: [0, 4] },
      { kind: 'swapCycle', ring: [1, 2, 3] },
    ];
    expect(batchInstructions(steps, 9)).toEqual([
      { kind: 'swap', a: 0, b: 4 },
      { kind: 'swapCycle', ring: [1, 2, 3] },
    ]);
  });

  it('leaves non-adjacent places as singles', () => {
    const steps: DiffStep[] = [
      { kind: 'place', from: 5, to: 0 },
      { kind: 'place', from: 7, to: 1 },
    ];
    expect(batchInstructions(steps, 9)).toEqual(steps);
  });
});
