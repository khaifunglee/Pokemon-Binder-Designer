# PokéBinder — Pokémon TCG Binder Designer (Mobile App)

## What this app is

A mobile app for Pokémon card collectors to design, visualize, and organize digital
replicas of their physical card binders. Primary user: a collector with physical
binders who wants to (a) track their collection and (b) organize binders in different
ways to view it differently. Two binder kinds:
- **Template binders** have a scope (set, Pokédex range, or artist) with a fixed pocket
  per card. They fill automatically from `collection`, showing owned cards in colour
  and missing cards in black & white.
- **Collection binders** hold only the cards you place, sorted by energy type, colour
  gradient, rarity, Pokédex, master set or custom.

Core loop: import or check off what you own → template binders fill themselves →
organize collection binders → keep the real binder in sync (mirror capture + physical
re-sort move list). Competitors: pkmnbindr.com, binderforge.com, pkmn.gg, Collectr.
Differentiators: mobile-native drag & drop, offline-first, template binders, a real
colour-gradient sort, and "mirror my real binder" with a physical re-sort move list.
Product decisions and per-feature verdicts: `docs/idea.md` (concept review 2026-11-22).

## Tech stack (do not substitute without asking)

- React Native + Expo (managed workflow), TypeScript (strict mode)
- Reanimated 4 (+ react-native-worklets, pinned to the exact version the Expo SDK bundles) + react-native-gesture-handler — ALL animations/gestures on UI thread via worklets
- @shopify/react-native-skia — page-turn, sleeve, and shuffle animations
- Zustand — app state
- expo-sqlite + Drizzle ORM — local database (single source of truth)
- TCGdex (api.tcgdex.net, free, keyless) — card metadata, images + TCGplayer prices; cache aggressively
  (migrated from pokemontcg.io in M5, 2026-07-19, user-approved).
  - Catalogue metadata is bulk-synced from the **GraphQL** endpoint (`/v2/graphql`, one query per set).
  - **Prices** come only from REST `/v2/en/cards/{id}`, because GraphQL has no pricing.
  - **Exclude TCG Pocket (digital-only) sets** everywhere.
- No backend, no auth, no cloud sync in MVP. Offline-capable, single-device.

## Architecture rules

- Offline-first: every read/write hits local SQLite first. UI must NEVER block on network.
- Card metadata (names, set, number, rarity, variants, dexId, illustrator) is synced
  into SQLite once at onboarding, then new sets are picked up at app start. Images are
  lazy-loaded and disk-cached (expo-file-system or expo-image cache).
- Prices are fetched only when a template binder's stats are opened, for that binder's
  cards, with a 24h TTL. Checklists and collection binders make no price requests.
