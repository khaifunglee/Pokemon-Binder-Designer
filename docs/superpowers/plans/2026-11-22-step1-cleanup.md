# Roadmap Step 1: Cleanup + Quick Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove merged pockets, custom images, the Pokédex gaps option and the TCGdex migration; pack every collection sort; exclude TCG Pocket sets; wipe user data and catalogue once with migration 0004; fix PNG export.

**Architecture:**
- Pure logic changes in `src/lib/` come first, test-driven. Then the `src/db` services and `src/features` UI that call them.
- All database cleanup goes in one drizzle migration (`0004`), generated from the schema change and extended with custom SQL.
- Export is diagnosed before it's fixed: Task 1 instruments it, the user reproduces, and Task 7 applies the fix the logged error points to.

**Tech Stack:** Expo SDK 54, TypeScript strict, Drizzle ORM 0.45 + drizzle-kit 0.31 (expo driver), expo-sqlite, Jest (jest-expo), react-native-view-shot, expo-sharing.

**Spec:** `docs/superpowers/specs/2026-11-22-step1-cleanup-design.md`

## Global Constraints

- Work on the branch `chore/step1-cleanup`, never on `master`. Don't push.
- Conventional commits, one logical change per commit. Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- TypeScript strict; no `any` without a justifying comment. Pure logic in `src/lib/` with no React imports.
- Don't change any dependency version. The only dependency change is removing `expo-image-picker`. Never run `npm audit fix --force`.
- Each task must leave `npx tsc --noEmit`, `npm test` and `npm run lint` passing (0 errors) before its commit. The PostToolUse hook lints every edited file and blocks on errors.
- The wipe keeps `exchange_rates` and the `app_settings` row `displayCurrency`.
- Packed sorts keep page breaks: each colour / rarity category and each set (master-set) starts on a fresh page. Only blank pockets for *missing cards* go.
- `src/lib/import/resolve.ts` uses "merge" for combining CSV rows. Leave it alone.
- Custom image files already on devices stay where they are. No cleanup code for them.

## Review Focus

1. **A device that already ran the TCGdex migration** (`catalogSource = 'tcgdex'` in `app_settings`) must be wiped exactly like one that never did. Task 4's populated database includes that row.
2. **First launch after the wipe while offline:** the Pocket series lookup fails, so `ingestSets` must stop before fetching any set details. The app opens empty and usable. Task 6 pins this with `fetchSeriesSetIds` throwing on a non-OK response, and `ingestSets` awaits it before anything else.
3. **Many small sets in master-set:** three sets with one owned card each produce one card per page, still page-aligned. Sets with the same release date are split by set id, not merged into one page run. Task 2 has tests for both.
4. **Duplicate pockets of the same card** stay adjacent in packed master-set and pokédex output. Task 2 keeps and adapts that test.
5. **Export when sharing is unavailable**, or after scrolling to page N: there must be a clear alert and no crash, and the PNG must show page N rather than page 0. The availability check is in Task 1; the page-N check is in Task 7's Simulator verification.

---

### Task 0: Branch and D20 restore point

**Files:** none

- [ ] **Step 1:** `git switch -c chore/step1-cleanup` from `master`. Record `git rev-parse --short master` (expected `189daaa`). That's the restore point for D20, and Task 8 writes it into `docs/idea.md`.
- [ ] **Step 2:** Baseline: `npm test && npx tsc --noEmit && npm run lint`. Expected: all pass, with 2 known lint warnings in `src/navigation/types.ts`.

---

### Task 1: Export diagnosis + always-on safeguards

**Files:**
- Modify: `src/features/binders/BinderScreen.tsx:584-600` (export `onPress`)

