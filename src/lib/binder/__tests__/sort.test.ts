import { compareMasterSet, rarityBucket, sortEntries } from '../sort';
import type { SortableEntry } from '../sort';

function entry(partial: Partial<SortableEntry> & { slotId: string }): SortableEntry {
  return {
    cardId: `card-${partial.slotId}`,
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
  it('puts sets with no release date after every dated set', () => {
    const undated = entry({ slotId: 'undated', setReleaseDate: '', setId: 'promo' });
    const dated = entry({ slotId: 'dated', setReleaseDate: '2026/11/06', setId: 'me06' });
    expect(compareMasterSet(undated, dated)).toBeGreaterThan(0);
    expect(compareMasterSet(dated, undated)).toBeLessThan(0);
  });

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

describe('rarityBucket', () => {
  it('separates regular ex, full arts, IR, SIR, and hyper rares', () => {
    expect(rarityBucket('Common')).toBe(0);
    expect(rarityBucket('Uncommon')).toBe(0);
    expect(rarityBucket('Rare')).toBe(1);
    expect(rarityBucket('Rare Holo')).toBe(1);
    expect(rarityBucket('Radiant Rare')).toBe(1);
    expect(rarityBucket('Double Rare')).toBe(2); // regular ex
    expect(rarityBucket('Rare Holo V')).toBe(2);
    expect(rarityBucket('Rare Holo VMAX')).toBe(2);
    expect(rarityBucket('Rare Holo GX')).toBe(2);
    expect(rarityBucket('Ultra Rare')).toBe(3); // full-art ex etc.
    expect(rarityBucket('Rare Ultra')).toBe(3);
    expect(rarityBucket('Illustration Rare')).toBe(4);
    expect(rarityBucket('Special Illustration Rare')).toBe(5);
    expect(rarityBucket('Hyper Rare')).toBe(6);
    expect(rarityBucket('Rare Rainbow')).toBe(6);
    expect(rarityBucket('Rare Secret')).toBe(6);
    expect(rarityBucket('Promo')).toBe(7);
    expect(rarityBucket('Never Seen Rarity')).toBe(7);
    expect(rarityBucket(null)).toBe(7);
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