- Heavy work (re-sorting, diffing, import parsing, colour extraction) runs off the UI thread.
  Animations run as fixed-cost proxies (~20 sprites, or the visible page's cards at most),
  never per-card for large binders.
- Separate concerns in the binder model:
  - `kind` (template | collection) + `template_scope` (what a template covers)
  - `sort_strategy` (collection binders: energy-type, colour-gradient, pokedex, rarity, master-set, custom)
  - `visual_theme` (aesthetics: cover image, accent colours)
    These are independent fields. Never conflate them.

## Data model (core)

- `binders`: id, name, layout (2x2 | 3x3 | 3x4 | 4x4), kind (template | collection),
  template_scope (nullable; e.g. set + complete/master, Pokédex range, artist),
  sort_strategy, visual_theme, variant_stacking (bool, collection binders only),
  created_at, updated_at
- `pages`: id, binder_id, page_index
- `slots`: id, page_id, slot_index, card_id (nullable = empty pocket), variant,
  quantity, condition (nullable)
- `cards` (from TCGdex): id, name, set_id, number, rarity, supertype, types[], dex_ids[],
  illustrator (nullable), image_small_uri, image_large_uri, variants[]
- `collection`: card_id, variant, quantity_owned (source of truth for "what I own").
  Template binders and checklists are both views over it.
- `kind`, `template_scope`, `dex_ids` and `illustrator` are planned (roadmap steps 2 and 5).
  The merged-slot columns were removed in roadmap step 1 (migration 0004). Until each planned
  change lands, `src/db/schema.ts` is the truth.

## UX quality bars (measurable, non-negotiable)

- Add a card to a binder in ≤ 3 steps
- Reorganize an entire collection binder in 2 taps: pick a sort, see a preview, tap Apply.
  The card-move animation plays while the re-sort computes off-thread, so the animation
  is the loading state. (Changed from 1 tap on 2026-11-22, for preview → Apply.)
- 60fps on animations — profile on low-end Android, not just simulator

## MVP scope — build ONLY these (in order)

M0–M5 are built. The 2026-11-22 concept review gave each feature a verdict; see the
table in `docs/idea.md`. Current work follows its roadmap, and each step gets
plan → approval → tested commits:

1. Cleanup + quick fixes:
   - remove merged pockets + custom images, the Pokédex gaps prompt and `pokedexGaps` setting, and the TCGdex migration
   - exclude TCG Pocket sets
   - fix PNG export
2. Catalogue onboarding:
   - GraphQL bulk sync with progress and offline retry
   - store `illustrator` and `dex_ids`
   - variants derived from price keys as well as flags
   - missing-image placeholders
3. Local backup / restore of the SQLite file, through the share sheet (no backend).
4. CSV import adapters, one per platform: Collectr → TCGplayer → pkmnbindr, each
   locked against a real export from the user.
5. Template binders:
   - set (complete / master) → Pokédex (generation or range) → artist
   - black-and-white missing pockets, auto-fill from `collection`, "put new card here" list
   - no drag & drop in templates
6. Template stats / cost-to-complete, labelled as TCGplayer estimates with a date.
7. Collection binders:
   - split colour into energy type + colour gradient (hue from card image, cached)
   - preview → Apply with the per-page card-move animation
   - page deletion, the rarity ladder fix, and the stale re-sort plan warning
8. Device test pass: mirror capture + physical re-sort on real binders, and the 60fps
   pass with imported Collectr data.

Still in scope from M0–M4: binder CRUD and layouts, picker and search, drag & drop with
haptics, tap-to-place and edge auto-flip (collection binders), page-turn and sleeve
animations, variant stacking (collection binders), checklists, mirror capture (collection
binders), and the re-sort diff engine and move list.

## Explicitly OUT of scope (do not build, do not scaffold)

- Accounts, auth, cloud sync, backend of any kind (Phase 2)
- Shareable web links (Phase 2 — PNG export only in MVP)
- AI features: theme/binder recommendations, aesthetic auto-layout (Phase 2)
- Camera card scanning / ML recognition (Phase 3; top of the backlog after MVP)
- Cut on 2026-11-22, now backlog only: merged slots + custom slot images, the Pokédex
  gaps prompt, the pokemontcg.io → TCGdex migration
- Backlog, not to be built yet: "master set by Pokémon" template, want lists for
  collection binders, cameo cards, checklist rapid-tap lag fix
- Prices anywhere except template binder stats

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
- `npm run lint` — ESLint (eslint-config-expo flat config in `eslint.config.js`); the PostToolUse hook lints each edited file and blocks on errors (warnings pass)

## Gotchas

- Never `npm audit fix --force`: it jumps Expo SDK majors and breaks Metro, tsc and Jest
  at once. Plain `npm audit fix` is safe; remaining findings are build tooling only.
- SDK 54 is pinned on purpose (Expo Go). `react-native-worklets` must be EXACTLY the
  version in `node_modules/expo/bundledNativeModules.json` (0.5.1 on SDK 54) — re-check on any SDK change.
- Don't add `expo-image` to `app.json` plugins on SDK 54 (no config plugin; breaks start/export).
- Roadmap and decisions: `docs/idea.md`. Code map: `docs/architecture.md`. Build log: `PROGRESS.md`.
