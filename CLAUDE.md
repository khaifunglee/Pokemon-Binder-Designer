# PokéBinder — Pokémon TCG Binder Designer (Mobile App)

## What this app is

A mobile app for Pokémon card collectors to design, visualize, and organize digital
replicas of their physical card binders. Core loop: create a binder → add cards
(search, checklist, or CSV import) → auto-organize by a chosen theme → track
collection completion. Competitors: pkmnbindr.com, binderforge.com, pkmn.gg.
Differentiators: mobile-native drag & drop, offline-first, "mirror my real binder"
mode with a physical re-sort move list.

## Tech stack (do not substitute without asking)

- React Native + Expo (managed workflow), TypeScript (strict mode)
- Reanimated 4 (+ react-native-worklets, pinned to the exact version the Expo SDK bundles) + react-native-gesture-handler — ALL animations/gestures on UI thread via worklets
- @shopify/react-native-skia — page-turn, sleeve, and shuffle animations
- Zustand — app state
- expo-sqlite + Drizzle ORM — local database (single source of truth)
- TCGdex (api.tcgdex.net, free, keyless) — card metadata, images + TCGplayer prices; cache aggressively
  (migrated from pokemontcg.io in M5, 2026-07-19, user-approved)
- No backend, no auth, no cloud sync in MVP. Offline-capable, single-device.

## Architecture rules

- Offline-first: every read/write hits local SQLite first. UI must NEVER block on network.
- Card metadata (names, set, number, rarity, variants) is ingested into SQLite;
  images are lazy-loaded and disk-cached (expo-file-system or expo-image cache).
- Heavy work (re-sorting, diffing, import parsing) runs off the UI thread.
  Animations run as fixed-cost proxies (~20 sprites), never per-card for large binders.
- Separate concerns in the binder model:
  - `sort_strategy` (logic: master-set, colour, pokedex, rarity, custom)
  - `visual_theme` (aesthetics: cover image, accent colours)
    These are independent fields. Never conflate them.

## Data model (core)

- `binders`: id, name, layout (2x2 | 3x3 | 3x4 | 4x4), sort_strategy, visual_theme,
  variant_stacking (bool), created_at, updated_at
- `pages`: id, binder_id, page_index
- `slots`: id, page_id, slot_index, card_id (nullable = empty pocket), variant,
  quantity, condition (nullable), merged_group_id (nullable), custom_image_uri (nullable)
- `cards` (from TCGdex): id, name, set_id, number, rarity, supertype, types[],
  image_small_uri, image_large_uri, variants[]
- `collection`: card_id, variant, quantity_owned (source of truth for "what I own")
- Merged slots: adjacent slots sharing a merged_group_id render as one region
  (for custom images / oversized aesthetics).

## UX quality bars (measurable, non-negotiable)

- Add a card to a binder in ≤ 3 steps
- Reorganize an entire binder in 1 tap (shuffle animation plays while re-sort
  computes off-thread; animation is the loading state)
- 60fps on animations — profile on low-end Android, not just simulator

## MVP scope — build ONLY these (in milestone order)

- M0: project setup, DB schema + Drizzle migrations, card data ingestion + image cache
- M1: binder CRUD, layout picker, card search/browse by set, drag & drop
  (long-press pickup, haptics, tap-to-place fallback, edge auto-scroll),
  page navigation + page-turn animation, variant-stacking toggle
- M2: set checklists with rapid multi-tap toggles; CSV import
  (TCGplayer / pkmnbindr / Collectr formats); sort themes; one-tap auto-organize
  - shuffle animation; merged slots + custom slot images
- M3: per-binder completion % + missing-card list; cost-to-complete via price data;
  sleeve/slide-in animation; 60fps profiling pass; export binder page as PNG
- M4: "mirror mode" — page-by-page capture of a physical binder (with skip-slot);
  re-sort diff engine that outputs a minimal, human-followable move list
  (batch moves like "shift slots 5–9 right by one")

## Explicitly OUT of scope (do not build, do not scaffold)

- Accounts, auth, cloud sync, backend of any kind (Phase 2)
- Shareable web links (Phase 2 — PNG export only in MVP)
- AI features: theme/binder recommendations, aesthetic auto-layout (Phase 2)
- Camera card scanning / ML recognition (Phase 3)

## Conventions

- TypeScript strict; no `any` without a justifying comment
- Feature-folder structure: `src/features/<feature>/` with components, hooks, logic co-located
- Business logic (sorting, diffing, import parsing) in pure, unit-tested functions
  under `src/lib/` — no React imports there
- Tests: Jest for lib logic (sorting, diff engine, CSV parsers are the priority);
  don't chase UI test coverage in MVP
- Commits: conventional commits (feat:, fix:, chore:), one logical change per commit
- Run `npx tsc --noEmit` and tests before declaring any milestone task done

## Commands

- `npm ci` — install from lockfile (prefer over `npm install`)
- `npx expo start` — dev server
- `npx tsc --noEmit` — typecheck
- `npm test` — unit tests
- `npx drizzle-kit generate` — DB migrations
- `npx expo export --platform ios` — bundle smoke test (catches Metro resolution errors)
- `npx expo install --check` — Expo SDK version alignment (currently flags expo-file-system 19.0.23 vs ~19.0.24)
- Lint: none — no ESLint configured; `tsc` is the only static check

## Gotchas

- Never `npm audit fix --force`: it jumps Expo SDK majors and breaks Metro, tsc and Jest
  at once. Plain `npm audit fix` is safe; remaining findings are build tooling only.
- SDK 54 is pinned on purpose (Expo Go). `react-native-worklets` must be EXACTLY the
  version in `node_modules/expo/bundledNativeModules.json` (0.5.1 on SDK 54) — re-check on any SDK change.
- Don't add `expo-image` to `app.json` plugins on SDK 54 (no config plugin; breaks start/export).
- Roadmap and decisions: `docs/idea.md`. Code map: `docs/architecture.md`. Build log: `PROGRESS.md`.
