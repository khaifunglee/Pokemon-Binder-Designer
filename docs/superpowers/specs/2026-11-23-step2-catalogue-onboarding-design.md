# Roadmap step 2: catalogue onboarding (design)

Status: draft for review, 2026-11-23. Sources:
- `docs/idea.md`: decisions D18 and D19, checklist fixes (a) and (b), roadmap step 2
- the step 1 handoff notes
- live TCGdex measurements taken 2026-11-23 (below)

## Intent

Today the app downloads a set's cards **one card at a time over REST**, the first time
you open that set's checklist, the picker or an import. That takes about 30–60 s per set,
and about 67 minutes for the whole catalogue. Template binders (step 5) need the
**whole catalogue on the device**:
- a Pokédex template spans every set
- an artist template needs `illustrator` on every card

So step 2 downloads the full catalogue **once, up front**, from TCGdex's GraphQL
endpoint.

Step 2 also makes the catalogue **accurate enough to track a master set**:
- every real variant (reverse holo etc.) shows, even where TCGdex's variant flags are wrong
- cards with no image get a readable placeholder

The user is a master-set collector, and checklists are the pillar that beats Collectr.
A checklist missing reverse holos for all of XY and Sun & Moon would fail that.

## What TCGdex actually gives us (measured 2026-11-23)

| Fact | Value |
|---|---|
| Physical (non-Pocket) sets with cards | 202 |
| Physical cards | 21,432 |
| Whole catalogue in one GraphQL query (subset of fields) | 5.4 MB, ~26 s |
| Cards with `illustrator` | 96.6% |
| Pokémon cards without `dexId` | 114 of 17,963 (all 141 Delta Reign cards lack it today) |
| Cards with no image | **1,763 (8.2%)**: e.g. `me06` 141/141, `swsh4.5sv` 122/122, `mep`, `sm3.5`, `sm7.5`, `swsh12.5gg`, trainer kits |
| Sets whose variant flags are **all normal-only** | **44 sets, 4,396 cards**: every main XY set (`xy0`–`xy12`, `xya`, `xyp`), most Sun & Moon sets (`sm1`–`sm8`, `sm12`, `sm115`, `sm3.5`, `sm7.5`, `sma`), `bw8`, `bw9`, `bwp`, `g1`, `dc1`, `det1`, `ex5.5`, `me06`, `mfb`, `ru1`, the XY trainer kits |
| Healthy sets (sampled `sv01`, `me05`, `swsh1`) | flags match the REST price keys exactly |
| REST price keys in the 44 sets | correct: e.g. `sm1-1` → `normal` + `reverse-holofoil`, `xy1-1` → `holofoil` |

GraphQL details that matter for the build:
- `set(id) { cards { … } }` returns **shallow** cards with no variants, illustrator or
  dexId. Per-set card data has to come from
  `cards(filters: { id: "<setId>-" }) { … }`.
- That filter is a **substring match**. For example, `"30th-"` also matches 30 cards of
  another set. So results must be filtered by `card.set.id === setId`. Every card id
  starts with `<setId>-` (0 exceptions).
- `sets { id name releaseDate serie { id name } cardCount { … } logo symbol abbreviation }`
  lists all 221 sets with their series in one query. Every set has a series today.
- GraphQL has **no pricing** (D19). Prices stay on REST `/v2/en/cards/{id}`.
- `variants_detailed` agrees with the flags in the broken sets, so it doesn't help.

**Why REST price keys are the variant fix:** the flags are wrong in 44 sets, but the
TCGplayer price keys on REST card details list the variants that actually exist and sell.
That's what checklist fix (a) asks for: "show every variant TCGdex prices".

## Goals

1. **First-launch onboarding:** a one-time "Downloading card catalogue…" screen with
   progress. It downloads every non-Pocket set's cards from GraphQL, one query per set.
