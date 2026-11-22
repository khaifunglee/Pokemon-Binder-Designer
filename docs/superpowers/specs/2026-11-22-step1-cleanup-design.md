# Roadmap step 1: cleanup + quick fixes (design)

Status: draft for review, 2026-11-22. Source: `docs/idea.md` (concept review 2026-11-22,
decisions D18–D21, roadmap step 1).

## Intent

The 2026-11-22 concept review cut three features and found two quick fixes. Step 1 makes
the codebase match those verdicts before the larger work starts: catalogue onboarding,
then template binders. The goal is a **smaller, simpler codebase**:
- no "pinned pocket" special cases
- no gap logic in collection binders
- no one-time migration code

Template binders (step 5) can then be built on clean ground. The user tests this step on
the iOS Simulator before using their phone again.

## Goals

1. **Remove merged pockets + custom pocket images** completely: UI, services, pure logic,
   tests and the database columns.
2. **Remove the Pokédex "gaps / no gaps" prompt** and its `pokedexGaps` setting.
   **Every collection-binder sort becomes packed** (no blank pockets), and that includes
   **master set**. This was the user's choice (option A).
3. **Remove the pokemontcg.io → TCGdex migration** (`migrateToTcgdex`). Replace it with a
   one-time, **unconditional** wipe of user data and the card catalogue on every device.
   The user chose to start fresh, and all existing data (phone and Simulator) is test data.
4. **Exclude TCG Pocket sets** (digital-only) from the catalogue, both now and in future syncs.
5. **Fix PNG export** of a binder page.

## Non-goals

- Anything from later roadmap steps:
  - GraphQL onboarding, `illustrator` / `dex_ids` columns, the variant/price fix and
    image placeholders (step 2)
  - binder kinds and templates (step 5)
  - colour gradient (step 7)
- Renaming the "colour" sort to "Energy type" (step 7).
- Changing the 1-tap organize flow or the shuffle animation (step 7 adds preview → Apply).
- Deleting custom image files already copied onto test devices (see "Builder's calls").

## Anti-goals (a failure even if it "works")

- **A partial wipe.** Some binders, pages, slots, collection rows or catalogue rows survive
  on a device, or the exchange rates or display-currency setting are lost.
- **Leaving half-removed features:** a menu item, alert, setting or column that still
  refers to merged pockets, custom images or gaps.
- **Re-downloading TCG Pocket set details on every launch.** That would happen if they're
  filtered out after the "which sets are new?" check rather than before it.
- **A silent export failure.** The user must see why it failed.

## Constraints

- **Project rules apply** (CLAUDE.md):
  - TypeScript strict.
  - Pure logic stays in `src/lib/`, with Jest tests.
  - `npx tsc --noEmit`, `npm test`, `npm run lint` and `npx expo export --platform ios`
    must pass before the step is done.
  - Conventional commits, one logical change per commit.
- **SDK 54 / Expo Go stays as is.** Don't change dependency versions.
- **Migrations ship inside the app bundle** through `drizzle/migrations.js` (inline-imported
  `.sql`) and run at startup through `useMigrations`, before any UI. Drizzle runs each
  migration file as one unit.
- **There's an existing pattern for custom SQL migrations:**
  `drizzle/0002_refetch-set-cards.sql`, registered in `drizzle/meta/_journal.json`
  and `drizzle/migrations.js`.
- **Work happens on a feature branch, not `master`.** This is the user's global rule.

## Approaches considered (database cleanup)

The code removals are the same in every approach. They differ in how the **database**
gets cleaned up.

- **A. One SQL migration does all data cleanup. (Chosen by the user.)** A single new
  migration (`0004`) wipes user data and the catalogue, drops the merged-slot columns, and
  removes obsolete settings. No startup code remains. The draft made the wipe conditional
  (only never-migrated databases). The user then chose an **unconditional** wipe on every
  device, because the condition might miss a phone that had already migrated. That also
  makes the SQL simple and removes the need for any Pocket-specific cleanup SQL.
- **B. A TypeScript startup check for the wipe, plus a migration for the columns.** Easier to
  read, but it leaves permanent startup code for a one-time job, which goes against D20
  ("delete cut code").
- **C. Remove the code now and drop the columns in step 2's migration.** One fewer migration,
  but the schema would still describe a removed feature until step 2.

