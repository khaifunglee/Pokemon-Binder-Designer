# Roadmap Step 2: Catalogue Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Download the whole non-Pocket catalogue once at first launch over TCGdex GraphQL, with progress and retry. Store `illustrator`. Fix variants:
- from REST price keys, via a resumable background top-up
- a weekly re-check for cards with no prices
- manual variants added by the user

Also keep recent sets fresh at app start, show a name/number placeholder for missing images, and remove per-card REST and prices from the checklist, picker and import.

**Architecture:**
- Decisions live in pure, tested functions in `src/lib/`:
  - variant merge rules
  - sync planning (which sets or cards are due)
  - the GraphQL client and its response guards
  - a progress throttle
- `src/db/catalogueSync.ts` orchestrates them against SQLite and reports to a Zustand status store plus `[catalogue]` console lines.
- Set rows keep coming from the existing REST `ingestSets` (Pocket guarantees unchanged). Only card data moves to GraphQL.
- `cards.variants` stays the single column every screen reads. Every writer recomputes it with `mergeVariants`.

**Tech Stack:** Expo SDK 54, TypeScript strict, Drizzle ORM 0.45 + drizzle-kit 0.31 (expo driver), expo-sqlite, Zustand 5, expo-image, Jest (jest-expo). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-23-step2-catalogue-onboarding-design.md`

## Global Constraints

- **Git:**
  - Work on branch `feat/step2-catalogue` (exists, holds the spec). Never commit to `master`; don't push.
  - Conventional commits, one logical change per commit. Every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Code rules:**
  - TypeScript strict; no `any` without a justifying comment.
  - `src/lib/` has no React imports. New logic gets Jest tests written first.
  - No dependency changes. Never `npm audit fix --force`.
- **Gate:** each task leaves `npx tsc --noEmit`, `npm test` and `npm run lint` (0 errors) passing before its commit. The PostToolUse hook lints each edited file. In zsh, quote globs.
- **TCGdex endpoints and concurrency:**
  - GraphQL endpoint: `https://api.tcgdex.net/v2/graphql`, POST JSON, at concurrency **4**, with a **30 s** per-request timeout (AbortController).
  - REST stays at concurrency **6**.
  - Card data comes from `cards(filters: { id: "<setId>-" })` and is filtered to `card.set.id === setId`. Nested `set { cards }` is shallow, so never use it.
- **TCG Pocket:** card data is only fetched for sets already in SQLite. `ingestSets` puts them there, with its Pocket lookup, `selectSetsToFetch` and `isKnownNonPocketSet`. Don't change those rules.
- **Prices (D19):**
  - Prices are never displayed or stored outside the stats path.
  - The variant top-up discards prices.
  - Only the `tcgplayer` block is read, never `cardmarket`.
- **Price key aliases:** `PRICE_KEY_MAP` gains `reverse → reverseHolofoil` and `holo → holofoil`. `unit` and `updated` are not variants.
- **Card rows** are upserted, never deleted. Never modify `collection`, `slots`, `pages` or `binders` in sync code.
- **Timing constants:**
  - re-check window: **90 days**
  - daily re-check throttle: **24 h** (`catalogueRecheckedAt`)
  - unpriced-card re-check: **7 days**
  - recent placeholder set top-up re-run: at most every **7 days**
  - UI progress throttle: **250 ms**
- **`app_settings` keys:** `catalogueOnboardedAt`, `catalogueRecheckedAt` (ISO strings).
- **Logging:**
  - `console.log('[catalogue] …')` only when `__DEV__`; failures also `console.warn('[catalogue] …')` in all builds.
  - Never log response bodies.
- **UI copy** (spec §8, as given):
  - "Downloading one-time card database…"
  - "Downloading card database… {done} of {total} sets"
  - "Couldn't download the card catalogue. Check your connection."
  - "{n} sets couldn't download"
  - "Checking for card updates in the background…"
  - "Downloading per-card details for {set name}… {done} of {total} sets"
  - "Downloading per-card details for this set…"
  - Onboarding also says it's a one-time download of about 7 MB.

## Decisions taken here (spec builder's calls, flagged for the user)

1. **Set rows stay on REST `ingestSets`, cards move to GraphQL.** The GraphQL `Set` type
   has no `abbreviation`, so `ptcgo_code` (used by CSV import) would be lost. Keeping
   `ingestSets` keeps every Pocket guarantee untouched. So no `SETS_QUERY` is written.
2. **`cards_ingested_at` keeps its name and now means "GraphQL-synced"**, instead of
   adding `synced_at`. Only `syncSetCards` writes it. Migration 0005 clears it.
3. **Raw flags are stored (`cards.flag_variants`).** Without them, a manual variant
   removal or a top-up can't recompute `variants` correctly. This replaces the spec's
   remark that "the raw flags aren't kept". `sets.placeholder_flags` stays, for cheap
   queries.
4. **Recent placeholder sets re-run the top-up at most weekly**, not every day (me06 is
   141 requests).
5. **No monthly back-off** for sets that never have prices. Weekly is ~1,000 requests,
   about 3 minutes of background work.
6. **The stats path stops upserting card metadata** from REST. It writes prices plus the
   variant columns only, so it can't regress `illustrator` or names. `mapCardDetail`,
   `mapCardBrief`, `ensureSetCards` and `upsertSetPayload` go away.

