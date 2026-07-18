import type { SortStrategy } from '../../db/schema';

export const STRATEGY_LABELS: [Exclude<SortStrategy, 'custom'>, string][] = [
  ['master-set', 'Master set'],
  ['colour', 'Colour'],
  ['pokedex', 'Pokédex'],
  ['rarity', 'Rarity'],
];
