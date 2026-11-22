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
  it('keeps duplicate pockets of the same card adjacent', () => {
    const entries = [
      entry('s1', 'a', { nationalPokedexNumbers: [25], number: '1' }),
      entry('s2', 'b', { nationalPokedexNumbers: [25], number: '2' }),
      entry('s3', 'a', { nationalPokedexNumbers: [25], number: '1' }),
    ];
    expect(ids(buildSequence(entries, 'pokedex', ctx()))).toEqual(['a', 'a', 'b']);
  });

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
  const filled = (slotId: string, cardId: string): OrganizeSlot => ({
    slotId,
    contents: { cardId, variant: 'normal', quantity: 1, condition: null },
    sortable: null,
  });
  const empty = (slotId: string): OrganizeSlot => ({
    slotId,
    contents: null,
    sortable: null,
  });

  it('maps entries and empties onto pockets in order, emitting only changes', () => {
    const slots = [empty('s1'), filled('s2', 'b'), filled('s3', 'a'), empty('s4')];
    const sequence = [entry('s3', 'a'), null, entry('s2', 'b')];
    expect(planFromSequence(slots, sequence)).toEqual([
      { slotId: 's1', contents: { cardId: 'a', variant: 'normal', quantity: 1, condition: null } },
      { slotId: 's2', contents: null },
      { slotId: 's3', contents: { cardId: 'b', variant: 'normal', quantity: 1, condition: null } },
    ]);
  });

  it('empties pockets beyond the sequence', () => {
    const slots = [filled('s1', 'a'), filled('s2', 'b')];
    expect(planFromSequence(slots, [entry('s1', 'a')])).toEqual([
      { slotId: 's2', contents: null },
    ]);
  });
});

describe('buildSequence — edge cases', () => {
  const strategies = ['master-set', 'pokedex', 'colour', 'rarity'] as const;

  it.each(strategies)('returns an empty sequence for an empty binder (%s)', (strategy) => {
    expect(buildSequence([], strategy, ctx())).toEqual([]);
  });

  it('does not pad when a set exactly fills its page', () => {
    const fullSet = ['1', '2', '3', '4'].map((n) =>
      entry(`a${n}`, `a${n}`, { setId: 'old', setReleaseDate: '2021/01/01', number: n }),
    );
    const entries = [...fullSet, entry('b1', 'b1')];
    expect(ids(buildSequence(entries, 'master-set', ctx()))).toEqual([
      'a1', 'a2', 'a3', 'a4', // old set fills page 1 exactly
      'b1', // next set starts page 2 with no blank page in between
    ]);
  });

  it('does not pad when a colour category exactly fills its page', () => {
    const grass = ['g1', 'g2', 'g3', 'g4'].map((c) => entry(c, c, { types: ['Grass'] }));
    const entries = [...grass, entry('f1', 'f1', { types: ['Fire'] })];
    expect(ids(buildSequence(entries, 'colour', ctx()))).toEqual(['g1', 'g2', 'g3', 'g4', 'f1']);
  });

  it.each(['master-set', 'colour', 'rarity'] as const)(
    'never pads with one pocket per page (%s)',
    (strategy) => {
      const entries = [
        entry('s1', 'a', { setId: 'x', types: ['Grass'], rarity: 'Common' }),
        entry('s2', 'b', { setId: 'y', types: ['Fire'], rarity: 'Double Rare' }),
        entry('s3', 'c', { setId: 'z', types: ['Water'], rarity: 'Hyper Rare' }),
      ];
      const seq = buildSequence(entries, strategy, { slotsPerPage: 1 });
      expect(seq).toHaveLength(3);
      expect(seq).not.toContain(null);
    },
  );

  it('gives an undated set (empty release date) its own page', () => {
    const entries = [
      entry('s1', 'dated', { setId: 'sv1', setReleaseDate: '2023/03/31' }),
      entry('s2', 'undated', { setId: 'promo', setReleaseDate: '' }),
    ];
    const seq = ids(buildSequence(entries, 'master-set', ctx()));
    // Undated sorts first (empty string), but still cannot share a page with sv1.
    expect(seq).toEqual(['undated', null, null, null, 'dated']);
  });

  it('separates two undated sets by set id', () => {
    const entries = [
      entry('s1', 'q', { setId: 'promo-b', setReleaseDate: '' }),
      entry('s2', 'p', { setId: 'promo-a', setReleaseDate: '' }),
    ];
    expect(ids(buildSequence(entries, 'master-set', ctx()))).toEqual(['p', null, null, null, 'q']);
  });

  it('places a multi-dex card at its lowest dex number', () => {
    const entries = [
      entry('s1', 'pika', { nationalPokedexNumbers: [25] }),
      entry('s2', 'tag-team', { nationalPokedexNumbers: [150, 1] }), // e.g. Mewtwo & Bulbasaur
    ];
    expect(ids(buildSequence(entries, 'pokedex', ctx()))).toEqual(['tag-team', 'pika']);
  });

  it('never inserts page breaks for pokedex, even across sets', () => {
    const entries = [
      entry('s1', 'bulba', { nationalPokedexNumbers: [1], setId: 'old', setReleaseDate: '2020/01/01' }),
      entry('s2', 'pika', { nationalPokedexNumbers: [25], setId: 'sv1' }),
      entry('s3', 'ball', { supertype: 'Trainer', setId: 'other' }),
    ];
    expect(buildSequence(entries, 'pokedex', ctx())).not.toContain(null);
  });

  it('does not end with padding when the last category is short', () => {
    const entries = [
      entry('s1', 'g', { types: ['Grass'] }),
      entry('s2', 'f', { types: ['Fire'] }),
    ];
    const seq = buildSequence(entries, 'colour', ctx());
    expect(seq[seq.length - 1]).not.toBeNull();
  });
});