## Review Focus

1. **GraphQL returns HTTP 200 with an `errors` array, or `data.cards` missing:** that
   set counts as failed, and is never marked synced with zero cards. Task 2 tests
   `postGraphql` and `fetchSetCards` for both.
2. **A set whose query returns 0 cards although `sets.total > 0`** (upstream hiccup):
   it must not be marked synced, and it's retried at the next start. Task 3:
   `isPlausibleSetPayload`.
3. **A re-sync after the top-up**, for placeholder flags plus stored price variants:
   the reverse holo stays. Task 1 `mergeVariants` test, used by Task 5's
   `syncSetCards`.
4. **App killed during onboarding:** the relaunch resumes, and synced sets are skipped.
   Task 3 tests `setsToSync` with a mix.
5. **A set with an empty `release_date` ('')** is never "recent", and a malformed date
   doesn't throw. Task 3 tests `setsToRecheck`.

---

### Task 0: Baseline

**Files:** none

- [ ] **Step 1:** `git switch feat/step2-catalogue && git status --short`. Expected: clean, HEAD `f437d24` or later.
- [ ] **Step 2:** `npm test && npx tsc --noEmit && npm run lint`. Expected: 156 tests pass; lint 0 errors (2 known warnings in `src/navigation/types.ts`).

---

### Task 1: Variant rules (pure)

**Files:**
- Create: `src/lib/tcgdex/variants.ts`
- Test: `src/lib/tcgdex/__tests__/variants.test.ts`
- Modify: `src/lib/tcgdex/mappers.ts`:
  - export `PRICE_KEY_MAP`
  - add the aliases `reverse` and `holo`
  - add `sortVariants`

**Interfaces:**
- Produces:
  - `sortVariants(variants: Iterable<string>): string[]`: dedupes, orders by `KNOWN_VARIANTS`, unknown ones last (alphabetical). In `mappers.ts`.
  - `priceVariants(tcgplayer: Record<string, unknown> | undefined | null, onUnknownKey?: (key: string) => void): string[]`: the variant keys present (an object value, regardless of price), mapped through `PRICE_KEY_MAP`, sorted. Returns `[]` when the block is missing or has no variant keys. `unit` and `updated` are skipped silently. Other unmapped keys call `onUnknownKey`.
  - `mergeVariants(input: { flags: string[]; prices: string[] | null; manual: string[]; inUse: string[] }): string[]`
  - `isPlaceholderFlagSet(flagsPerCard: string[][]): boolean`
  - `addableVariants(current: string[]): string[]`: the `KNOWN_VARIANTS` not in `current`, in order.
  - `removableManualVariants(manual: string[], inUse: string[]): string[]`

- [ ] **Step 1: Write the failing tests.** `variants.test.ts`, with these exact cases:
  - `priceVariants({ unit: 'USD', updated: 'x', normal: {}, 'reverse-holofoil': { marketPrice: null } })` → `['normal', 'reverseHolofoil']`. Presence counts, even with no price.
  - `priceVariants({ normal: {}, reverse: {} })` → `['normal', 'reverseHolofoil']` (legacy alias, as on `swsh3-136` in 2025-08).
  - `priceVariants({ holo: {} })` → `['holofoil']`.
  - `priceVariants(undefined)` → `[]`, and `priceVariants({ unit: 'USD', updated: 'x' })` → `[]`.
  - `priceVariants({ normal: {}, 'mystery-foil': {} }, spy)` → `['normal']`, and `spy` is called with `'mystery-foil'`.
  - `mergeVariants` cases:

    | Case | `flags` | `prices` | `manual` | `inUse` | Result |
    |---|---|---|---|---|---|
    | sm1-1 | `['normal']` | `['normal','reverseHolofoil']` | `[]` | `[]` | `['normal','reverseHolofoil']` |
    | xy1-1 | `['normal']` | `['holofoil']` | `[]` | `[]` | `['holofoil']` |
    | sv01-001 | `['normal','reverseHolofoil']` | `['normal','reverseHolofoil']` | | | same |
    | union | `['holofoil']` | `['holofoil','reverseHolofoil']` | | | `['holofoil','reverseHolofoil']` |
    | sm1-166 | `['normal']` | `[]` | | | `['normal']` |
    | not checked | `['normal']` | `null` | | | `['normal']` |
    | manual on unpriced | `['normal']` | `[]` | `['reverseHolofoil']` | | `['normal','reverseHolofoil']` |
    | in use survives | `['normal']` | `['holofoil']` | `[]` | `['normal']` | `['normal','holofoil']` |
    | never empty | `[]` | `null` | `[]` | `[]` | `['normal']` |
    | re-sync after top-up | `['normal']` | `['normal','reverseHolofoil']` | `[]` | `[]` | `['normal','reverseHolofoil']` (Review Focus 3) |
  - `isPlaceholderFlagSet([['normal'], ['normal']])` → `true`; `([['normal'], ['holofoil']])` → `false`; `([])` → `false`.
  - `addableVariants(['normal', 'reverseHolofoil'])` → `['holofoil', '1stEditionNormal', '1stEditionHolofoil', 'unlimited', 'unlimitedHolofoil']`.
  - `removableManualVariants(['reverseHolofoil', 'holofoil'], ['holofoil'])` → `['reverseHolofoil']`.
  - `sortVariants(['reverseHolofoil', 'normal', 'normal', 'zzz'])` → `['normal', 'reverseHolofoil', 'zzz']`.
  - Extend `mappers.test.ts`: `extractPrices({ pricing: { tcgplayer: { reverse: { marketPrice: 0.23 } } } })` → `[{ variant: 'reverseHolofoil', marketUsd: 0.23 }]`.