- [ ] **Step 1:** Move the export handler into a `useCallback` named `exportPage` in `BinderScreen`, with this behaviour:
  - If `!(await Sharing.isAvailableAsync())`, call `Alert.alert('Export unavailable', 'Sharing isn't available on this device.')` and return.
  - Run capture and share in **separate** `try` blocks. On failure, call `console.warn('[export] capture failed', e)` or `console.warn('[export] share failed', e)`.
  - Then call `Alert.alert('Export failed', \`Could not ${stage} this page: ${message}\`)`. Here `stage` is `'capture'` or `'share'`, and `message` is `e instanceof Error ? e.message : String(e)`.
  - Keep the capture options exactly as they are today.
- [ ] **Step 2:** `npx tsc --noEmit && npm run lint`. Expected: pass.
- [ ] **Step 3:** Commit: `fix: report which export stage failed and why`.
- [ ] **Step 4: CHECKPOINT. Ask the user** to run `npx expo start`, open a binder on the iOS Simulator and tap ⇪, then report the alert text and the `[export]` line from the Metro log. **Don't start Task 7 until they reply.** Tasks 2–6 can go ahead in the meantime.

---

### Task 2: Pack every collection sort, remove the gaps option

**Files:**
- Modify: `src/lib/binder/organize.ts`
- Test: `src/lib/binder/__tests__/organize.test.ts`
- Modify: `src/db/organize.ts` (lines 11, 77–100 `loadFullSets`, 122–131)
- Delete: `src/db/settingsService.ts`, `src/features/binders/pokedexGapsPrompt.ts`
- Modify: `src/features/binders/BinderScreen.tsx` (line 52 import, ~141–160 alert, ~185 `pickStrategy`), `src/features/binders/BinderListScreen.tsx` (line 18 import, line 64)

**Interfaces:**
- Produces: `SequenceContext` becomes `{ slotsPerPage: number }`. `fullSets` and `pokedexGaps` are both removed, because a packed master-set needs no list of missing cards. `buildSequence(entries, strategy, ctx)` keeps its signature.

- [ ] **Step 1: Rewrite the master-set and pokédex tests** in `organize.test.ts`. `ctx()` becomes `({ slotsPerPage: 4 })`.
  - Delete:
    - "lays out each represented set completely, gaps for missing cards"
    - "appends entries from unknown sets as leftovers"
    - "leaves one gap per missing dex number"
    - "packs without gaps when pokedexGaps is off"
    - "puts trainers/energies on a fresh page after the dex run"
  - Add these tests (`sv1` = `2023/03/31`, `old` = `2021/10/08`):

```ts
describe('buildSequence — master-set (packed)', () => {
  it('packs owned cards in collector order, each set on a fresh page', () => {
    const entries = [
      entry('s1', 'c', { number: '3' }),
      entry('s2', 'a', { number: '1' }),
      entry('s3', 'y', { setId: 'old', setReleaseDate: '2021/10/08', number: '2' }),
    ];
    expect(ids(buildSequence(entries, 'master-set', ctx()))).toEqual([
      'y', null, null, null, // old set, then page break
      'a', 'c', // sv1 packed: no pocket for missing b
    ]);
  });

  it('has no null entries inside a set', () => {
    const entries = ['9', '1', '5', '3'].map((n) => entry(`s${n}`, `c${n}`, { number: n }));
    const seq = buildSequence(entries, 'master-set', ctx());
    expect(ids(seq)).toEqual(['c1', 'c3', 'c5', 'c9']);
  });

  it('keeps duplicate pockets of the same card adjacent', () => {
    const entries = [entry('s1', 'a'), entry('s2', 'b', { number: '2' }), entry('s3', 'a')];
    expect(ids(buildSequence(entries, 'master-set', ctx()))).toEqual(['a', 'a', 'b']);
  });

  it('splits sets that share a release date', () => {
    const entries = [entry('s1', 'p', { setId: 'sv1b' }), entry('s2', 'q', { setId: 'sv1a' })];
    expect(ids(buildSequence(entries, 'master-set', ctx()))).toEqual(['q', null, null, null, 'p']);
  });

  it('gives one-card sets a page each', () => {
    const entries = ['x1', 'x2', 'x3'].map((s, i) =>
      entry(`s${i}`, s, { setId: s, setReleaseDate: `2020/01/0${i + 1}` }),
    );
    expect(ids(buildSequence(entries, 'master-set', ctx()))).toEqual([
      'x1', null, null, null, 'x2', null, null, null, 'x3',
    ]);
  });
});

describe('buildSequence — pokedex (packed)', () => {
  it('is packed dex order with non-Pokémon after, no blank pockets', () => {
    const entries = [
      entry('s1', 'mew', { nationalPokedexNumbers: [151] }),
      entry('s2', 'ball', { supertype: 'Trainer' }),
      entry('s3', 'pika', { nationalPokedexNumbers: [25] }),
    ];
    expect(ids(buildSequence(entries, 'pokedex', ctx()))).toEqual(['pika', 'mew', 'ball']);
  });
  // keep: 'groups multiple cards of one species at its dex position'
});
```