2. **Offline / failure handling:** offline at first launch, or a failed download, shows a
   message and a **Retry** button. No empty set picker with no explanation, which is the
   bug deferred from step 1. Progress is kept: a retry or relaunch resumes, rather than
   starting over.
3. **Store `illustrator`** on cards. `dexId` is already stored, as
   `national_pokedex_numbers` (see "Calls already made").
4. **Variant top-up (option B, chosen by the user):** after onboarding, a one-time
   **background** pass fetches REST card details for the sets whose flags look like
   placeholders. It adds the variants their price keys reveal. It's about 4,400 requests,
   roughly 12 minutes (the earlier 67 min for ~23.9k cards is ≈ 6 cards/s, and
   4,396 ÷ 6 ≈ 730 s). It's resumable, never blocks the UI, and runs once per device per
   affected set.
5. **Keeping the catalogue fresh at app start:**
   - fetch **new** sets
   - re-sync **recent or incomplete** sets: released in the last 90 days, or still with
     cards missing images, at most **once a day**. New sets arrive half-finished (Delta
     Reign today: no images, no dexIds, placeholder flags), and TCGdex fills them in
     later. Without the re-sync, the app would keep the first draft forever.
6. **Missing-image placeholder:** wherever a card face renders, a card with no image URL,
   or whose image fails to load, shows a card-shaped tile with its **name and number**.
7. **TCG Pocket stays excluded**, with every step 1 guarantee intact (see Constraints).
8. **Checklists stop showing prices** (D19). The checklist, picker and import no longer
   download per-card REST data.

## Non-goals

- **Template binders, binder kinds, and black-and-white missing pockets** (step 5). The
  placeholder here is the "no image" fallback only.
- **Merging duplicate illustrator spellings** (step 5, artist template). Store the raw
  string.
- **Pokédex species names** for placeholders (step 5).
- **Template stats / price changes** (step 6). `refreshSetPrices` and the stats screen
  keep working as today. They just must not break the new data (see Design §6).
- **Local backup / restore** (step 3) and **CSV adapters** (step 4).
- **Image prefetching** of the whole catalogue. Images stay lazy (D18).
- **The checklist rapid-tap lag** (backlog).

## Anti-goals (a failure even if it "works")

- **A re-sync undoes the variant top-up.** A daily GraphQL re-sync of a recent set must
  never overwrite variants the top-up added with the placeholder flags again.
- **TCG Pocket sets get in**, through the new GraphQL set list or a set whose series is
  missing.
- **Onboarding that can't finish:** one bad set, or a flaky connection, leaves the user
  on the download screen with no way forward.
- **Onboarding that starts over** after an interruption (app killed, network lost at set
  150 of 202).
- **The UI blocks on the network after onboarding.** The top-up, the daily re-sync and
  new-set checks are all background work.
- **Lost user data.** No catalogue update may delete or change `collection`, `slots`,
  `pages` or `binders`. Card rows are only ever upserted, never deleted, because
  slots and collection reference them.
- **Silent half-states:** "downloaded" shown for a set whose cards aren't actually there.

## Constraints

- **Project rules** (CLAUDE.md):
  - TypeScript strict
  - pure logic in `src/lib/` with Jest tests (TDD for mappers, variant merge and set
    selection)
  - `npx tsc --noEmit`, `npm test`, `npm run lint` and `npx expo export --platform ios`
    pass before the step is done
  - conventional commits on a feature branch, not `master`
- **SDK 54 / Expo Go**, with no new native dependencies. GraphQL is plain `fetch` POST JSON,
  so no GraphQL client library is needed.
- **TCG Pocket guarantees from step 1 must survive** (`src/db/ingest.ts`,
  `src/lib/tcgdex/filter.ts`):
  1. Look up the Pocket series' set ids **before** deciding which sets to fetch, and
     drop them from the candidates.
  2. Keep a set only if its series is **named and isn't `tcgp`** (fail closed).
  3. If the Pocket lookup fails **or returns no ids**, the sync stores nothing.

  The GraphQL `sets` listing includes `serie { id }`, so rule 2 can be checked at listing
  time. Rule 1 (the separate series lookup) still runs, as belt and braces.