- [ ] **Step 2:** `npx jest src/lib/tcgdex`. Expected: FAIL (module not found / alias missing).
- [ ] **Step 3: Implement.** `mergeVariants` is decided by the table:
  - `base` is the prices when `prices` is non-empty and `flags` is exactly `['normal']`
  - otherwise `base` is the union of `flags` and `prices ?? []`
  - the result is `sortVariants(base ∪ manual ∪ inUse)`, or `['normal']` if that's empty
- [ ] **Step 4:** `npx jest src/lib/tcgdex`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: variant merge rules from flags, price keys, manual and in-use variants`.

---

### Task 2: GraphQL client + card mapper (pure, mocked fetch)

**Files:**
- Create: `src/lib/tcgdex/graphql.ts`, `src/lib/tcgdex/queries.ts`
- Modify: `src/lib/tcgdex/types.ts` (add `GqlCard`), `src/lib/tcgdex/mappers.ts` (add `mapGraphqlCard`), `src/lib/tcgdex/api.ts` (add `pooledSettled`)
- Test: `src/lib/tcgdex/__tests__/graphql.test.ts`, extend `mappers.test.ts` and `api.test.ts`

**Interfaces:**
- Consumes: `deriveVariants`, `cardImageUris`, `mapCategory` (existing).
- Produces:
  - `GqlCard`: `{ id: string; localId: string; name: string; rarity?: string | null; category: string; types?: string[] | null; dexId?: number[] | null; illustrator?: string | null; image?: string | null; set: { id: string }; variants?: { normal?: boolean; reverse?: boolean; holo?: boolean; firstEdition?: boolean } | null }`
  - `SET_CARDS_QUERY`: in `queries.ts`. A named query with `$prefix: String!` that selects exactly the `GqlCard` fields, via `cards(filters: { id: $prefix })`. If TCGdex rejects the variable inside the filter object, inline the escaped prefix instead (set ids are `[A-Za-z0-9.-]+`; assert that before inlining).
  - `GRAPHQL_URL = 'https://api.tcgdex.net/v2/graphql'`
  - `postGraphql<T>(query: string, variables?: Record<string, unknown>): Promise<T>`: returns `data`. Throws on non-OK status, on a non-empty `errors` array (using the first error's `message`), on missing `data`, and on the 30 s timeout.
  - `fetchSetCards(setId: string): Promise<{ cards: GqlCard[]; dropped: number }>`: keeps only entries that pass `isGqlCard` and have `set.id === setId`. Malformed entries count as `dropped`, while other sets' cards are silently ignored.
  - `isGqlCard(value: unknown): value is GqlCard`: requires string `id`, `localId`, `name` and `category`, and a string `set.id`.
  - `mapGraphqlCard(card: GqlCard): CardInsert & { flagVariants: string[] }`: `variants` is initially `deriveVariants(card)` (the caller re-merges). It also sets `illustrator: card.illustrator ?? null`, `nationalPokedexNumbers: card.dexId ?? []` and `types: card.types ?? []`.
  - `pooledSettled<T, R>(items: T[], worker: (item: T) => Promise<R>, concurrency: number, onProgress?: (done: number, total: number) => void): Promise<PromiseSettledResult<R>[]>`: order-preserving, and never rejects.
- [ ] **Step 1: Write the failing tests.**
  - `postGraphql`:
    - rejects with `'Cannot query field'` when the body is `{ errors: [{ message: 'Cannot query field "x"' }], data: null }` with status 200
    - rejects on `{ data: undefined }`
    - rejects with `'503'` on status 503
    - posts to `GRAPHQL_URL` with `content-type: application/json`
  - `fetchSetCards('30th')`: given cards `30th-1` (set `30th`), `30th-c-1` (set `30th-c`) and `{ id: 5 }`, it returns `{ cards: [30th-1], dropped: 1 }`.
  - `fetchSetCards` rejects when `data.cards` isn't an array (Review Focus 1).
  - `mapGraphqlCard`:
    - the `me06-001` sample (`dexId: null`, `image: null`, `illustrator: 'Satoshi Ito'`, flags normal) → `illustrator: 'Satoshi Ito'`, `nationalPokedexNumbers: []`, `imageSmallUri: null`, `flagVariants: ['normal']`, `supertype: 'Pokémon'`
  - `pooledSettled`: with one rejecting worker out of three, it returns `[fulfilled, rejected, fulfilled]` in input order. With concurrency 2, no more than 2 workers are in flight at once (count with a counter).
- [ ] **Step 2:** `npx jest src/lib/tcgdex`. Expected: FAIL.
- [ ] **Step 3: Implement** the signatures above.
  - The `postGraphql` timeout uses `AbortController` + `setTimeout(30_000)`, cleared in `finally`.
  - `pooledSettled` follows `pooledFetch`'s worker loop, wrapping each call in try/catch.
- [ ] **Step 4:** `npx jest src/lib/tcgdex`. Expected: PASS.
- [ ] **Step 5:** Smoke-check the real query once from the shell (not committed). Build it from `SET_CARDS_QUERY` with prefix `"sm1-"`, then `curl` it to `GRAPHQL_URL`. Expected: 149 or more `sm1` cards with `illustrator` present. If the variable form errors, switch to the inline form and re-run the tests.
- [ ] **Step 6:** Commit: `feat: TCGdex GraphQL client and per-set card query`.

---

### Task 3: Sync planning + progress throttle (pure)

**Files:**
- Create: `src/lib/tcgdex/syncPlan.ts`, `src/lib/throttle.ts`
- Test: `src/lib/tcgdex/__tests__/syncPlan.test.ts`, `src/lib/__tests__/throttle.test.ts`

**Interfaces:**
- Produces (every `now` is injected; no `Date.now()` inside):
  - `RECHECK_WINDOW_DAYS = 90`, `DAY_MS = 86_400_000`, `RECHECK_INTERVAL_MS = DAY_MS`, `UNPRICED_RECHECK_MS = 7 * DAY_MS`, `TOPUP_RERUN_MS = 7 * DAY_MS`
  - `setsToSync(sets: { id: string; total: number; cardsIngestedAt: Date | null }[]): string[]`: sets not yet ingested, with `total > 0`.
  - `isPlausibleSetPayload(cardCount: number, expectedTotal: number): boolean`: false only when `cardCount === 0 && expectedTotal > 0`.
  - `isDue(lastRunIso: string | null, now: Date, intervalMs: number): boolean`: true when the timestamp is null or unparseable.
  - `isRecent(releaseDate: string, now: Date, windowDays?: number): boolean`
  - `setsToRecheck(sets: { id: string; releaseDate: string; missingImages: number }[], now: Date): string[]`: recent sets, or sets with `missingImages > 0`.
  - `setsNeedingTopUp(sets: { id: string; placeholderFlags: boolean; variantsCheckedAt: Date | null }[]): string[]`
  - `topUpsToReopen(sets: { id: string; releaseDate: string; placeholderFlags: boolean; variantsCheckedAt: Date | null }[], now: Date): string[]`: recent placeholder sets checked over `TOPUP_RERUN_MS` ago.
  - `cardsDuePriceRecheck(cards: { id: string; priceVariants: string[] | null; priceCheckedAt: Date | null }[], now: Date): string[]`: `priceVariants` is `[]` and it was checked over 7 days ago (or never).
  - `createThrottle(intervalMs: number, clock?: () => number): (force?: boolean) => boolean`: true on the first call, then at most once per interval. `force` (the final progress tick) is always true.
- [ ] **Step 1: Write the failing tests.** `now = new Date('2026-11-23T00:00:00Z')`.
  - `setsToSync` (Review Focus 4): `[{a, total 10, ingested}, {b, 10, null}, {c, 0, null}]` → `['b']`.
  - `isPlausibleSetPayload(0, 141)` → false; `(0, 0)` → true; `(141, 141)` → true; `(120, 141)` → true (Review Focus 2).
  - `isDue(null, now, DAY_MS)` → true; `('garbage', …)` → true; 23 h ago → false; 25 h ago → true.
  - `isRecent('2026-11-06', now)` → true; `('2025-01-01', now)` → false; `('', now)` → false; `('not-a-date', now)` → false (Review Focus 5).
  - `setsToRecheck`: `me06` (recent, 141 missing) and `sm3.5` (old, 78 missing) are included; `sv01` (old, 0 missing) isn't.
  - `setsNeedingTopUp`: only placeholder sets with null `variantsCheckedAt`.
  - `topUpsToReopen`: a recent placeholder set checked 8 days ago is included; one checked 6 days ago isn't; an old placeholder set checked a year ago isn't.
  - `cardsDuePriceRecheck`: `[]` + 8 days → due; `[]` + 6 days → not; `null` → not (that's the top-up's job); `['normal']` → not.
  - `createThrottle(250, clock)`: calls at t = 0, 100, 260 → true, false, true; `force` at t = 270 → true.
- [ ] **Step 2:** `npx jest syncPlan throttle`. Expected: FAIL.
- [ ] **Step 3: Implement.** `isRecent` parses `YYYY-MM-DD` as UTC and returns false on `NaN` or a future date beyond today.
- [ ] **Step 4:** `npx jest syncPlan throttle`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: catalogue sync planning and progress throttle`.

