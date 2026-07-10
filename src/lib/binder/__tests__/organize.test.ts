import { planOrganize } from '../organize';
import type { OrganizeSlot } from '../organize';

function filled(
  slotId: string,
  cardId: string,
  number: string,
  opts: Partial<OrganizeSlot> = {},
): OrganizeSlot {
  return {
    slotId,
    contents: { cardId, variant: 'normal', quantity: 1, condition: null },
    sortable: {
      cardName: cardId,
      number,
      setId: 'sv1',
      setReleaseDate: '2023/03/31',
      types: [],
      nationalPokedexNumbers: [],
      rarity: null,
      supertype: 'Pokémon',
    },
    pinned: false,
    ...opts,
  };
}

const empty = (slotId: string, pinned = false): OrganizeSlot => ({
  slotId,
  contents: null,
  sortable: null,
  pinned,
});

describe('planOrganize', () => {
  it('is a no-op for custom strategy', () => {
    expect(planOrganize([filled('s1', 'b', '2'), filled('s2', 'a', '1')], 'custom')).toEqual(
      [],
    );
  });

  it('compacts cards to the front in sorted order, emptying the rest', () => {
    const slots = [
      empty('s1'),
      filled('s2', 'card-10', '10'),
      empty('s3'),
      filled('s4', 'card-2', '2'),
    ];
    // s2 already holds card-10 (its sorted position) — no change emitted.
    expect(planOrganize(slots, 'master-set')).toEqual([
      { slotId: 's1', contents: { cardId: 'card-2', variant: 'normal', quantity: 1, condition: null } },
      { slotId: 's4', contents: null },
    ]);
  });

  it('emits no change for pockets already correct', () => {
    const slots = [filled('s1', 'a', '1'), filled('s2', 'b', '2'), empty('s3')];
    expect(planOrganize(slots, 'master-set')).toEqual([]);
  });

  it('never moves or overwrites pinned pockets', () => {
    const slots = [
      filled('s1', 'pinned-card', '99', { pinned: true }),
      filled('s2', 'card-5', '5'),
      empty('s3', true),
      filled('s4', 'card-1', '1'),
      empty('s5'),
    ];
    const changes = planOrganize(slots, 'master-set');
    // s1 (pinned, keeps its card) and s3 (pinned empty) untouched;
    // movable pockets s2, s4, s5 receive card-1, card-5, empty.
    expect(changes).toEqual([
      { slotId: 's2', contents: { cardId: 'card-1', variant: 'normal', quantity: 1, condition: null } },
      { slotId: 's4', contents: { cardId: 'card-5', variant: 'normal', quantity: 1, condition: null } },
    ]);
  });

  it('preserves variant/quantity/condition through moves', () => {
    const slots = [
      empty('s1'),
      {
        ...filled('s2', 'card-1', '1'),
        contents: { cardId: 'card-1', variant: 'holofoil', quantity: 3, condition: 'NM' },
      },
    ];
    expect(planOrganize(slots, 'master-set')).toEqual([
      { slotId: 's1', contents: { cardId: 'card-1', variant: 'holofoil', quantity: 3, condition: 'NM' } },
      { slotId: 's2', contents: null },
    ]);
  });
});
