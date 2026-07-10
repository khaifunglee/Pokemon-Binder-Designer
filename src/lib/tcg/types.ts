/**
 * Subset of the pokemontcg.io v2 response shapes that we ingest.
 * Fields we don't store are omitted; the API returns more.
 */

export interface ApiSet {
  id: string;
  name: string;
  series: string;
  printedTotal: number;
  total: number;
  releaseDate: string; // "YYYY/MM/DD"
  ptcgoCode?: string;
  images?: {
    symbol?: string;
    logo?: string;
  };
}

export interface ApiCard {
  id: string;
  name: string;
  number: string;
  rarity?: string;
  supertype: string;
  types?: string[];
  nationalPokedexNumbers?: number[];
  set: { id: string };
  images?: {
    small?: string;
    large?: string;
  };
  tcgplayer?: {
    prices?: Record<string, unknown>;
  };
}
