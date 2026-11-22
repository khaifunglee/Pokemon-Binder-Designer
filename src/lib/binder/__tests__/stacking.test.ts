import { planConsolidate, planUnstack, resolvePlacement } from '../stacking';
import type { StackSlotState } from '../stacking';

const existing = [
  { slotId: 's1', cardId: 'cel25-1', quantity: 1 },
  { slotId: 's2', cardId: 'cel25-2', quantity: 3 },
];

describe('resolvePlacement', () => {
  it('places normally when stacking is off', () => {
    expect(
      resolvePlacement({ variantStacking: false, cardId: 'cel25-1', existing }),
    ).toEqual({ action: 'place' });
  });

  it('places normally when the card is not in the binder', () => {
    expect(
      resolvePlacement({ variantStacking: true, cardId: 'cel25-99', existing }),
    ).toEqual({ action: 'place' });
  });

  it('stacks onto the existing pocket and bumps quantity', () => {
    expect(
      resolvePlacement({ variantStacking: true, cardId: 'cel25-2', existing }),
    ).toEqual({ action: 'stack', slotId: 's2', newQuantity: 4 });
  });

  it('handles an empty binder', () => {
    expect(
      resolvePlacement({ variantStacking: true, cardId: 'cel25-1', existing: [] }),
    ).toEqual({ action: 'place' });
  });
});

function slot(
  slotId: string,
  cardId: string | null,
  quantity = 1,
  opts: Partial<StackSlotState> = {},
): StackSlotState {
  return { slotId, cardId, quantity, variant: 'normal', condition: null, ...opts };
}

describe('planConsolidate', () => {
  it('combines duplicates into the earliest pocket, summing quantities', () => {
    const plan = planConsolidate([
      slot('s1', 'a', 2),
      slot('s2', 'b'),
      slot('s3', 'a', 1),
      slot('s4', null),
      slot('s5', 'a', 3),
    ]);
    expect(plan.updates).toEqual([{ slotId: 's1', quantity: 6 }]);
    expect(plan.clears).toEqual(['s3', 's5']);
  });

  it('skips cards without duplicates', () => {
    const plan = planConsolidate([slot('s1', 'a'), slot('s2', null), slot('s3', 'b')]);
    expect(plan).toEqual({ updates: [], clears: [] });
  });
});

describe('planUnstack', () => {
  it('splits stacks into singles with overflow copies', () => {
    const plan = planUnstack([
      slot('s1', 'a', 3, { variant: 'holofoil', condition: 'NM' }),
      slot('s2', 'b', 1),
      slot('s3', 'c', 2),
    ]);
    expect(plan.updates).toEqual([{ slotId: 's1' }, { slotId: 's3' }]);
    expect(plan.overflow).toEqual([
      { cardId: 'a', variant: 'holofoil', condition: 'NM' },
      { cardId: 'a', variant: 'holofoil', condition: 'NM' },
      { cardId: 'c', variant: 'normal', condition: null },
    ]);
  });
});

describe('planConsolidate — edge cases', () => {
  it('returns an empty plan for an empty binder', () => {
    expect(planConsolidate([])).toEqual({ updates: [], clears: [] });
  });

  it('consolidates every duplicated card, in order of first appearance', () => {
    const plan = planConsolidate([
      slot('s1', 'b'),
      slot('s2', 'a'),
      slot('s3', 'b', 2),
      slot('s4', 'a'),
    ]);
    expect(plan.updates).toEqual([
      { slotId: 's1', quantity: 3 },
      { slotId: 's2', quantity: 2 },
    ]);
    expect(plan.clears).toEqual(['s3', 's4']);
  });

  it('stacks pockets of the same card even when their variants differ', () => {
    // Variant stacking means one pocket per card, matching resolvePlacement (card id only).
    const plan = planConsolidate([
      slot('s1', 'a', 1, { variant: 'normal' }),
      slot('s2', 'a', 1, { variant: 'reverseHolofoil' }),
    ]);
    expect(plan).toEqual({ updates: [{ slotId: 's1', quantity: 2 }], clears: ['s2'] });
  });
});

describe('planUnstack — edge cases', () => {
  it('returns an empty plan when nothing is stacked', () => {
    expect(planUnstack([slot('s1', 'a'), slot('s2', null, 3)])).toEqual({
      updates: [],
      overflow: [],
    });
  });
});