---

### Task 4: Schema + migration 0005

**Files:**
- Modify: `src/db/schema.ts`
- Create (generated): `drizzle/0005_step2-catalogue.sql`, `drizzle/meta/0005_snapshot.json`; modified: `drizzle/meta/_journal.json`, `drizzle/migrations.js`
- Create: `scripts/verify-migration-0005.sh`

**Interfaces:**
- Produces, on `cards`:
  - `illustrator: text('illustrator')`
  - `flagVariants: text('flag_variants', { mode: 'json' }).$type<string[]>().notNull().default(sql\`'[]'\`)`
  - `priceVariants: text('price_variants', { mode: 'json' }).$type<string[] | null>()`
  - `priceCheckedAt: integer('price_checked_at', { mode: 'timestamp_ms' })`
  - `manualVariants: text('manual_variants', { mode: 'json' }).$type<string[]>().notNull().default(sql\`'[]'\`)`
- Produces, on `sets`:
  - `placeholderFlags: integer('placeholder_flags', { mode: 'boolean' }).notNull().default(false)`
  - `variantsCheckedAt: integer('variants_checked_at', { mode: 'timestamp_ms' })`
  - update `cardsIngestedAt`'s doc comment to "set by the GraphQL per-set sync (step 2)"
- [ ] **Step 1:** Edit `schema.ts`, then `npx drizzle-kit generate --name step2-catalogue`. Expected: `0005_step2-catalogue.sql` with seven `ALTER TABLE … ADD` statements, and `migrations.js` importing `m0005`. If it doesn't, add both by hand, following the `m0004` lines.
- [ ] **Step 2:** Append to the generated SQL (with a `--> statement-breakpoint` before it):
  ```sql
  -- Roadmap step 2: every set re-downloads over GraphQL (illustrator, raw flags).
  UPDATE `sets` SET `cards_ingested_at` = NULL;
  ```
