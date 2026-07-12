-- Force every set's cards to refetch on next open: sets downloaded during
-- a pokemontcg.io hiccup could be missing tcgplayer data, leaving all
-- their cards with a single fallback variant. Cards stay usable offline;
-- ensureSetCards refetches (and re-upserts variants) when next reachable.
UPDATE `sets` SET `cards_ingested_at` = NULL;