- [ ] **Step 2:** Run `npx jest src/lib/binder/__tests__/organize.test.ts`. Expected: FAIL. TypeScript rejects `ctx()` with no `fullSets`, and the master-set expectations differ.
- [ ] **Step 3:** In `src/lib/binder/organize.ts`:
  - The pokédex branch becomes `return sortEntries(entries, 'pokedex');`.
  - The master-set branch sorts with `compareMasterSet`, then pushes entries in order, calling `padToPageBreak(seq, slotsPerPage)` whenever `setId` changes from the previous entry. Return `trimTrailingNulls(seq)`.
  - Remove `fullSets`, `pokedexGaps` and the now-unused `dexRank` import.
  - Rewrite the module and `buildSequence` doc comments. Every strategy is packed: "page breaks between categories/sets are kept on purpose, because real binders are laid out that way; there are no pockets for missing cards".
- [ ] **Step 4:** Run `npx jest src/lib/binder`. Expected: PASS.
- [ ] **Step 5:** Clean up the callers:
  - `src/db/organize.ts`: delete `loadFullSets` and the `getPokedexGaps` import and call, and pass `{ slotsPerPage }`.
  - Delete `settingsService.ts` and `pokedexGapsPrompt.ts`.
  - `pickStrategy` (BinderScreen) and BinderListScreen line 64 call `runOrganize(strategy)` / `go()` directly.
  - Reword the Grow alert message to `` `This layout needs ${growth} new pages.` `` and its comment to "Per-set and per-category page breaks can grow the binder a lot".
  - Check `src/db/movePlan.ts` has no setting read (it shouldn't).
- [ ] **Step 6:** `npm test && npx tsc --noEmit && npm run lint`. Expected: all pass.
- [ ] **Step 7:** Commit: `feat: pack every collection sort and remove the gaps prompt`.

---

### Task 3: Remove merged pockets + custom images (code)

The schema columns stay until Task 4, so tsc keeps passing. This task only stops the code from reading or writing them.

**Files:**
- Delete: `src/lib/binder/merge.ts`, `src/lib/binder/__tests__/merge.test.ts`, `src/features/binders/customImage.ts`
- Modify (lib): `src/lib/binder/organize.ts` (`OrganizeSlot.pinned`, `planFromSequence`), `src/lib/binder/stacking.ts` (`pinned` field, lines 36, 48, 53, 82), `src/lib/binder/diff.ts:29` (comment)
- Test: `src/lib/binder/__tests__/{organize,stacking}.test.ts`
- Modify (db): `src/db/organize.ts` (select + `pinned` mapping + filters), `src/db/stackingService.ts` (select, line 31, line 65), `src/db/importService.ts:140-156`, `src/db/movePlan.ts:39-50`, `src/db/binders.ts:117-133`, `src/db/slots.ts`
- Modify (UI): `src/features/binders/BinderScreen.tsx` (imports 45–47; drag checks ~305, ~328; merge/custom-image menu ~402–470; tap handler ~489; stacking toggle ~636–661), `src/features/binders/PageGrid.tsx` (import line 8, custom image ~67–75, regions ~138–200)
- Modify: `package.json` / `package-lock.json` (remove `expo-image-picker`)

**Interfaces:**
- Produces:
  - `OrganizeSlot` = `{ slotId, contents, sortable }`.
  - `StackSlotState` has no `pinned`.
  - `planFromSequence` maps onto **all** slots in order.
  - `provision.ts` still sets the two columns to `null` here, because its rows are schema-typed. Task 4 removes those lines together with the columns.

- [ ] **Step 1: Update the tests first:**
  - organize: drop the `pinned` argument from `filled` / `empty`, and delete "skips pinned pockets entirely". Rename "maps entries and gaps onto unpinned pockets" to "maps entries and empties onto pockets in order".
  - stacking: drop `pinned: false` from the `slot()` factory, and delete "skips pinned pockets…" (keep its "cards without duplicates" assertion as its own test) and "leaves pinned stacks alone".
- [ ] **Step 2:** `npx jest src/lib/binder`. Expected: FAIL, with type errors where the fixtures no longer match.
- [ ] **Step 3:** Remove `pinned` from the lib types and logic, and the `diff.ts` comment. Delete `merge.ts` and `merge.test.ts`.
- [ ] **Step 4:** `npx jest src/lib`. Expected: PASS.
- [ ] **Step 5:** Clean up the db services:
  - Remove the `mergedGroupId` / `customImageUri` selects and every `pinned` mapping and filter.
  - In `slots.ts`, delete `setMergedGroup`, `unmergeGroup` and `setCustomImage`, drop `customImageUri: null` from `placeCard` / `clearSlot`, and drop it from `swapSlotContents`'s `contents`. Also remove the "Merged-group membership" doc line.
  - In `binders.ts`, remove `groupIdMap` and the re-keying, so the copied slots become `{ ...s, id, pageId }`.
  - `importService.ts`: empty pockets = `s.cardId === null`.
  - `movePlan.ts`: `pockets = organizeSlots.map((s, i) => ({ ordinal: i, occupied: s.contents !== null }))`. Change the comment to "i-th pocket".
- [ ] **Step 6:** Clean up the UI:
  - Delete the merge / unmerge / custom-image menu items and their handlers, and the now-unused imports (`randomUUID` if unused, `groupMergeUnion`, `MERGE_DIRECTIONS`).
  - Drag allowed for any filled pocket. The drop target needs no pinned check.
  - The tap handler tests only `cardId == null`, and the stacking toggle uses `pockets` directly.
  - `PageGrid` renders one cell per pocket: delete `groupRegions` / `regionAnchorIndex` and the custom-image `<Image>` branch, and `filled` becomes `slot.cardId != null`.
- [ ] **Step 7:** Remove the dependency. Run `grep -rn "expo-image-picker\|ImagePicker" src App.tsx app.json`; expected: no hits. Then run `npm uninstall expo-image-picker`.
- [ ] **Step 8:** `npm test && npx tsc --noEmit && npm run lint && npx expo export --platform ios`. Expected: all pass, and the export bundles with no Metro resolution error.
- [ ] **Step 9:** Commit: `refactor: remove merged pockets and custom pocket images`.

---

### Task 4: Schema change + migration 0004

**Files:**
- Modify: `src/db/schema.ts:108-111` (delete `mergedGroupId`, `customImageUri` and their doc comment); `src/lib/binder/provision.ts:49-50` (drop the two `null` defaults); `src/lib/binder/__tests__/provision.test.ts:16` (delete the `mergedGroupId` assertion)
- Create (generated): `drizzle/0004_step1-cleanup.sql`, `drizzle/meta/0004_snapshot.json`; modified: `drizzle/meta/_journal.json`, `drizzle/migrations.js`
- Create: `scripts/verify-migration-0004.sh` (committed, so the check can be rerun)

- [ ] **Step 1:** Edit `schema.ts`, then run `npx drizzle-kit generate --name step1-cleanup`. Expected: a new `0004_step1-cleanup.sql`, with `migrations.js` importing `m0004`. If drizzle-kit doesn't update `migrations.js`, add the import and the `m0004` key by hand, following the existing lines.
- [ ] **Step 2:** Edit `0004_step1-cleanup.sql` so the full file runs in this order, with `--> statement-breakpoint` between statements. Keep the generated column-drop statements exactly as generated, in the middle:

```sql
-- Roadmap step 1 (2026-11-22): one-time fresh start on every device.
-- All existing data is test data; keep exchange rates and the
-- display-currency setting. FK-safe order.
DELETE FROM `slots`;
DELETE FROM `pages`;
DELETE FROM `binders`;
DELETE FROM `collection`;
DELETE FROM `card_prices`;
DELETE FROM `cards`;
DELETE FROM `sets`;
-- <generated: drop slots.merged_group_id and slots.custom_image_uri>
DELETE FROM `app_settings` WHERE `key` IN ('pokedexGaps', 'catalogSource');
```

  If the generated SQL recreates `slots` (`__new_slots` + `PRAGMA foreign_keys`) instead of `ALTER TABLE … DROP COLUMN`, keep the generated block unchanged and put the deletes above it.
- [ ] **Step 3:** Write `scripts/verify-migration-0004.sh`. Usage is `bash scripts/verify-migration-0004.sh <scratch-dir>`, under `set -euo pipefail`, using only `sqlite3`. The script:
  - Creates `populated.db` and `fresh.db` by piping `drizzle/0000…0003*.sql` into `sqlite3` in journal order. `--> statement-breakpoint` lines are SQL comments, so the files can be piped as-is.
  - Inserts into `populated.db`:
    - 1 set and 2 cards
    - 1 binder (`layout '3x3'`, timestamps), 1 page and 3 slots: one with a card, one with `merged_group_id 'g1'`, one with `custom_image_uri 'file:///x.png'`
    - 1 `collection` row and 1 `card_prices` row
    - `exchange_rates` `('EUR', 0.92, 0)`
    - `app_settings`: `('displayCurrency','EUR')`, `('catalogSource','tcgdex')`, `('pokedexGaps','0')`
  - Applies `drizzle/0004_step1-cleanup.sql` to both databases, with `PRAGMA foreign_keys=ON;` first, as expo-sqlite would.
  - Asserts, exiting non-zero with a message on any mismatch:
    - populated: `SELECT count(*)` is 0 for `slots, pages, binders, collection, card_prices, cards, sets`
    - populated: `exchange_rates` has `EUR|0.92`, and `SELECT key FROM app_settings` returns exactly `displayCurrency`
    - both: `SELECT name FROM pragma_table_info('slots')` doesn't contain `merged_group_id` or `custom_image_uri`
    - both: `SELECT name FROM sqlite_master WHERE type='index' AND name='slots_page_slot_uq'` returns 1 row
  - Prints `migration 0004 OK` at the end.
- [ ] **Step 4:** Run `bash scripts/verify-migration-0004.sh "$TMPDIR/m0004"` (or the session scratchpad). Expected: `migration 0004 OK`. Run it once *before* editing step 2's SQL as well; expected FAIL on the count check, which proves the script detects a missing wipe.
- [ ] **Step 5:** `npm test && npx tsc --noEmit && npm run lint && npx expo export --platform ios`. Expected: all pass. The export proves `migrations.js` resolves the new `.sql`.
- [ ] **Step 6:** Commit, with schema, migration, meta and script together: `feat: migration 0004 wipes test data and drops merged-slot columns`.

---

### Task 5: Remove the TCGdex migration

**Files:**
- Delete: `src/db/migrateToTcgdex.ts`
- Modify: `src/db/hooks.ts`, `App.tsx:23,35` (+ the `gateStatus` style if unused)

**Interfaces:**
- Produces: `useDbReady(): { ready: boolean; error: Error | null }`. `status` is removed because nothing produces it any more.

- [ ] **Step 1:** In `hooks.ts`, once `success` is true, call `setReady(true)` and then `ingestSets(db).catch(() => {})`. Remove the `status` state. Rewrite the doc comment: "Startup gate: schema migrations, then a background catalogue refresh. The UI never waits on the network."
- [ ] **Step 2:** In `App.tsx`, drop `status` from the destructure, remove the status `<Text>` and the `gateStatus` style if nothing else uses it, and delete `migrateToTcgdex.ts`.
- [ ] **Step 3:** `npm test && npx tsc --noEmit && npm run lint`. Expected: pass.
- [ ] **Step 4:** Commit: `refactor: remove the one-time TCGdex catalogue migration`.

---

### Task 6: Exclude TCG Pocket sets

**Files:**
- Create: `src/lib/tcgdex/filter.ts`
- Test: `src/lib/tcgdex/__tests__/filter.test.ts`, `src/lib/tcgdex/__tests__/api.test.ts`
- Modify: `src/lib/tcgdex/api.ts`, `src/lib/tcgdex/types.ts`, `src/db/ingest.ts:50-63`

**Interfaces:**
- Produces:
  - `POCKET_SERIES_ID = 'tcgp'` (in `filter.ts`)
  - `selectSetsToFetch(briefs: DexSetBrief[], knownIds: ReadonlySet<string>, excludedIds: ReadonlySet<string>): string[]`: brief ids that are neither known nor excluded, in brief order
  - `interface DexSeriesDetail { id: string; name: string; sets: DexSetBrief[] }`
  - `fetchSeriesSetIds(seriesId: string): Promise<string[]>`, which GETs `/series/{id}` and throws on a non-OK response, through `getJson`

- [ ] **Step 1: Write the failing tests:**

```ts
// filter.test.ts
import { selectSetsToFetch } from '../filter';
const brief = (id: string) => ({ id, name: id, cardCount: { total: 1, official: 1 } });

it('skips known and excluded sets, keeping brief order', () => {
  expect(
    selectSetsToFetch([brief('sv1'), brief('A1'), brief('me06'), brief('P-A')], new Set(['sv1']), new Set(['A1', 'P-A'])),
  ).toEqual(['me06']);
});
it('never returns an excluded set even when it is unknown', () => {
  expect(selectSetsToFetch([brief('A1')], new Set(), new Set(['A1']))).toEqual([]);
});

// api.test.ts (mock global.fetch)
it('fetchSeriesSetIds returns the series set ids', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'tcgp', name: 'Pokémon TCG Pocket', sets: [brief('A1'), brief('P-A')] }) }) as jest.Mock;
  await expect(fetchSeriesSetIds('tcgp')).resolves.toEqual(['A1', 'P-A']);
  expect(global.fetch).toHaveBeenCalledWith('https://api.tcgdex.net/v2/en/series/tcgp');
});
it('fetchSeriesSetIds throws when the lookup fails', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 }) as jest.Mock;
  await expect(fetchSeriesSetIds('tcgp')).rejects.toThrow('503');
});
```

- [ ] **Step 2:** `npx jest src/lib/tcgdex`. Expected: FAIL, because the modules and exports don't exist yet.
- [ ] **Step 3:** Implement `filter.ts`, `DexSeriesDetail` and `fetchSeriesSetIds`.
- [ ] **Step 4:** `npx jest src/lib/tcgdex`. Expected: PASS.
- [ ] **Step 5:** In `ingestSets`, the **first** statement is `const pocketIds = new Set(await fetchSeriesSetIds(POCKET_SERIES_ID));`. A failure rejects the whole sync, and the caller already swallows it. Then fetch the briefs, compute `missing` with `selectSetsToFetch`, and before `upsertSets`, filter `details` to `d.serie?.id !== POCKET_SERIES_ID`. Update the doc comment: TCG Pocket sets are excluded and never fetched; the series is looked up on every sync (one small request, no cache).
- [ ] **Step 6:** `npm test && npx tsc --noEmit && npm run lint`. Expected: pass.
- [ ] **Step 7:** Commit: `feat: exclude TCG Pocket sets from the catalogue`.

---

### Task 7: Fix PNG export (after the Task 1 checkpoint)

**Files:** `src/features/binders/BinderScreen.tsx` (export handler, pager view ~510). The exact change depends on the error the user reports.

- [ ] **Step 1:** Use superpowers:systematic-debugging with the reported `[export]` error. Match it to a candidate from the spec, in this order:
  1. Capture error mentioning a missing / null native view: view flattening. Add `collapsable={false}` to the `pagerRef` View.
  2. Capture succeeds but the image is blank or page 0: the container is a horizontally scrolled list. Capture the visible page's cell instead, with a ref on the current page's wrapper.
  3. Error mentioning `tmpfile` or a file path: try `result: 'tmpfile'` → the default, and check the URI scheme passed to `shareAsync`.
  4. Share-stage error in Expo Go: **stop and report** to the user with the error. Don't add a workaround they haven't approved.
- [ ] **Step 2:** Apply the single fix. `npx tsc --noEmit && npm run lint`.
- [ ] **Step 3: CHECKPOINT. The user verifies on the Simulator:** go to page 2 and tap ⇪. The share sheet opens with a PNG of page 2. If it fails, go back to Step 1 with the new error.
- [ ] **Step 4:** Commit: `fix: PNG export of the visible binder page` (the body names the root cause).

---

### Task 8: Docs + final verification

**Files:** `docs/idea.md` (D20), `CLAUDE.md` (data-model note), `docs/architecture.md`, `README.md` (Features), `PROGRESS.md`

- [ ] **Step 1:** Update the docs:
  - **D20:** "Cut code is restorable from `189daaa`" (the hash from Task 0).
  - **CLAUDE.md:** replace "The merged-slot columns … removed in roadmap step 1" with "Merged-slot columns were removed in roadmap step 1 (migration 0004)."
  - **architecture.md:** remove merged pockets, custom images, `merge.ts`, `migrateToTcgdex`, `settingsService` and the gaps option. Add the Pocket exclusion in `ingestSets`, and migration 0004 as the one-time wipe.
  - **README:** drop "merged pockets with custom images".
  - **PROGRESS.md:** add a dated step 1 entry listing what was removed and fixed.
- [ ] **Step 2:** Run the dead-reference grep. Expected: no hits outside `drizzle/` and `docs/`.

```bash
grep -rnE "mergedGroup|merged_group|customImage|custom_image|pinned|pokedexGaps|migrateToTcgdex|catalogSource|expo-image-picker" \
  src App.tsx app.json package.json CLAUDE.md README.md
```

- [ ] **Step 3:** Run the full gate: `npm test && npx tsc --noEmit && npm run lint && npx expo export --platform ios && bash scripts/verify-migration-0004.sh "$TMPDIR/m0004"`. Expected: all pass.
- [ ] **Step 4:** Commit: `docs: record step 1 cleanup`.
- [ ] **Step 5: CHECKPOINT. The user checks on the Simulator:**
  - The app launches empty. After the set list downloads, no TCG Pocket sets appear (no `A1`, `P-A`, …).
  - Create a binder and add cards.
  - Organize by Pokédex and by master set: packed results, with no prompt.
  - There are no merge or custom-image menu items.
  - Export works.

  Only after this passes does the user open the app on their phone. It starts empty there too. Then follow superpowers:finishing-a-development-branch.