- [ ] **Step 3:** Write `scripts/verify-migration-0005.sh`, modelled on `verify-migration-0004.sh` (same usage, `set -euo pipefail`, sqlite3 only):
  - apply 0000–0004
  - insert a set with `cards_ingested_at = 1`, a card, a binder → page → slot holding the card, and a collection row
  - apply 0005
  - check:
    - `cards_ingested_at IS NULL` for every set
    - `manual_variants = '[]'` and `flag_variants = '[]'` on the existing card
    - `placeholder_flags = 0`
    - the slot and collection row counts are unchanged (1 each)
    - `illustrator`, `price_variants`, `price_checked_at` and `variants_checked_at` exist and are NULL
  - print `migration 0005 OK`
- [ ] **Step 4:** `bash scripts/verify-migration-0005.sh "$TMPDIR/m0005"`. Expected: `migration 0005 OK`. Run it once before Step 2's edit too. Expected: FAIL on the `cards_ingested_at` check, which proves the check bites.
- [ ] **Step 5:** `npx tsc --noEmit && npm test && npm run lint && npx expo export --platform ios --output-dir "$TMPDIR/export-check"`. Expected: all pass.
- [ ] **Step 6:** Commit: `feat: migration 0005 adds illustrator and variant-source columns`.

---

### Task 5: Catalogue sync service + status store

**Files:**
- Create: `src/db/appSettings.ts`, `src/db/catalogueSync.ts`, `src/state/syncStore.ts`, `src/lib/catalogueLog.ts`
- Modify: `src/db/ingest.ts`:
  - keep `ingestSets`, `upsertSets`, `PRICE_TTL_MS`, `refreshSetPrices` and `listIngestedSetIds`
  - remove `ensureSetCards` and `upsertSetPayload`
  - add `applyRestDetails`
- Modify: `src/lib/tcgdex/mappers.ts` and its tests: remove `mapCardDetail` and `mapCardBrief` once no caller remains

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - `getSetting(db: Db, key: string): Promise<string | null>`, `setSetting(db: Db, key: string, value: string): Promise<void>` (upsert)
  - `logCatalogue(message: string): void` (`__DEV__` only), `warnCatalogue(message: string, error?: unknown): void`. The message prefix is `[catalogue] `. Errors log `error.message` only.
  - `useSyncStore`:
    - state `{ phase: 'idle' | 'onboarding' | 'onboarding-error' | 'checking' | 'topup' | 'resync'; message: string | null; done: number; total: number; failedSetIds: string[] }`
    - actions `setStatus(partial)` and `setIdle()`
  - `syncSetCards(db: Db, setId: string): Promise<{ cards: number; placeholderFlags: boolean }>`
  - `topUpSet(db: Db, setId: string): Promise<void>`
  - `applyRestDetails(db: Db, details: DexCardDetail[], opts: { storePrices: boolean }): Promise<void>`
  - `runOnboarding(db: Db): Promise<{ failedSetIds: string[] }>`
  - `markOnboarded(db: Db): Promise<void>`, `isOnboarded(db: Db): Promise<boolean>`
  - `runVariantTopUp(db: Db): Promise<void>`
  - `runStartupSync(db: Db, now?: Date): Promise<void>`
  - `resyncSet(db: Db, setId: string): Promise<void>`

- [ ] **Step 1:** `appSettings.ts`, `catalogueLog.ts`, `syncStore.ts`, following the `uiStore.ts` pattern. `setIdle()` resets to `{ phase: 'idle', message: null, done: 0, total: 0 }`, keeping `failedSetIds`.
- [ ] **Step 2:** `applyRestDetails` in `ingest.ts`. In one transaction, for each detail:
  - read the card's `manual_variants` and its in-use variants (distinct `collection.variant` ∪ non-null `slots.variant` for that card)
  - `flags = deriveVariants(detail)`, `prices = priceVariants(detail.pricing?.tcgplayer, onUnknownKey)`
  - update `flag_variants`, `price_variants`, `price_checked_at = now` and `variants = mergeVariants(...)`
  - only when `storePrices`, upsert `card_prices` from `extractPrices` (as today)
  - **never** touch `cards_ingested_at` or the card's metadata columns
  - `onUnknownKey` collects keys into a set, logged once per call as `[catalogue] unknown price keys: a, b`