- **Migrations:** hand-edited SQL in a drizzle-generated file, with
  `--> statement-breakpoint`, registered in `drizzle/meta/_journal.json` and
  `drizzle/migrations.js`. The expo-sqlite migrator runs pending migrations in one
  transaction. `scripts/verify-migration-0004.sh` is the template for a sqlite3-only check.
- **Considerate use of TCGdex:** keep the existing modest concurrency (6) for REST, and
  similar for GraphQL.
- **Offline-first:** after onboarding, every screen reads SQLite only.

## Approaches considered

### Variant fix (chosen by the user: B)

- **A. Per set, on first open.** Fetch REST details for a placeholder-flag set the first
  time its checklist, picker or import needs it (~30 s wait). It's cheaper on the network,
  but Pokédex and artist templates (step 5) span many sets, so they'd trigger many of
  these at once, and every first open of an XY/SM set waits.
- **B. One-time background top-up after onboarding. (Chosen.)** About 12 minutes of
  background requests, once per device. After that, checklists, templates and imports all
  see correct variants with no waits. It also keeps "open a set" free of network use,
  which fits offline-first.
- *Rejected:* guessing variants from rarity or era rules. It invents data that doesn't
  exist, e.g. reverse holos for sets that had none.

### Catalogue download (decided in D18)

