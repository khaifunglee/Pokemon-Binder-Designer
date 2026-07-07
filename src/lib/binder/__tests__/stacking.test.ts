import { resolvePlacement } from '../stacking';

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