## Design

### 1. PNG export fix

Where: `src/features/binders/BinderScreen.tsx`. The export button is around line 584; the
pager view is `pagerRef` around line 510.

- **Symptom (user, Simulator):** the **"Export failed"** alert appears. So either
  `captureRef` or `Sharing.shareAsync` threw inside the `try`. Today's bare `catch {}` throws
  away which one it was and why.
- **The root cause isn't confirmed. Diagnose first.**
  - The earlier hypothesis was New Architecture view flattening, since the captured
    `<View>` has no `collapsable={false}`. It's weakened by the facts that the same View
    has an `onLayout` handler and that `pagerRef.current?.measureInWindow(...)` (~line 236)
    works for drag & drop. So a native view probably exists.
  - **First task:** log the real error with `console.warn(e)`, and say whether it came from
    capture or share. Then the user reproduces it on the Simulator and reports the logged
    error.
  - **Then fix whatever the error shows.** Candidates to check: view flattening (add
    `collapsable={false}`); capturing a container whose visible content is a horizontally
    scrolled list (capture the current page's cell instead); the `result: 'tmpfile'` option;
    Expo Go's share sheet.
- **Always do these, whatever the cause:**
  - Check `Sharing.isAvailableAsync()` before sharing. If sharing is unavailable, show a
    clear alert.
  - Keep `console.warn` on failure. The error holds no sensitive data.
  - Include the error message in the "Export failed" alert.
- **Done means:** on the Simulator, tapping export opens the share sheet with a PNG of the
  visible page. If the cause can't be fixed within this step, e.g. an Expo Go limitation,
  stop and report to the user with the logged error rather than shipping a workaround
  they didn't approve.
- **What it captures:** keep the current behaviour, the visible page.

### 2. Remove the gaps prompt and pack every collection sort

- **Delete** `src/features/binders/pokedexGapsPrompt.ts`, and remove its callers in
  `BinderScreen.tsx` (~line 185) and `BinderListScreen.tsx` (~line 64). Picking Pokédex now
  runs straight away, like every other strategy.
- **Settings:** delete `getPokedexGaps` / `setPokedexGaps` and `POKEDEX_GAPS_KEY` from
  `src/db/settingsService.ts`.
- **Organize:** in `src/db/organize.ts`, stop reading the setting and passing `pokedexGaps`.
- **Pure logic** in `src/lib/binder/organize.ts`, `buildSequence`:
  - **pokedex:** always the packed path, i.e. today's `pokedexGaps === false` branch,
    `sortEntries(entries, 'pokedex')`.
  - **master-set:** packed. Owned cards in collector order with no blank pockets for
    missing cards.
  - Remove the `pokedexGaps` field from `SequenceContext`, plus any logic or helpers that
    only gapped layouts used.
- **Decision for the builder:** whether "each set / category starts on a fresh page" stays.
  - It isn't a gap for a *missing card*, so it doesn't break "packed" in the user's sense.
  - Default: **keep page breaks between categories for colour and rarity** (today's
    behaviour), and **keep a fresh page per set for master-set**. Real binders are usually
    laid out that way, and keeping it avoids a second behaviour change.
  - Record this call in the doc comment.
- **The "Grow binder?" alert** (`BinderScreen.tsx` ~line 141–160): the message says "This
  layout leaves gaps for missing cards". Reword it so it doesn't mention gaps, e.g. "This
  layout needs N new pages." Keep the alert itself, because packed layouts with per-set
  page breaks can still grow a binder.
- **Physical re-sort** (`src/db/movePlan.ts`) reuses `prepareOrganize`, so it becomes
  packed automatically. Check that it no longer reads the setting.
- **Tests:** update `src/lib/binder/__tests__/organize.test.ts` and any sort tests that
  assert gapped output. Add tests that:
  - master-set output has no `null` entries inside a set
  - pokedex output is packed dex order

### 3. Remove merged pockets + custom images

Remove the feature and the whole "pinned pocket" idea:
- **Delete** `src/lib/binder/merge.ts`, its tests `src/lib/binder/__tests__/merge.test.ts`,
  and `src/features/binders/customImage.ts`.
- **UI:**
  - `BinderScreen.tsx`: remove the merge/unmerge/custom-image menu items (~lines 402–470),
    the pinned checks in drag & drop (~lines 305, 328), the custom-image condition in the
    pocket tap handler (~line 489), and the `unpinned` filter in the stacking toggle
    (~lines 636–661).
  - `PageGrid.tsx`: remove region grouping (`groupRegions`, `regionAnchorIndex`) and
    custom-image rendering. Every pocket renders as a single cell.
- **DB services:**
  - `slots.ts`: remove `setMergedGroup`, `unmergeGroup`, `setCustomImage` and the related
    selects.
  - `organize.ts`, `stackingService.ts`, `importService.ts` and `movePlan.ts`: remove the
    `pinned` mapping and filters. Every pocket is now movable, stackable and importable.
  - `binders.ts` (duplicate binder, ~lines 117–133): remove the merged-group re-keying.
- **Pure logic:**
  - Remove `pinned` from the slot types in `src/lib/binder/organize.ts` and
    `src/lib/binder/stacking.ts`.
  - Remove the `mergedGroupId` default in `src/lib/binder/provision.ts`.
  - Remove the "pinned ones excluded by the caller" note in `src/lib/binder/diff.ts`.
  - Update the matching tests: `organize`, `stacking`, `provision`, and any `diff` fixtures.
  - `src/lib/import/resolve.ts` uses "merge" only for combining duplicate CSV rows. That's
    a different meaning, so leave it alone.
- **Schema:** remove `mergedGroupId` and `customImageUri` from `slots` in
  `src/db/schema.ts`. The column drop itself happens in migration 0004 (section 6).
- **Dependency:** remove `expo-image-picker`. Its only user is `customImage.ts`. Confirm
  with a grep, and confirm no `app.json` plugin references it (none does today).

### 4. Remove the TCGdex migration

- **Delete** `src/db/migrateToTcgdex.ts`.
- **`src/db/hooks.ts`:**
  - Remove the `isOnTcgdex` / `migrateToTcgdex` block, the "Upgrading card database…"
    status, and the `onTcgdex` guard.
  - After migrations succeed, set ready and run `ingestSets(db)` in the background, as
    today.
  - If `status` no longer has any producer, remove it from the hook's return value and its
    consumer in `App.tsx`.
- **The fresh start is done by migration 0004**, not by code.

### 5. Exclude TCG Pocket sets

TCGdex groups Pocket sets under the series id **`tcgp`** ("Pokémon TCG Pocket"). Checked
2026-11-22: `/v2/en/series/tcgp` lists 15 set ids (`P-A`, `A1`…`B2a`). Set **briefs**
(`/v2/en/sets`) have no series field, only `id`, `name` and `cardCount`.

- **In `ingestSets`** (`src/db/ingest.ts`), get the Pocket set ids **before** working out
  which sets are new. For example, fetch `/v2/en/series/tcgp` once per sync and drop those
  ids from the briefs. This keeps Pocket sets from being treated as "missing" and
  re-fetched on every launch.
- **If the series lookup fails** (offline or an error), skip the whole sync for that
  launch, as today's offline behaviour already does. Don't ingest unfiltered.
- **Add a pure helper** that's unit-tested, e.g. `excludeSetIds(briefs, excluded)` in
  `src/lib/tcgdex/`, plus an API function for the series lookup in `src/lib/tcgdex/api.ts`.
- **Belt and braces:** `mapSetDetail` already reads `serie`. The builder may also skip any
  detail whose `serie.id === 'tcgp'`.
- **Existing Pocket rows disappear with migration 0004's catalogue wipe.** No
  Pocket-specific SQL is needed. The filter above keeps them from coming back.

### 6. Migration 0004 (all database cleanup, one file)

Generate it with drizzle-kit after the schema change, so the journal, snapshot and
`migrations.js` stay consistent. Then add the custom SQL to the same migration, or to a
second custom migration if drizzle-kit can't combine them. The goal is **one cleanup unit
that runs before the UI**. If a split is needed, the column drop comes last.

Statements, **in this order**:

1. **Unconditional wipe on every device.** Delete all rows, in foreign-key-safe order:
   `slots` → `pages` → `binders` → `collection` → `card_prices` → `cards` → `sets`.
   - **Keep** `exchange_rates`, and the other `app_settings` rows such as the display
     currency.
   - This also removes all existing TCG Pocket data and the old pokemontcg.io card ids.
2. **Drop** `slots.merged_group_id` and `slots.custom_image_uri`.
3. **Delete** the `app_settings` rows `pokedexGaps` and `catalogSource`.

The migration runs once per device. Drizzle records it in its migrations table, so later
launches never wipe again.

After the wipe, the app starts with no binders and an empty catalogue. The existing
background `ingestSets` re-downloads the set list on the first online launch, with Pocket
sets filtered out. Card lists still load lazily per set until step 2.

## Verification

- **Jest:** updated and new tests pass. That covers packed master-set and pokedex
  sequences, the stacking, provision, organize and diff fixtures without `pinned`, and the
  Pocket-exclusion helper. `merge.test.ts` is deleted along with `merge.ts`.
- **Static checks:** `npx tsc --noEmit`, `npm run lint` (0 errors) and
  `npx expo export --platform ios` all pass.
- **A dead-reference grep finds nothing** for: `mergedGroup`, `merged_group`,
  `customImage`, `custom_image`, `pinned`, `pokedexGaps`, `migrateToTcgdex`,
  `catalogSource` and `expo-image-picker`. The exceptions are the migration SQL and the
  historical docs.
- **Migration test.** Build two SQLite databases with the `sqlite3` CLI in a scratch
  directory, by applying `0000`–`0003` and inserting rows:
  - **Populated:**
    - binders, pages, slots holding cards, a merged group and a custom image URI
    - collection rows, `card_prices`, `exchange_rates`
    - `app_settings` with `catalogSource`, `pokedexGaps` and a display currency
  - **Fresh:** empty.

  Apply `0004` to each one and check:
  - **Populated:**
    - `slots`, `pages`, `binders`, `collection`, `card_prices`, `cards` and `sets` are empty
    - `exchange_rates` and the currency setting are unchanged
    - the `catalogSource` and `pokedexGaps` rows are gone
  - **Fresh:** no errors.
  - **Both:** the two slot columns are gone, and the `slots_page_slot_uq` unique index still
    exists.

  Record the commands in the plan so the check can be repeated.
- **Simulator check, by the user:**
  - The app launches empty (expected). After the set list downloads, no TCG Pocket sets
    appear.
  - Create a binder and add cards from a set.
  - Organize by Pokédex and by master set gives packed results with no prompt.
  - No merge or custom-image menu items remain.
  - PNG export opens the share sheet.
- **Phone:** the user opens the app on their phone **after** the Simulator check passes.
  It starts empty there too.

## Docs to update (same step)

- **`docs/idea.md`:** under D20, record the commit that still has the cut code. That's the
  last `master` commit before this step's branch, so it can be restored.
- **`CLAUDE.md`:** the data-model note "merged-slot columns … will be removed in roadmap
  step 1" becomes past tense, or is removed.
- **`docs/architecture.md`:** remove merged pockets, custom images, `merge.ts`, the TCGdex
  migration and the gaps option from the map and data flow. Add the Pocket exclusion.
- **`README.md`:** remove "merged pockets with custom images" from Features.
- **`PROGRESS.md`:** add a step 1 entry.

## Builder's calls (decide in the plan, no need to ask)

- The commit breakdown and order, on a feature branch, e.g. `chore/step1-cleanup`. One
  logical change per commit, with migration 0004 committed together with the `schema.ts`
  change it matches.
- Whether category and set page breaks stay in packed sorts. The default is to keep them
  (see section 2).
- Exact alert wording.
- Whether the series lookup gets cached between syncs.

## Calls already made (by Claude, flagged for the user)

- **The wipe keeps exchange rates and the display-currency setting.** They're
  device preferences and cached data, not test data, so they don't need to go.
- **Export gets a diagnosis task first**, rather than assuming the view-flattening
  cause.
- **Custom image files on test devices are left in place.** Deleting them would need
  startup code for a few KB on devices only the user uses.
- **`expo-image-picker` is removed** as a dependency, since nothing else uses it.
- **The "Grow binder?" alert stays**, reworded without "gaps".
- **Work happens on a feature branch**, per the user's rule against committing to `master`
  without asking.
