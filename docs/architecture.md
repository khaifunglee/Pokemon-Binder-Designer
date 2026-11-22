# PokéBinder — Architecture

Snapshot as of 2026-11-17 (commit `d94e6e1`). `CLAUDE.md` holds the product
rules and `PROGRESS.md` holds the detailed build log. This doc is the map
that sits between them.

## 1. What the repo does

PokéBinder is an offline-first **React Native / Expo mobile app** for Pokémon TCG
collectors. It mirrors physical card binders digitally:

- Create binders with a pocket layout (2x2 / 3x3 / 3x4 / 4x4) and pages.
- Fill pockets with cards: search or browse by set, drag & drop, tap-to-place,
  CSV import (TCGplayer / pkmnbindr / Collectr), or **mirror capture**, which
  walks a real binder pocket by pocket.
- **Auto-organize** a whole binder in one tap by a sort strategy (master-set,
  colour, Pokédex, rarity, custom). A shuffle animation covers the compute time.
- Track the collection: per-set checklists, completion %, missing cards, and
  cost-to-complete from TCGplayer market prices converted to a display currency.
- **Physical re-sort**: diff the current layout against the sorted target and
  output a minimal, human-followable move list ("shift pockets 5–9 right by
  one", swaps, rings), so you can re-sort the real binder.
- Variant stacking and PNG export of a page.

There is no backend, no accounts, and no sync. Everything lives in on-device SQLite.

## 2. Tech stack

| Area | Choice | Notes |
|---|---|---|
| Runtime | Expo SDK **54** (managed), React Native 0.81.5, React 19.1 | Pinned to 54 deliberately to match the user's Expo Go client (see PROGRESS.md "Notable deviations") |
| Language | TypeScript ~5.9, strict | |
| Navigation | React Navigation 7, native stack | Single stack defined in `App.tsx` |
| Animation / gestures | Reanimated **4.1** (+ `react-native-worklets` pinned to exactly **0.5.1**), Gesture Handler 2.28 | CLAUDE.md says Reanimated 3, but SDK 54 requires 4. Worklets must match Expo Go's native build |
| Canvas animation | `@shopify/react-native-skia` 2.2 | Page-turn and shuffle overlays (fixed-cost sprites). The sleeve slide-in is Reanimated-only |
| State | Zustand | Only for transient cross-screen UI signals (`src/state/uiStore.ts`). Persistent state is SQLite |
| Database | `expo-sqlite` + Drizzle ORM 0.45, drizzle-kit for migrations | WAL mode, FK on, change listener drives live queries |
| Card data + prices | **TCGdex** (`api.tcgdex.net/v2/en`), free, no key | Migrated from pokemontcg.io in M5. CLAUDE.md still names pokemontcg.io |
| FX rates | frankfurter.dev (ECB), no key | 24h TTL cache |
| Other Expo modules | expo-image (disk cache), expo-file-system (legacy API), expo-document-picker, expo-image-picker, expo-haptics, expo-sharing, expo-crypto; react-native-view-shot | |
| Tests | Jest 29 via `jest-expo` preset | Pure-logic tests only |

## 3. Structure

```
App.tsx                 Startup gate (useDbReady) + navigation stack (10 screens)
index.ts                Expo entry
drizzle/                SQL migrations 0000–0003 + migrations.js (bundled into the app)
drizzle.config.ts       drizzle-kit config (dialect sqlite, driver expo)
babel/metro config      Inline-import .sql files so migrations ship in the bundle
src/
  db/                   SQLite access layer + app services (impure, async, take a Db)
    schema.ts           Drizzle tables (source of truth for the data model)
    client.ts           Opens pokebinder.db, WAL + foreign keys, exports `db`
    hooks.ts            useDbReady: migrations → bg catalog refresh
    ingest.ts           Sets catalog + per-set card/price ingestion from TCGdex (no TCG Pocket)
    binders.ts cards.ts slots.ts            CRUD for binders/pages, card queries, pocket ops
    organize.ts movePlan.ts                 Auto-organize + physical re-sort plan
    importService.ts collectionService.ts   CSV import apply, owned-collection writes
    stackingService.ts statsService.ts      Variant (un)stacking, completion/cost stats
    ratesService.ts                         FX rates + display currency (app_settings)
  lib/                  PURE logic, no React, Jest-tested (the important code)
    binder/             layout, provision, dnd, stacking, sort, organize (packed sorts),
                        completion, diff (move engine), moveText (phrasing)
    import/             csv (RFC 4180 parser), formats (header detection), resolve (card matching)
    tcgdex/             api client (6-wide pooled fetch), types, mappers, filter (Pocket exclusion)
    search.ts currency.ts
  features/             UI, one folder per feature (screens + co-located helpers)
    binders/            list, binder spread (PageGrid, DragOverlay, PageTurnOverlay,
                        ShuffleOverlay), stats, mirror capture, move list
    cards/              card picker (sets → cards), image cache helpers, placement
    checklist/          per-set checklists with optimistic multi-tap toggles
    import/             CSV import flow
  navigation/types.ts   RootStackParamList (typed route params)
  state/uiStore.ts      Zustand: "last placed pocket" signal for the sleeve animation
```

The layering rule: `features/` calls `db/` services, `db/` services call pure
`lib/` functions, and `lib/` imports nothing from React or the DB.

## 4. Data flow

### Data model (`src/db/schema.ts`)

- **Catalog (from TCGdex):** `sets` (with `cards_ingested_at`), `cards`
  (variants, types, and dex numbers stored as JSON), `card_prices` (card_id + variant →
  `market_usd`, `fetched_at`; kept separate because prices are volatile).
- **User data:** `binders` (layout, `sort_strategy`, `visual_theme`, and
  `variant_stacking`; strategy and theme are independent fields) → `pages` → `slots`.
  An empty pocket is a real row with `card_id = null`. Every pocket is movable.
- **`collection`** (card_id + variant → quantity) is the source of truth for
  ownership, independent of binder placement.
- **Support:** `exchange_rates` and `app_settings` (display currency).

### Startup

```
App → useDbReady
  1. useMigrations (drizzle/*.sql)                     — blocks UI until done
     (0004 is the one-time step 1 wipe of user data + catalogue)
  2. ready → render navigation
  3. background: ingestSets() — look up TCG Pocket set ids (series tcgp), diff the
     set list without them, fetch details for new sets only, and keep only details
     that name a non-Pocket series. Lookup fails → skip sync.
```

### Reads: offline-first and reactive

Screens read through Drizzle `useLiveQuery` (BinderList, the binder spread via
`useBinderSpread`, the picker, and checklists). The SQLite change listener re-runs
those queries after any write, so the UI never waits on the network. It only
reflects what is local.

### Card ingestion (lazy, per set)

```
Picker/Checklist opens set → ensureSetCards(setId)
  if sets.cards_ingested_at is null (or force ↻):
    TCGdex set detail → per-card details (pooled, progress callback)
    → mappers (variants, images, prices) → one transaction upserts cards + card_prices + set
Images: URIs stored in SQLite, loaded lazily and disk-cached by expo-image.
Prices: refreshSetPrices re-ingests when older than 24h (PRICE_TTL_MS).
```

### Writes: user actions

- **Place / move / clear a card:** `features/cards/placement.ts` or the drag
  gesture → `db/slots.ts` (`placeCard`, `swapSlotContents`, …), then `lib/binder/stacking`
  decides stack vs. new pocket. The live query re-renders, and `uiStore.notePlacement`
  triggers the sleeve animation on that pocket only.
- **Auto-organize:** a tap starts `ShuffleOverlay` immediately →
  `db/organize.prepareOrganize` loads pockets and cards → `lib/binder/sort` +
  `organize.planOrganize` produce only the changed pockets → one transaction →
  binder `sort_strategy` is recorded. The overlay has a minimum duration and acts
  as the loading state.
- **Physical re-sort:** `db/movePlan.computeMovePlan` reuses `prepareOrganize`
  for the target → `lib/binder/diff.computeMoves` + `batchInstructions` →
  `moveText` phrasing → `MoveListScreen` checklist → "Done" commits via
  `autoOrganize`. It reaches the same target because the planning is deterministic.
- **CSV import:** document picker → `lib/import/csv` → `formats` (detect format)
  → `resolve` (match set/card/variant, collect per-line problems) → preview →
  `importService.applyImport` fills empty unpinned pockets, grows the binder, and
  upserts `collection`.
- **Checklist toggles:** optimistic override map in the screen. Writes are
  serialized through a promise queue, and overrides clear only when the DB echo
  matches.
- **Stats:** `statsService.computeBinderStats` joins slots, collection, the full
  set checklists, and prices → `lib/binder/completion`. Currency conversion
  happens only at display time (USD is canonical).

### Performance notes

- The expo-sqlite driver runs queries **synchronously on the JS thread**.
  `runOrganize` yields about 80ms after starting the shuffle so the overlay can mount.
- Animations are fixed-cost: about 16 Skia sprites for the shuffle and one sheet for
  the page turn, never per card.
- Drag edge-dwell is checked in a `useFrameCallback` worklet, not on finger
  movement.

## 5. How to run and test

```bash
npm ci                    # clean install from the lockfile (don't use `npm audit fix --force`, see below)
npx expo start            # dev server; open in Expo Go **SDK 54** on device
npm test                  # Jest: 16 suites / 123 tests, all in src/lib/**/__tests__
npx tsc --noEmit          # typecheck (also: npm run typecheck)
npx drizzle-kit generate  # after editing src/db/schema.ts → new drizzle/*.sql + migrations.js
npx expo export --platform ios   # bundle smoke test (catches Metro resolution errors)
npx expo install --check         # Expo-SDK version alignment check
```

- **Lint:** `npm run lint` runs ESLint with Expo's flat config (`eslint.config.js`).
  `tsc` remains the type check.
- Tests cover pure logic only: sort, organize, diff, moveText, stacking,
  layout, dnd, provision, completion, CSV/format/resolve, search, currency, and the
  TCGdex mappers, api and filter. No UI or DB-service tests. Migration 0004 has its
  own check: `bash scripts/verify-migration-0004.sh <scratch-dir>`.
- **Dependency pitfalls** (from PROGRESS.md and this session):
  - `npm audit fix --force` jumps Expo to 58 and breaks Metro, tsc, and Jest at
    once. Plain `npm audit fix` is safe. The remaining findings (postcss,
    image-size, minimatch) are in build tooling and need an SDK upgrade to clear.
  - `react-native-worklets` must stay exactly `0.5.1` for SDK 54. On any SDK change,
    read `node_modules/expo/bundledNativeModules.json`.
  - Don't add `expo-image` to `app.json` plugins on SDK 54.

## 6. What's unfinished

The MVP (M0–M4) and M5 are code-complete, and roadmap step 1 (cleanup) removed merged
pockets, custom images, the Pokédex gaps option and the TCGdex migration. The roadmap
in `docs/idea.md` lists what's next.

**Needs device testing**
- **Step 1 fresh start.** Migration 0004 wipes binders, collection and the
  catalogue on first launch; the app starts empty and re-downloads the set list
  (no TCG Pocket sets).
- **60fps profiling pass:** not done. It needs a real (ideally low-end
  Android) device. The checklist is in PROGRESS.md under M3.
- **Price accuracy:** not yet spot-checked against tcgplayer.com.

**Known gaps and design cuts**
- The pkmnbindr and Collectr CSV formats are **reconstructed guesses**. Real
  export files are needed to lock the format signatures and fixtures.
- Import + stacking only stacks within the import batch, not onto existing pockets.
- Page deletion isn't built (the drag code assumes pages don't shrink mid-drag).
- Under TCGdex, the exact-match rarity ladder may mis-order within a bucket
  (cosmetic only).
- Physical re-sort assumes the binder isn't edited digitally mid-checklist.

**Release prep (not started)**
- Icons and splash, `app.json` metadata (the bundle id is still
  `com.anonymous.pokebinder`), EAS build.
- An SDK upgrade path off 54. It's blocked on the user's Xcode, and Expo Go
  auto-updating past 54 will stop the app loading.

**Doc drift to fix**
- CLAUDE.md still says Reanimated 3 and pokemontcg.io.
- PROGRESS.md's "Known upstream data limitation" section describes
  pokemontcg.io and is superseded by M5. Its M0 section references the removed
  `src/lib/tcg/`, `devSeed.ts`, and `scripts/`.
- The `schema.ts` comment says `releaseDate` uses "YYYY/MM/DD", but TCGdex gives
  "YYYY-MM-DD" (or `''` when missing).

**Housekeeping and security notes**
- `.gitignore` covers `.env` and `.env.*` (with `.env.example` kept committed).
  Nothing uses secrets today because both APIs are keyless.
