/**
 * Runs the mappers over real API snapshots (scripts/fetch-fixtures.mjs).
 * Guards against drift between the live API shape and our ApiSet/ApiCard
 * types: if a re-fetched fixture breaks these invariants, the types or
 * mappers need updating.
 */
import cel25Cards from '../__fixtures__/cards.cel25.json';
import setsFixture from '../__fixtures__/sets.json';
import { KNOWN_VARIANTS, mapApiCard, mapApiSet } from '../mappers';
import type { ApiCard, ApiSet } from '../types';

const apiSets = setsFixture as ApiSet[];
const apiCards = cel25Cards as ApiCard[];

describe('sets fixture', () => {
  it('is a full catalog', () => {
    expect(apiSets.length).toBeGreaterThan(150);
  });

  it('every set maps to a valid row', () => {
    for (const apiSet of apiSets) {
      const row = mapApiSet(apiSet);
      expect(row.id).toBeTruthy();
      expect(row.name).toBeTruthy();
      expect(row.series).toBeTruthy();
      expect(row.releaseDate).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
      expect(row.total).toBeGreaterThan(0);
    }
  });
});

describe('cards fixture (cel25)', () => {
  it('has the full set', () => {
    expect(apiCards).toHaveLength(25);
  });

  it('every card maps to a valid row', () => {
    for (const apiCard of apiCards) {
      const row = mapApiCard(apiCard);
      expect(row.id).toBeTruthy();
      expect(row.setId).toBe('cel25');
      expect(row.name).toBeTruthy();
      expect(row.number).toBeTruthy();
      expect(row.supertype).toBeTruthy();
      expect(Array.isArray(row.types)).toBe(true);
      expect(row.variants!.length).toBeGreaterThan(0);
      for (const variant of row.variants!) {
        expect(KNOWN_VARIANTS).toContain(variant);
      }
    }
  });

  it('pokémon cards carry pokedex numbers for the pokedex sort', () => {
    const pokemon = apiCards.filter((c) => c.supertype === 'Pokémon');
    expect(pokemon.length).toBeGreaterThan(0);
    for (const card of pokemon) {
      expect(mapApiCard(card).nationalPokedexNumbers!.length).toBeGreaterThan(0);
    }
  });
});
