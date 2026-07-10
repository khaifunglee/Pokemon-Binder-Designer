import { sortEntries } from '../sort';
import type { SortableEntry } from '../sort';

function entry(partial: Partial<SortableEntry> & { slotId: string }): SortableEntry {
  return {
    cardName: 'Card',
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

const order = (entries: SortableEntry[], strategy: Parameters<typeof sortEntries>[1]) =>
  sortEntries(entries, strategy).map((e) => e.slotId);

describe('master-set', () => {
  it('orders by release date, set, then collector number (numeric-aware)', () => {
    const entries = [
      entry({ slotId: 'newSet', setReleaseDate: '2023/08/11', setId: 'sv3', number: '1' }),
      entry({ slotId: 'n10', number: '10' }),
      entry({ slotId: 'n2', number: '2' }),
      entry({ slotId: 'n025a', number: '025a' }),
      entry({ slotId: 'tg1', number: 'TG1' }),
    ];
    expect(order(entries, 'master-set')).toEqual(['n2', 'n10', 'n025a', 'tg1', 'newSet']);
  });

  it('sorts alpha-prefixed ranges after plain numbers, numerically within', () => {
    const entries = [
      entry({ slotId: 'tg12', number: 'TG12' }),
      entry({ slotId: 'tg2', number: 'TG2' }),
      entry({ slotId: 'gg9', number: 'GG9' }),
      entry({ slotId: 'plain', number: '200' }),
    ];
    expect(order(entries, 'master-set')).toEqual(['plain', 'gg9', 'tg2', 'tg12']);
  });
});

describe('colour', () => {
  it('orders by canonical type, Trainers then Energy last', () => {
    const entries = [
      entry({ slotId: 'water', types: ['Water'] }),
      entry({ slotId: 'trainer', supertype: 'Trainer' }),
      entry({ slotId: 'grass', types: ['Grass'] }),
      entry({ slotId: 'energy', supertype: 'Energy' }),
      entry({ slotId: 'fire', types: ['Fire'] }),
    ];
    expect(order(entries, 'colour')).toEqual([
      'grass',
      'fire',
      'water',
      'trainer',
      'energy',
    ]);
  });

  it('breaks type ties by name', () => {
    const entries = [
      entry({ slotId: 'z', types: ['Fire'], cardName: 'Zebstrika' }),
      entry({ slotId: 'a', types: ['Fire'], cardName: 'Arcanine' }),
    ];
    expect(order(entries, 'colour')).toEqual(['a', 'z']);
  });
});

describe('pokedex', () => {
  it('orders by min dex number, non-Pokémon last', () => {
    const entries = [
      entry({ slotId: 'mew', nationalPokedexNumbers: [151] }),
      entry({ slotId: 'trainer', supertype: 'Trainer' }),
      entry({ slotId: 'pika', nationalPokedexNumbers: [25] }),
      entry({ slotId: 'evo', nationalPokedexNumbers: [133, 134] }),
    ];
    expect(order(entries, 'pokedex')).toEqual(['pika', 'evo', 'mew', 'trainer']);
  });
});

describe('rarity', () => {
  it('orders common → rarest, unknown after known', () => {
    const entries = [
      entry({ slotId: 'secret', rarity: 'Rare Secret' }),
      entry({ slotId: 'common', rarity: 'Common' }),
      entry({ slotId: 'weird', rarity: 'Never Seen Rarity' }),
      entry({ slotId: 'rare', rarity: 'Rare' }),
      entry({ slotId: 'none', rarity: null }),
    ];
    expect(order(entries, 'rarity')).toEqual([
      'common',
      'rare',
      'secret',
      'weird',
      'none',
    ]);
  });
});

describe('custom', () => {
  it('keeps input order and does not mutate the input', () => {
    const entries = [
      entry({ slotId: 'b', number: '2' }),
      entry({ slotId: 'a', number: '1' }),
    ];
    expect(order(entries, 'custom')).toEqual(['b', 'a']);
    expect(entries.map((e) => e.slotId)).toEqual(['b', 'a']);
  });

  it('sortEntries never mutates input for sorting strategies either', () => {
    const entries = [
      entry({ slotId: 'b', number: '2' }),
      entry({ slotId: 'a', number: '1' }),
    ];
    sortEntries(entries, 'master-set');
    expect(entries.map((e) => e.slotId)).toEqual(['b', 'a']);
  });
});
