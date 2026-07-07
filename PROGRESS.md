# PROGRESS

Working agreement: CLAUDE.md is authoritative (product, stack, data model,
milestones M0–M4, scope exclusions). Loop per milestone: plan → approval →
small committed steps → `npx tsc --noEmit` + `npm test` green before each
commit. Pure logic in `src/lib/` first, unit-tested before UI. This file must
always be enough for a fresh session to resume.

## Status: M0 COMPLETE — next up: M1 plan (awaiting user approval before implementing)

## Approved decisions (user-confirmed)

- **Schema additions beyond CLAUDE.md's core model**: `sets` table and
  `cards.national_pokedex_numbers` (needed for browse-by-set, checklists,
  pokedex sort).
- **Ingestion strategy**: per-set on demand. Full sets catalog (~173 rows)
  ingested in background at launch; a set's cards fetched once when first
  needed, then offline forever (`sets.cards_ingested_at` marks completion).

## Notable deviations / environment facts

- **Reanimated 4.5, not 3** (CLAUDE.md says 3): Expo SDK 57 / RN 0.86 pairs
  with Reanimated 4; v3 is incompatible with RN 0.86. Worklets API unchanged
  (`react-native-worklets` 0.10 present). Flagged, not yet user-ratified.
- Expo SDK 57, RN 0.86, React 19.2, TS 6.0, drizzle-orm 0.45, jest-expo 57.
- TS 6 needed explicit `"types": ["jest", "node"]` in tsconfig.
- Drizzle `.sql` migrations bundle via `babel-plugin-inline-import` +
  `metro.config.js` sourceExts + `babel-preset-expo` as direct devDependency
  (SDK 57 templates omit babel.config.js; creating one requires the preset).
- Project dir name has spaces → create-expo-app was run in a temp dir and
  moved in. The scaffold's initial commit contains a clobbered CLAUDE.md;
  restored in the next commit (7dab45c).

## M0 — done

- Scaffold: Expo blank-typescript template, strict TS, deps installed,
  Jest via jest-expo (`npm test`), scripts: `test`, `typecheck`.
- Schema `src/db/schema.ts`: binders, pages, slots, cards, collection
  (per CLAUDE.md) + sets. JSON-in-text columns (`types`, `variants`,
  `national_pokedex_numbers`, `visual_theme`) via drizzle json mode.
  Unique indexes: (binder_id, page_index), (page_id, slot_index);
  collection PK (card_id, variant); FK cascades binder→pages→slots.
- Migrations: `drizzle/0000_flimsy_plazm.sql`, applied at startup via
  `useMigrations` in App.tsx. Client `src/db/client.ts` (WAL + foreign_keys
  pragmas, `enableChangeListener` for future live queries).
- Ingestion:
  - `src/lib/tcg/types.ts` — ApiSet/ApiCard subset shapes.
  - `src/lib/tcg/mappers.ts` — pure mappers; `deriveVariants` from tcgplayer
    price keys (canonical order, verbatim key names e.g. `reverseHolofoil`,
    `1stEditionHolofoil`), rarity-heuristic fallback, never empty.
  - `src/lib/tcg/api.ts` — paginated fetch client (pageSize 250, optional
    `EXPO_PUBLIC_POKEMONTCG_API_KEY`).
  - `src/db/ingest.ts` — chunked upserts (`excluded.*`), `ingestSets`,
    `ensureSetCards(db, setId)` (no-op once ingested), `listIngestedSetIds`.
  - Fixtures: `scripts/fetch-fixtures.mjs` → `src/lib/tcg/__fixtures__/`
    (sets.json: 173 sets; cards.cel25.json: 25 cards, checked in).
    `src/db/devSeed.ts` seeds from fixtures in `__DEV__` at launch.
- Image cache: `src/features/cards/images.ts` — expo-image memory-disk
  policy constant, `cardImageUri` size fallback, `prefetchCardImages`.
- Tests: 14 passing (mapper unit tests + fixture-driven API-drift test).
- Verified: `npx expo export` bundles cleanly (migrations + fixtures inline).
  Not yet run on a simulator/device.

## Next: M1 (needs a plan + user approval first)

Binder CRUD, layout picker, card search/browse by set, drag & drop
(long-press pickup, haptics, tap-to-place fallback, edge auto-scroll),
page navigation + page-turn animation (Skia), variant-stacking toggle.
Pure-logic-first candidates: slot/page index math for layouts, search query
building, drag-target resolution.

## Open items / blockers

- Reanimated 4 deviation awaiting user ratification (see above).
- No simulator smoke test yet (`npx expo start` + press i) — first thing
  worth doing in M1; App.tsx shows a sets/cards count as the smoke signal
  (expect 173 sets / 25 cards in dev after seed).
- No API key configured; unauthenticated rate limits are fine for dev.