- [ ] **Step 3:** `refreshSetPrices` keeps its TTL check. On refresh it becomes:
  1. `fetchSetDetail(setId)`
  2. `fetchCardDetails(ids)`
  3. `applyRestDetails(db, details, { storePrices: true })`

  Remove `ensureSetCards` and `upsertSetPayload`, then fix the importers (`tsc` lists them; Task 7 rewrites the UI callers). In this task, replace the UI calls with nothing: delete the `ensureSetCards` call lines in `ChecklistScreen`, `PickerCardsScreen` and `importService`, so the build stays green.
- [ ] **Step 4:** `syncSetCards`:
  1. `fetchSetCards(setId)`. If `!isPlausibleSetPayload(cards.length, set.total)`, throw `Error('set ${setId} returned no cards')`.
  2. Map each card with `mapGraphqlCard`.
  3. In one transaction, load the set's existing `price_variants`, `manual_variants` and in-use variants (one query each, keyed by card id).
  4. Upsert the cards, with `flag_variants = flagVariants` and `variants = mergeVariants({ flags, prices: stored price_variants ?? null, manual, inUse })`. The metadata columns update; `price_variants`, `price_checked_at` and `manual_variants` are **not** in the conflict update list.
  5. Set `sets.placeholder_flags = isPlaceholderFlagSet(flags)` and `cards_ingested_at = now`.
  6. Log `[catalogue] synced ${setId} (${n} cards)` and, when `dropped > 0`, `dropped ${dropped} malformed cards`.
- [ ] **Step 5:** `topUpSet`:
  1. `fetchSetDetail` → `fetchCardDetails` (with progress logging every 10 cards: `[catalogue] variant top-up ${setId}: ${done}/${total} cards`)
  2. `applyRestDetails(…, { storePrices: false })`
  3. set `variants_checked_at = now`
  4. log `[catalogue] ${setId} +${variant} on ${n} cards` for each variant gained across the set (compare `variants` before and after)

  `runVariantTopUp`:
  - loop `setsNeedingTopUp` sequentially
  - status `{ phase: 'topup', message: 'Downloading per-card details for ${name}… ${i} of ${n} sets' }`
  - per-set failures go through `warnCatalogue` and the loop continues
  - offline (the first failure is a network `TypeError`) stops the loop
  - `setIdle()` at the end
- [ ] **Step 6:** `runOnboarding`:
  1. status `'Downloading one-time card database…'`
  2. `await ingestSets(db)`. If it throws, set `phase: 'onboarding-error'` and rethrow.
  3. Run `setsToSync` over the set rows through `pooledSettled(…, syncSetCards, 4, throttled progress)`. Progress: `'Downloading card database… ${done} of ${total} sets'`; force the final tick.
  4. Collect the rejected ids into `failedSetIds`. If none failed, call `markOnboarded`.
  5. Return them.

  `markOnboarded` writes `catalogueOnboardedAt = now.toISOString()`.
- [ ] **Step 7:** `runStartupSync(db, now = new Date())`, all inside try/catch with `warnCatalogue`:
  1. status `'Checking for card updates in the background…'`
  2. `ingestSets`
  3. sync `setsToSync` (concurrency 4)
  4. if `isDue(catalogueRecheckedAt, now, RECHECK_INTERVAL_MS)`:
     - re-sync `setsToRecheck` (missing images = count of cards with null `image_small_uri`, grouped by set)
     - clear `variants_checked_at` for `topUpsToReopen`
     - run `applyRestDetails(storePrices: false)` for `cardsDuePriceRecheck`, in pooled batches of 6
     - log `[catalogue] re-check: ${n} sets (recent or missing images)`
     - set `catalogueRecheckedAt` only if all of that succeeded
  5. `runVariantTopUp`
  6. log `[catalogue] up to date`, then `setIdle()`
- [ ] **Step 8:** `resyncSet`:
  - status `{ phase: 'resync', message: 'Downloading per-card details for this set…' }`
  - log `[catalogue] resync ${setId} (manual)`
  - `syncSetCards`, then `topUpSet` when the result's `placeholderFlags` is true
  - `setIdle()` in `finally`
  - rethrow, so the UI can alert
- [ ] **Step 9:** `npx tsc --noEmit && npm test && npm run lint`. Expected: pass, with mapper tests for the removed functions deleted. No Jest tests here, because `src/db` runs against expo-sqlite, which Jest can't load. The decisions are covered by Tasks 1–3, and behaviour by the Task 10 Simulator check.
- [ ] **Step 10:** Commit: `feat: catalogue sync over GraphQL with variant top-up and status store`.

---

### Task 6: Onboarding screen + startup gate

**Files:**
- Create: `src/features/catalogue/OnboardingScreen.tsx`
- Modify: `src/db/hooks.ts`, `App.tsx`

**Interfaces:**
- Consumes: `runOnboarding`, `markOnboarded`, `isOnboarded`, `runStartupSync`, `runVariantTopUp`, `useSyncStore`.
- Produces:
  - `useDbReady(): { ready: boolean; error: Error | null; onboarded: boolean | null; finishOnboarding: () => void }`
  - `OnboardingScreen({ onFinished }: { onFinished: () => void })`

