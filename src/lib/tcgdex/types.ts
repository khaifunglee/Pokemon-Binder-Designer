/**
 * Subset of TCGdex v2 response shapes we consume (api.tcgdex.net).
 * Verified against live payloads 2026-07-19; fields we ignore omitted.
 */

export interface DexSetBrief {
  id: string; // e.g. "me04"
  name: string;
  logo?: string; // asset base URL, extension appended at use
  symbol?: string;
  cardCount: { total: number; official: number };
}

export interface DexCardBrief {
  id: string; // e.g. "me04-003"
  localId: string; // collector number, e.g. "003"
  name: string;
  image?: string; // asset base URL
}

export interface DexSetDetail extends DexSetBrief {
  releaseDate?: string; // "YYYY-MM-DD"
  serie?: { id: string; name: string };
  abbreviation?: { official?: string };
  cards: DexCardBrief[];
}

export interface DexPriceEntry {
  lowPrice?: number | null;
  midPrice?: number | null;
  marketPrice?: number | null;
}

export interface DexCardDetail {
  id: string;
  localId: string;
  name: string;
  category: string; // "Pokemon" | "Trainer" | "Energy"
  rarity?: string;
  types?: string[];
  dexId?: number[];
  image?: string;
  set: { id: string };
  variants?: {
    normal?: boolean;
    reverse?: boolean;
    holo?: boolean;
    firstEdition?: boolean;
  };
  pricing?: {
    tcgplayer?: {
      unit?: string;
      updated?: string;
    } & Record<string, DexPriceEntry | string | undefined>;
  };
}