- **One GraphQL query per set (D18). Chosen.** It gives natural progress ("120 of 202
  sets"), per-set atomic writes, and resume by skipping finished sets.
- *Not chosen:* one query for the whole catalogue (~26 s, 5.4 MB). It's faster in the
  best case, but there's no real progress, all-or-nothing on failure, and a single
  ~7 MB JSON parse on the JS thread.
- *Not chosen:* keeping per-card REST (~67 min).

## Design

### 1. Data model: migration 0005

- **`cards.illustrator`**: `text`, nullable.
- **`cards.price_variants`**: `text` (JSON `string[]`), nullable. These are the variants
  found in REST price keys by the top-up or a stats price fetch. `null` means not
  checked yet.
- **`sets.placeholder_flags`**: `integer` boolean, default false. Written on every
  GraphQL sync of the set, from `isPlaceholderFlagSet` on the **fresh payload**. It has
  to be stored because `cards.variants` holds the merged result, so the raw flags aren't
  kept.
- **`sets.variants_checked_at`**: `integer` timestamp, nullable. Set when the top-up has
  finished the set. A set **needs the top-up** when `placeholder_flags` is true and
  `variants_checked_at` is null.
- **`sets.synced_at`**: `integer` timestamp, nullable. The last successful GraphQL
  per-set sync. It replaces `cards_ingested_at` as the meaning of "this set's cards are
  on the device". The builder may instead keep the old column and change its meaning
  (builder's call). Either way, the SQL migration **clears it for every set**, so sets
  ingested lazily over REST in step 1 testing (without illustrator) get re-synced.
- **`app_settings`** rows, no schema change:
  - `catalogueOnboardedAt`: set once every candidate set has synced, or the user chose
    "Continue anyway" (§3)
  - `catalogueRecheckedAt`: the daily throttle (§5)
- **`cards.variants` stays the column every screen reads.** It always holds the merged
  result, `mergeVariants(flagVariants, priceVariants)` (§4), so no read site changes.
- **No user-data changes.** Unlike 0004, 0005 wipes nothing.

### 2. GraphQL client and mappers (`src/lib/tcgdex/`, pure + tested)

- **`graphql.ts`**: `postGraphql<T>(query, variables)` over `fetch`.
  - Throw on a non-2xx status, **and on a non-empty `errors` array**. GraphQL returns 200
    with errors.
  - Validate the response shape before use (it's external input). Drop malformed card
    entries rather than crash, and report the count.
  - Queries live as named constants in one file (versioned with the code):
    - **`SETS_QUERY`**: id, name, releaseDate, `serie { id name }`, cardCount, logo,
      symbol, `abbreviation { official }` if available. If not, keep the REST set detail
      for `ptcgo_code` (builder checks).
    - **`SET_CARDS_QUERY`**: `cards(filters: { id: $prefix })` with id, localId, name,
      rarity, category, types, dexId, illustrator, image, `set { id }`, and
      `variants { normal reverse holo firstEdition }`.
- **Mappers:**
  - `mapGraphqlCard` → `CardInsert`, including `illustrator`
  - `mapGraphqlSet` → `SetInsert`
  - reuse `cardImageUris`, `mapCategory` and `deriveVariants` (flags → our variant keys)
- **`filterSetCards(cards, setId)`**: keeps only `card.set.id === setId`, because of the
  substring match.
- **Variant helpers:**
  - `priceVariants(pricing)`: the variant keys present in a REST `pricing.tcgplayer`
    block. Map them with the existing `PRICE_KEY_MAP`, but count **presence**, not
    price > 0. A listed variant with no current price still exists.
    - **Key names have changed upstream.** Live responses (2026-11-23) use
      `reverse-holofoil`, but older payloads used `reverse` (e.g. `swsh3-136` with
      `updated: 2025-08`). Add the short aliases (`reverse` → `reverseHolofoil`,
      `holo` → `holofoil`) to `PRICE_KEY_MAP`, and ignore `unit` / `updated`.
    - Log unknown keys once per sync (dev only), so a future rename is noticed rather
      than silently dropped.
    - Use only the `tcgplayer` block, never `cardmarket`. Its `-holo` suffix means
      something different in EU listings.
  - `mergeVariants(flags, prices | null)`: the union, in `KNOWN_VARIANTS` order, never
    empty. Two rules:
    - when price data exists and the flags are the placeholder `['normal']`, trust the
      price keys. E.g. `xy1-1` is holofoil-only, so a bare `normal` must not stay.
    - otherwise, take the union.
    - **never drop a variant the user already uses.** The caller passes the variants
      referenced by `collection` or `slots` for that card, and they're always kept.
      Example: during the ~12-minute top-up window the user checks off `xy1-1` "normal",
      then the top-up finds it's holofoil-only. Their row must not be orphaned. It keeps
      showing until they remove it.

    Unit-test this with the measured cases: `sm1-1`, `xy1-1`, `me06-001`, an `sv01` card
    where they agree, a card with no price block, and a dropped variant still in use.
  - `isPlaceholderFlagSet(cards)`: true when every card's derived flags are exactly
    `['normal']`. Today that matches the 44 sets. A few may be genuinely normal-only
    (trainer kits, `mfb`), which is fine, because the top-up just confirms them.

### 3. Onboarding (first launch)

- **Gate in `App.tsx` / `useDbReady`:** once migrations succeed, if
  `catalogueOnboardedAt` is missing, render an **`OnboardingScreen`** instead of the
  navigator.
- **Flow:**
  1. Fetch the Pocket series ids (REST, existing `fetchSeriesSetIds`) and `SETS_QUERY`
     in parallel. If either fails, go to the error state.
  2. Candidates are the listed sets that pass `selectSetsToFetch` (Pocket ids dropped)
     and `isKnownNonPocketSet` (named non-`tcgp` series). Upsert those set rows straight
     away, so set lists can show names. Also skip candidates whose `cardCount.total` is 0.
  3. For each candidate **without `synced_at`** (this is the resume), run
     `SET_CARDS_QUERY` at concurrency ~4. Each set is written in **one transaction**:
     upsert its cards (variants merged with any stored `price_variants`), then set
     `synced_at`.
  4. Progress: "Downloading card catalogue… 120 of 202 sets", with a progress bar.
- **Error state:** "Couldn't download the card catalogue. Check your connection.", with
  **Retry**, which resumes from where it stopped.
- **Partial failure:** if every set was attempted but some failed, show "N sets couldn't
  download" with **Retry** and **Continue anyway**.
  - Continue anyway sets `catalogueOnboardedAt`.
  - The failed sets stay without `synced_at`, so the app-start sync (§5) retries them.
  - **One bad set never traps the user.**
- **Done:** set `catalogueOnboardedAt`, show the app, and start the top-up (§4) in the
  background.
- **Interrupted** (app killed mid-way): next launch shows onboarding again and resumes
  from the sets already synced.
- **UI copy:** say it's a one-time download of about 7 MB, so users on mobile data know.

### 4. Variant top-up (background, option B)

- **Starts** after onboarding completes, and again at each app start until no set needs it.
- **A set needs it** when `sets.placeholder_flags` is true and `variants_checked_at` is
  null (§1).
- **Per set:**
  1. Fetch its card ids' REST details (existing `fetchCardDetails`, concurrency 6).
  2. Compute `priceVariants` for each card.
  3. In one transaction: write `price_variants` and the merged `variants`, then set
     `variants_checked_at`.
- **All-or-nothing per set**, so an interrupted set is simply redone. Offline pauses it
  until the next app start.
- **Prices fetched here are discarded** (D19: prices are fetched for template stats).
  This is a call flagged for the user; see below.
- **Recent sets** (released in the last 90 days) that are still placeholder-flagged get
  `variants_checked_at` cleared by the daily re-check (§5). Their price keys may not have
  existed yet at the last top-up. When a re-sync finds a set's flags are no longer
  placeholders, `placeholder_flags` becomes false and the stored `price_variants` still
  merge in, so nothing is lost.
- **Visibility:** see §8 (progress messages in the UI and the terminal).

### 5. App-start sync (after onboarding)

Run in the background after migrations, replacing today's `ingestSets` call in
`src/db/hooks.ts`:
1. **New and unsynced sets:** the same listing + Pocket lookup + candidate rules as
   onboarding. Sync every candidate without `synced_at`. This covers new releases and
   sets that failed during onboarding.
2. **Daily re-check** (if `catalogueRecheckedAt` is over 24 h old): re-sync sets
   released in the last 90 days, or with any card missing `image_small_uri`.
   - Today that's about 25–45 small queries; most are old sets with permanently missing
     images.
   - Card upserts **merge with the stored `price_variants`**, so the top-up is never
     undone.
   - Card rows are upserted, never deleted. A card TCGdex drops stays in SQLite, because
     slots and collection may reference it.
   - Set `catalogueRecheckedAt` only after a successful pass.
3. **Variant top-up** continues (§4).
- **All failures are silent**: offline is normal, and the next start retries. Same
  Pocket guarantees as onboarding.

### 6. Remove the per-card REST path from browsing

- **`ChecklistScreen`, `PickerCardsScreen`, `importService`:** stop calling
  `ensureSetCards`. Cards are already local after onboarding.
  - If a set has no cards locally (it failed and the user chose Continue anyway), show
    "This set hasn't downloaded yet. It will retry next time the app starts."
  - The checklist's ↻ button becomes "re-sync this set": one GraphQL query, plus a top-up
    of this set if it's placeholder-flagged.
- **Checklist prices removed** (D19): drop the `card_prices` query, `priceLabels` and
  the price text in the row.
- **Stats (`refreshSetPrices`)** keeps its REST per-card fetch for prices (step 6 reworks
  it). Its card upsert must not regress the new data:
  - REST `mapCardDetail` gains `illustrator`
  - REST details also update `price_variants` and the merged `variants`
  - it must not touch `synced_at`
- **`ingestSets`** is replaced by the onboarding and app-start sync. `ensureSetCards`
  shrinks to what stats needs, or is renamed. The PickerSets "· downloaded" label uses
  `synced_at`.
- **Pocket filter helpers** (`filter.ts`) are reused unchanged, and their tests stay.

### 7. Missing-image placeholder

- **New `CardFace` component** in `src/features/cards/`. It takes the card (`name`,
  `number`, image URIs), a size and a style.
  - It renders the expo-image `Image` when there's a URI.
  - It falls back to a card-shaped tile (63:88) with the **name** and **#number**
    centred when the URI is null **or the image fails to load** (`onError`). The second
    case covers sets whose image URLs exist but 404.
  - It keeps `CARD_IMAGE_CACHE_POLICY`.
- **Use it everywhere a card face renders:** `PageGrid` (pocket), `DragOverlay`,
  `ChecklistScreen` row thumbnail, `PickerCardsScreen`, `MirrorCaptureScreen`. Set logos
  and symbols (`PickerSetsScreen`, `ChecklistSetsScreen`) aren't card faces, so leave
  them alone.
- **Rendering cost stays fixed:** a plain `View` + `Text`, no Skia, no per-card animation.

### 8. Progress messages (user request, 2026-11-23)

The user wants to **see what the sync is doing underneath**, both in the app and in the
dev terminal (Metro). Every background stage reports a short status line to **both**:
- a shared sync-status store the UI reads
- `console.log` with a `[catalogue]` prefix

Messages, by stage (exact wording is the builder's call; these are the intent):

| Stage | UI | Terminal |
|---|---|---|
| Onboarding listing | "Downloading one-time card database…" | `[catalogue] listing sets (Pocket lookup + sets query)` |
| Onboarding per set | "Downloading card database… 120 of 202 sets" + bar | `[catalogue] synced sv01 (258 cards) 120/202` |
| Onboarding failure | "Couldn't download… Retry" | `[catalogue] sync failed for sv01: <error>` |
| App-start new sets / daily re-check | "Checking for card updates in the background…" | `[catalogue] re-check: 23 sets (recent or missing images)` |
| Variant top-up | "Downloading per-card details for <set name>… 12 of 44 sets" | `[catalogue] variant top-up sm1: 30/149 cards`, then `sm1 +reverseHolofoil on 112 cards` |
| Checklist ↻ for one set | "Downloading per-card details for this set…" | `[catalogue] resync sm1 (manual)` |
| Idle / done | line hidden | `[catalogue] up to date` |

- **UI placement:**
  - onboarding uses its own screen
  - after onboarding, a slim non-blocking status line on the binder list and checklist
    screens, hidden when idle
  - the checklist shows the per-set message while its ↻ re-sync runs
- **Terminal logging stays in production builds?** Builder's call. Default: log in
  `__DEV__` only, except failures, which also go to `console.warn`.
- **Never log sensitive data.** There is none in this flow (public catalogue ids and
  counts only), but don't log full response bodies either: they're large and noisy.
- **Progress callbacks are throttled** (e.g. at most every ~250 ms or every 10 cards), so
  per-card updates don't re-render the UI thousands of times. That keeps the 60fps rule.

### 9. Where things live

- `src/lib/tcgdex/graphql.ts`, `queries.ts`, and mapper/variant helpers in `mappers.ts`
  (or a new `variants.ts`), with Jest tests. No React imports.
- `src/db/catalogueSync.ts`: onboarding and app-start orchestration, set selection, the
  per-set transaction, the top-up. Pure decisions, like "which sets to re-check", go in
  `src/lib/tcgdex/` so they can be tested.
- `src/features/onboarding/OnboardingScreen.tsx`. The progress state can be a small
  Zustand store or a hook, since the top-up status line needs it outside onboarding too.

## Verification

- **Jest (TDD):**
  - the GraphQL response guards: an `errors` array throws, malformed cards are dropped
  - `mapGraphqlCard` / `mapGraphqlSet`
  - `filterSetCards` (the `30th-` substring case)
  - `priceVariants` (presence, not price > 0)
  - `mergeVariants` (the measured cases above)
  - `isPlaceholderFlagSet`
  - re-check set selection (90-day window, missing images, 24 h throttle, using an
    injectable clock)
  - candidate selection keeps every Pocket guarantee: lookup failure, empty lookup,
    a `tcgp` set, a missing series
- **Migration check:** `scripts/verify-migration-0005.sh`, modelled on 0004's script.
  - Apply 0000–0004, insert sets, cards, slots and collection rows, then apply 0005.
  - Check the new columns exist (nullable), every set's sync marker is cleared, and user
    rows are untouched.
- **Static checks:** `tsc`, lint, Jest and `npx expo export --platform ios` (to a
  scratch `--output-dir`).
- **Simulator check, by the user:**
  1. **First launch with Wi-Fi off:** the error message with Retry.
  2. **Turn Wi-Fi on → Retry:** progress runs to 202 sets.
  3. **Kill the app mid-download and relaunch:** it resumes rather than restarting.
  4. **After onboarding:** no TCG Pocket sets.
  5. **Checklist for `sv01`:** normal + reverse rows, no prices, opens instantly.
  6. **Checklist for `sm1` or `xy1`:** shows reverse holos once the top-up line has
     finished (a few minutes).
  7. **Delta Reign (`me06`):** placeholders with name + number in the checklist and in a
     binder pocket. Its variants include reverse holo after the top-up.
  8. **Picker and drag & drop** still work with placeholder cards.
  9. **Stats for a binder** still show prices.

## Docs to update (same step)

- **`CLAUDE.md`:**
  - data model: `illustrator` added, and `dex_ids` = the existing
    `national_pokedex_numbers` column
  - the onboarding sync description
  - remove "planned" for those two fields
- **`docs/architecture.md`:** catalogue sync, onboarding, top-up, `CardFace`.
- **`docs/idea.md`:** note under D18 that variants come from flags + REST price keys via
  the background top-up (user choice B, 2026-11-23), with the 44-set measurement.
- **`PROGRESS.md`:** the step 2 entry.

## Builder's calls (decide in the plan, no need to ask)

- Commit breakdown and order, on a feature branch, e.g. `feat/step2-catalogue`.
- Exact GraphQL concurrency (around 4) and the request timeout.
- Whether to add `synced_at` or change the meaning of `cards_ingested_at`.
- Zustand store vs hook for sync progress, and where the top-up status line sits.
- Exact UI copy and the look of the placeholder tile.
- Whether the `ptcgo_code` abbreviation comes from GraphQL or stays on REST set detail.
- Whether `ensureSetCards` is renamed or slimmed for the stats path.

## Calls already made (by Claude, flagged for the user)

- **Keep the column name `national_pokedex_numbers`** instead of renaming it to `dex_ids`.
  It already stores TCGdex `dexId`; a rename touches sort and organize code for no
  behaviour change. CLAUDE.md gets a note.
- **Re-check window: 90 days, at most once a day**, plus any set with missing images.
  It's cheap (tens of small queries) and covers TCGdex filling in new sets over weeks.
- **The top-up discards the prices it receives**, to keep D19 strict (prices only for
  template stats, with their own TTL). Storing them would be harmless but would blur
  where prices come from.
- **Price-key presence counts as a variant**, even with no current price.
- **A variant the user already owns or has in a pocket is never removed** by a variant
  merge, even if the price keys say it doesn't exist.
- **When flags are the bare `['normal']` placeholder and price keys exist, the price keys
  win** (so holo-only cards don't keep a fake normal).
- **"Continue anyway"** after a partial onboarding failure, so one bad set can't trap the
  user.
- **Onboarding copy mentions ~7 MB**, for users on mobile data.
- **The checklist ↻ button stays**, but re-syncs over GraphQL (plus a top-up if needed)
  instead of the per-card REST download.
- **Migration 0005 clears every set's sync marker**, so sets cached in step 1 testing
  (without `illustrator`) are re-downloaded during onboarding. No user data is wiped.