- [ ] **Step 1: `useDbReady`.**
  - After migrations succeed, read `isOnboarded`.
  - If true, fire `runStartupSync(db)` (not awaited).
  - `finishOnboarding` sets `onboarded = true` and fires `runVariantTopUp(db)`. It does **not** run the startup sync, because onboarding just did that work.
  - Remove the old `ingestSets(db).catch(() => {})` effect.
- [ ] **Step 2: `App.tsx`.**
  - While `onboarded === null`, render the blank gate (as today).
  - When `false`, render `<OnboardingScreen onFinished={finishOnboarding} />` instead of the navigator.
- [ ] **Step 3: `OnboardingScreen` states**, all driven by `useSyncStore` plus local state:
  - **running:** message, `done / total`, a progress bar (a plain `View` with a width %), and "One-time download, about 7 MB."
  - **error** (`runOnboarding` threw): "Couldn't download the card catalogue. Check your connection." and **Retry**, which calls `runOnboarding` again.
  - **partial** (`failedSetIds.length > 0`): "{n} sets couldn't download", with **Retry** (runs again; it resumes) and **Continue anyway** (`markOnboarded` → `onFinished`).
  - **success:** `onFinished()`.
  - Start `runOnboarding` on mount, guarded so it starts only once.
- [ ] **Step 4:** `npx tsc --noEmit && npm test && npm run lint && npx expo export --platform ios --output-dir "$TMPDIR/export-check"`. Expected: pass.
- [ ] **Step 5:** Commit: `feat: first-launch catalogue onboarding with retry and resume`.

---

### Task 7: Browsing without per-card REST; checklist without prices; status line

**Files:**
- Create: `src/features/catalogue/SyncStatusLine.tsx`
- Modify:
  - `src/features/checklist/ChecklistScreen.tsx`
  - `src/features/cards/PickerCardsScreen.tsx`
  - `src/db/importService.ts`
  - `src/features/binders/BinderListScreen.tsx`
  - `src/features/checklist/ChecklistSetsScreen.tsx`
  - `src/features/cards/PickerSetsScreen.tsx` (the "· downloaded" label keeps reading `cardsIngestedAt`; no change needed beyond a check)

**Interfaces:**
- Consumes: `resyncSet`, `useSyncStore`.
- Produces: `SyncStatusLine()`. It renders `message` (plus a small `ActivityIndicator`) when `phase` is `checking`, `topup` or `resync`, and nothing otherwise.

- [ ] **Step 1: `ChecklistScreen`:**
  - Remove the `downloading` state, the `ensureSetCards` effect (already removed in Task 5), the `cardPrices` query, `priceLabels`, the `priceLabel` prop and its text, and the unused imports (`cardPrices`, `ratesService`, `currency`).
  - The empty state becomes: "This set hasn't downloaded yet. It will retry next time the app starts."
  - ↻ calls `resyncSet(db, setId)`. On failure, `Alert.alert('Re-sync failed', message)`.
  - Render `<SyncStatusLine />` above the list.
- [ ] **Step 2: `PickerCardsScreen`:** read `listSetCards` only. Its empty-state text matches the checklist's.
- [ ] **Step 3: `importService`:** no network. A set with no local cards turns its rows into problems with the detail `set not downloaded yet: <name>`.
- [ ] **Step 4:** Add `<SyncStatusLine />` at the top of `BinderListScreen` and `ChecklistSetsScreen`.
- [ ] **Step 5:** `npx tsc --noEmit && npm test && npm run lint`. Expected: pass. Then `grep -rn "ensureSetCards\|priceLabel" src`. Expected: no matches.
- [ ] **Step 6:** Commit: `feat: browse sets offline from the catalogue and drop checklist prices`.

---

### Task 8: Missing-image placeholder (`CardFace`)

**Files:**
- Create: `src/features/cards/CardFace.tsx`
- Modify:
  - `src/features/binders/PageGrid.tsx` (`PocketFace`)
  - `src/features/binders/DragOverlay.tsx`
  - `src/features/checklist/ChecklistScreen.tsx` (row thumbnail)
  - `src/features/cards/PickerCardsScreen.tsx`
  - `src/features/binders/MirrorCaptureScreen.tsx`
  - the pocket view-model builder (`useBinderSpread.ts` / `PocketVM`): add `cardNumber`

**Interfaces:**
- Produces: `CardFace(props: { name: string | null; number: string | null; imageUri: string | null; style: StyleProp<ViewStyle>; contentFit?: 'cover' | 'contain'; transition?: number })`

- [ ] **Step 1: Implement `CardFace`.**
  - It keeps a `failed` state, reset when `imageUri` changes.
  - When `imageUri && !failed`, it renders the expo-image `Image` with `CARD_IMAGE_CACHE_POLICY`, `onError={() => setFailed(true)}` and `accessibilityLabel={name ?? 'card'}`.
  - Otherwise it renders a `View` at aspect ratio 63/88, with a light grey fill and a border, showing `name` (2 lines max, centred) and `#number`.
  - The font sizes scale with the tile, using the `onLayout` width, so 4x4 pockets stay legible. Clamp the name between 7 and 14 pt.
  - Use plain `View` + `Text`: no Skia, no animation.