describe('planFromSequence — edge cases', () => {
  const contents = (cardId: string, extra: Partial<{ variant: string | null; quantity: number; condition: string | null }> = {}) => ({
    cardId,
    variant: 'normal' as string | null,
    quantity: 1,
    condition: null as string | null,
    ...extra,
  });
  const slotWith = (slotId: string, c: ReturnType<typeof contents> | null): OrganizeSlot => ({
    slotId,
    contents: c,
    sortable: null,
  });

  it('emits no changes when identical duplicates only swap places', () => {
    const slots = [slotWith('s1', contents('a')), slotWith('s2', contents('a'))];
    expect(planFromSequence(slots, [entry('s2', 'a'), entry('s1', 'a')])).toEqual([]);
  });

  it('moves duplicates of a card that differ in quantity', () => {
    const slots = [
      slotWith('s1', contents('a', { quantity: 2 })),
      slotWith('s2', contents('a', { quantity: 1 })),
    ];
    expect(planFromSequence(slots, [entry('s2', 'a'), entry('s1', 'a')])).toEqual([
      { slotId: 's1', contents: contents('a', { quantity: 1 }) },
      { slotId: 's2', contents: contents('a', { quantity: 2 }) },
    ]);
  });

  it('moves duplicates of a card that differ in variant or condition', () => {
    const slots = [
      slotWith('s1', contents('a', { variant: 'holofoil' })),
      slotWith('s2', contents('a', { condition: 'NM' })),
    ];
    expect(planFromSequence(slots, [entry('s2', 'a'), entry('s1', 'a')])).toEqual([
      { slotId: 's1', contents: contents('a', { condition: 'NM' }) },
      { slotId: 's2', contents: contents('a', { variant: 'holofoil' }) },
    ]);
  });

  it('only plans changes for existing pockets when the sequence is longer', () => {
    const slots = [slotWith('s1', contents('a')), slotWith('s2', null)];
    const sequence = [entry('s1', 'a'), null, entry('s1', 'a')];
    expect(planFromSequence(slots, sequence)).toEqual([]);
  });

  it('emits nothing for an empty binder', () => {
    expect(planFromSequence([], [])).toEqual([]);
  });
});
