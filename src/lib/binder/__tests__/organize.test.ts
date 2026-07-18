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

const ctx = (fullSets: SequenceContext['fullSets'] = []): SequenceContext => ({
  slotsPerPage: 4,
  fullSets,
});

describe('buildSequence — master-set gaps', () => {
  const fullSets = [
    { setId: 'sv1', releaseDate: '2023/03/31', cardIds: ['a', 'b', 'c', 'd', 'e'] },
    { setId: 'old', releaseDate: '2021/10/08', cardIds: ['x', 'y'] },
  ];

  it('lays out each represented set completely, gaps for missing cards', () => {
    const entries = [
      entry('s1', 'c'),
      entry('s2', 'a'),
      entry('s3', 'y', { setId: 'old', setReleaseDate: '2021/10/08' }),
    ];
    // old (earlier release) first: [x-gap, y], page pad to 4, then sv1.
    expect(ids(buildSequence(entries, 'master-set', ctx(fullSets)))).toEqual([
      null, 'y', null, null, // old set + padding to the page break
      'a', null, 'c', // sv1 up to its last owned card (d, e trimmed)
    ]);
  });

  it('keeps duplicate pockets of the same card adjacent', () => {
    const entries = [entry('s1', 'a'), entry('s2', 'a'), entry('s3', 'b')];
    expect(
      ids(buildSequence(entries, 'master-set', ctx([fullSets[0]]))),
    ).toEqual(['a', 'a', 'b']);
  });

  it('appends entries from unknown sets as leftovers', () => {
    const entries = [entry('s1', 'zz', { setId: 'mystery' }), entry('s2', 'a')];
    const seq = ids(buildSequence(entries, 'master-set', ctx([fullSets[0]])));
    // sv1 gets its gap layout (a..e → trailing gaps trimmed after zz pad);
    // leftovers start on a fresh page.
    expect(seq.slice(0, 5)).toEqual(['a', null, null, null, null]);
    expect(seq[8]).toBe('zz');
  });
});

describe('buildSequence — pokedex gaps', () => {
  it('leaves one gap per missing dex number in the owned range', () => {
    const entries = [
      entry('s1', 'mew', { nationalPokedexNumbers: [151] }),
      entry('s2', 'pika', { nationalPokedexNumbers: [25] }),
      entry('s3', 'raichu', { nationalPokedexNumbers: [26] }),
      entry('s4', 'eevee', { nationalPokedexNumbers: [133] }),
    ];
    const seq = ids(buildSequence(entries, 'pokedex', ctx()));
    expect(seq.length).toBe(151 - 25 + 1);
    expect(seq[0]).toBe('pika');
    expect(seq[1]).toBe('raichu');
    expect(seq[133 - 25]).toBe('eevee');
    expect(seq[151 - 25]).toBe('mew');
    expect(seq[50]).toBeNull();
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

  it('packs without gaps when pokedexGaps is off', () => {
    const entries = [
      entry('s1', 'mew', { nationalPokedexNumbers: [151] }),
      entry('s2', 'pika', { nationalPokedexNumbers: [25] }),
      entry('s3', 'ball', { supertype: 'Trainer' }),
    ];
    expect(
      ids(buildSequence(entries, 'pokedex', { ...ctx(), pokedexGaps: false })),
    ).toEqual(['pika', 'mew', 'ball']);
  });

  it('puts trainers/energies on a fresh page after the dex run', () => {
    const entries = [
      entry('s1', 'pika', { nationalPokedexNumbers: [25] }),
      entry('s2', 'ball', { supertype: 'Trainer' }),
    ];
    expect(ids(buildSequence(entries, 'pokedex', ctx()))).toEqual([
      'pika',
      null,
      null,
      null,
      'ball',
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