- [ ] **Step 2:** Replace the five `Image` card faces with `CardFace`, keeping each site's existing size, style, `contentFit` and `transition`. Set logos and symbols stay as `Image`.
- [ ] **Step 3:** `npx tsc --noEmit && npm test && npm run lint`. Expected: pass.
- [ ] **Step 4:** Commit: `feat: name and number placeholder for cards without an image`.

---

### Task 9: Add a variant by hand

**Files:**
- Create: `src/db/variantService.ts`
- Modify: `src/features/checklist/ChecklistScreen.tsx` (row long-press, "added by you" marker)

**Interfaces:**
- Consumes: `addableVariants`, `removableManualVariants`, `mergeVariants` (Task 1); `variantLabel`.
- Produces:
  - `addManualVariant(db: Db, cardId: string, variant: string): Promise<void>`: throws if `variant` isn't in `KNOWN_VARIANTS`, or is already in the card's `variants`.
  - `removeManualVariant(db: Db, cardId: string, variant: string): Promise<void>`: throws `VariantInUseError` (exported class) if the variant is in `collection` or `slots` for the card. It's a no-op if the variant isn't manual.
  - Both run in one transaction: read the card's `flag_variants`, `price_variants`, `manual_variants` and in-use variants, write the new `manual_variants` and `variants = mergeVariants(...)`, and log `[catalogue] manual variant ${cardId} ${'+' | '-'}${variant}`.

- [ ] **Step 1: Add tests first** to `variants.test.ts`, for the pure guard `canAddManualVariant(variant: string, current: string[]): boolean`. Create it in `variants.ts`:
  - `('reverseHolofoil', ['normal'])` → true
  - `('normal', ['normal'])` → false
  - `('sparkly', ['normal'])` → false

  Run: `npx jest variants`. Expected: FAIL, then implement it, then PASS.
- [ ] **Step 2:** Implement `variantService.ts` using `canAddManualVariant` and `removableManualVariants`.
- [ ] **Step 3: Checklist row `onLongPress`** opens `Alert.alert(cardTitle, undefined, buttons)`, where `buttons` is:
  - "Add variant", which opens a second alert listing `addableVariants(card.variants)` by `variantLabel`. Picking one calls `addManualVariant`. The live query shows the row.
  - for each variant in `card.manualVariants`:
    - "Remove {label}". On `VariantInUseError`, alert: "You own or have placed this variant. Remove it from your collection and binders first."
  - Cancel

  The row subtitle appends ` · added by you` when `card.manualVariants.includes(variant)`. That's 3 steps: long-press → Add variant → pick.
- [ ] **Step 4:** `npx tsc --noEmit && npm test && npm run lint`. Expected: pass.
- [ ] **Step 5:** Commit: `feat: add or remove a card variant by hand from the checklist`.

---

### Task 10: Docs, full gate, Simulator checkpoint

**Files:**
- Modify: `CLAUDE.md`, `docs/architecture.md`, `docs/idea.md`, `PROGRESS.md`

- [ ] **Step 1: Docs.**
  - **`CLAUDE.md`:**
    - data model: `cards` gains `illustrator`, `flag_variants`, `price_variants`, `price_checked_at` and `manual_variants`, and `sets` gains `placeholder_flags` and `variants_checked_at`
    - note `dex_ids` = `national_pokedex_numbers`
    - drop "planned" for `dex_ids` and `illustrator`
    - architecture rules: first-launch GraphQL onboarding, the background top-up and the daily re-check
  - **`docs/architecture.md`:** `catalogueSync.ts`, the sync status store, `CardFace`, `variants.ts` / `syncPlan.ts`, and the removal of `ensureSetCards`.
  - **`docs/idea.md`:** under D18, record that variants = flags + REST price keys (background top-up, user choice B), plus the weekly unpriced re-check and manual variants (user choice 1 + 3, 2026-11-23), with the 44-set / 24%-unpriced measurements.
  - **`PROGRESS.md`:**
    - update the status line
    - add a step 2 entry: what was built, the decisions in this plan's "Decisions taken here", and how to verify
- [ ] **Step 2: Full gate.**
  `npm test && npx tsc --noEmit && npm run lint && npx expo export --platform ios --output-dir "$TMPDIR/export-check" && bash scripts/verify-migration-0004.sh "$TMPDIR/m0004" && bash scripts/verify-migration-0005.sh "$TMPDIR/m0005"`. Expected: all pass.
- [ ] **Step 3:** Commit: `docs: record step 2 catalogue onboarding`.
- [ ] **Step 4: CHECKPOINT. Ask the user** to run the spec's Simulator check (Verification, items 1–10) with `npx expo start`, watching the Metro log for `[catalogue]` lines:
  1. First launch with Wi-Fi off → error message + Retry.
  2. Wi-Fi on → Retry → progress to ~202 sets.
  3. Kill the app mid-download and relaunch → it resumes.
  4. No TCG Pocket sets.
  5. `sv01` checklist: normal + reverse rows, no prices, opens instantly.
  6. `sm1` / `xy1`: reverse holos once the top-up status line finishes.
  7. `me06`: placeholders in the checklist and a binder pocket; reverse holo after the top-up.
  8. Picker and drag & drop work with placeholder cards.
  9. `sm1` #166: long-press → Add variant → Reverse Holo. Removal is refused while owned. The variant survives ↻ and a relaunch.
  10. Binder stats still show prices.

  Fix what they report (with `superpowers:systematic-debugging`) before finishing the branch.
