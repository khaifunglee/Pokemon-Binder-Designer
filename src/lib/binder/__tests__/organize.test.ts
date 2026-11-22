import { buildSequence, planFromSequence } from '../organize';
import type { OrganizeSlot, SequenceContext } from '../organize';
import type { SortableEntry } from '../sort';

function entry(
  slotId: string,
  cardId: string,
  partial: Partial<SortableEntry> = {},
): SortableEntry {
  return {
    slotId,
    cardId,
    cardName: cardId,
    number: '1',
    setId: 'sv1',
    setReleaseDate: '2023/03/31',
    types: [],
    nationalPokedexNumbers: [],
    rarity: null,
    supertype: 'Pokémon',
    ...partial,
  };
}

const ids = (seq: (SortableEntry | null)[]) => seq.map((e) => e?.cardId ?? null);

const ctx = (): SequenceContext => ({ slotsPerPage: 4 });

describe('buildSequence — master-set (packed)', () => {
  it('packs owned cards in collector order, each set on a fresh page', () => {
    const entries = [
      entry('s1', 'c', { number: '3' }),
      entry('s2', 'a', { number: '1' }),
      entry('s3', 'y', { setId: 'old', setReleaseDate: '2021/10/08', number: '2' }),
    ];
    expect(ids(buildSequence(entries, 'master-set', ctx()))).toEqual([
      'y', null, null, null, // old set, then page break
      'a', 'c', // sv1 packed: no pocket for missing b
    ]);
  });

  it('has no null entries inside a set', () => {
    const entries = ['9', '1', '5', '3'].map((n) => entry(`s${n}`, `c${n}`, { number: n }));
    expect(ids(buildSequence(entries, 'master-set', ctx()))).toEqual(['c1', 'c3', 'c5', 'c9']);
  });

  it('keeps duplicate pockets of the same card adjacent', () => {
    const entries = [entry('s1', 'a'), entry('s2', 'b', { number: '2' }), entry('s3', 'a')];
    expect(ids(buildSequence(entries, 'master-set', ctx()))).toEqual(['a', 'a', 'b']);
  });

  it('splits sets that share a release date', () => {
    const entries = [entry('s1', 'p', { setId: 'sv1b' }), entry('s2', 'q', { setId: 'sv1a' })];
    expect(ids(buildSequence(entries, 'master-set', ctx()))).toEqual(['q', null, null, null, 'p']);
  });

  it('gives one-card sets a page each', () => {
    const entries = ['x1', 'x2', 'x3'].map((s, i) =>
      entry(`s${i}`, s, { setId: s, setReleaseDate: `2020/01/0${i + 1}` }),
    );
    expect(ids(buildSequence(entries, 'master-set', ctx()))).toEqual([
      'x1', null, null, null, 'x2', null, null, null, 'x3',
    ]);
  });
});

describe('buildSequence — pokedex (packed)', () => {
  it('is packed dex order with non-Pokémon after, no blank pockets', () => {
    const entries = [
      entry('s1', 'mew', { nationalPokedexNumbers: [151] }),
      entry('s2', 'ball', { supertype: 'Trainer' }),
      entry('s3', 'pika', { nationalPokedexNumbers: [25] }),
    ];
    expect(ids(buildSequence(entries, 'pokedex', ctx()))).toEqual(['pika', 'mew', 'ball']);
  });

  it('groups multiple cards of one species at its dex position', () => {
    const entries = [
      entry('s1', 'pika-new', { nationalPokedexNumbers: [25], setReleaseDate: '2023/03/31' }),
      entry('s2', 'pika-old', { nationalPokedexNumbers: [25], setReleaseDate: '2021/01/01' }),
      entry('s3', 'raichu', { nationalPokedexNumbers: [26] }),
    ];
    expect(ids(buildSequence(entries, 'pokedex', ctx()))).toEqual([
      'pika-old',
      'pika-new',
      'raichu',
    ]);
  });
});

describe('buildSequence — colour/rarity page grouping', () => {
  it('starts each colour on a fresh page', () => {
    const entries = [
      entry('s1', 'fire1', { types: ['Fire'] }),
      entry('s2', 'grass1', { types: ['Grass'] }),
      entry('s3', 'grass2', { types: ['Grass'], cardName: 'zz' }),
    ];
    expect(ids(buildSequence(entries, 'colour', ctx()))).toEqual([
      'grass1', 'grass2', null, null, // grass page
      'fire1',
    ]);
  });

  it('starts each rarity bucket on a fresh page, commons+uncommons together', () => {
    const entries = [
      entry('s1', 'fullart', { rarity: 'Special Illustration Rare' }),
      entry('s2', 'common', { rarity: 'Common' }),
      entry('s3', 'uncommon', { rarity: 'Uncommon', number: '2' }),
      entry('s4', 'ex', { rarity: 'Double Rare' }),
    ];
    expect(ids(buildSequence(entries, 'rarity', ctx()))).toEqual([
      'common', 'uncommon', null, null, // bucket 0
      'ex', null, null, null, // bucket 2 (ultras)
      'fullart',
    ]);
  });
});

describe('planFromSequence', () => {
  const filled = (slotId: string, cardId: string, pinned = false): OrganizeSlot => ({
    slotId,
    contents: { cardId, variant: 'normal', quantity: 1, condition: null },
    sortable: null,
    pinned,
  });
  const empty = (slotId: string, pinned = false): OrganizeSlot => ({
    slotId,
    contents: null,
    sortable: null,
    pinned,
  });

  it('maps entries and gaps onto unpinned pockets, emitting only changes', () => {
    const slots = [empty('s1'), filled('s2', 'b'), filled('s3', 'a'), empty('s4')];
    const sequence = [entry('s3', 'a'), null, entry('s2', 'b')];
    expect(planFromSequence(slots, sequence)).toEqual([
      { slotId: 's1', contents: { cardId: 'a', variant: 'normal', quantity: 1, condition: null } },
      { slotId: 's2', contents: null },
      { slotId: 's3', contents: { cardId: 'b', variant: 'normal', quantity: 1, condition: null } },
    ]);
  });

  it('skips pinned pockets entirely', () => {
    const slots = [filled('s1', 'pinned', true), empty('s2'), filled('s3', 'a')];
    const sequence = [entry('s3', 'a')];
    expect(planFromSequence(slots, sequence)).toEqual([
      { slotId: 's2', contents: { cardId: 'a', variant: 'normal', quantity: 1, condition: null } },
      { slotId: 's3', contents: null },
    ]);
  });

  it('empties pockets beyond the sequence', () => {
    const slots = [filled('s1', 'a'), filled('s2', 'b')];
    expect(planFromSequence(slots, [entry('s1', 'a')])).toEqual([
      { slotId: 's2', contents: null },
    ]);
  });
});
