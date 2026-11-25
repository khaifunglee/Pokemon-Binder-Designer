# PROGRESS

Working agreement: CLAUDE.md is authoritative (product, stack, data model,
milestones M0–M4, scope exclusions). Loop per milestone: plan → approval →
small committed steps → `npx tsc --noEmit` + `npm test` green before each
commit. Pure logic in `src/lib/` first, unit-tested before UI. This file must
always be enough for a fresh session to resume.

## Status (2026-11-25): roadmap step 2 (catalogue onboarding) Simulator-checked on branch `feat/step2-catalogue`; PR open for review. Step 1 merged (PR #1). Next after step 2: roadmap step 3 (local backup / restore). Verdicts, decisions D1–D21 and roadmap: docs/idea.md. Code map: docs/architecture.md.

## Roadmap step 2: catalogue onboarding (2026-11-23) — Simulator-checked, PR open

Spec: docs/superpowers/specs/2026-11-23-step2-catalogue-onboarding-design.md. Plan:
docs/superpowers/plans/2026-11-23-step2-catalogue-onboarding.md.
- **Onboarding:** first launch shows a one-time "Downloading card database…" screen.
  `ingestSets` (REST set list + Pocket lookup, unchanged guarantees) then one GraphQL
  query per set, 4 at a time. Resumes after a kill; offline → Retry; some sets failed
  → Retry / Continue anyway (they retry next start).
- **Startup sync** (background): new/unsynced sets, a daily re-check (released in the
  last 90 days or missing images; recent placeholder sets re-topped-up weekly; unpriced
  cards re-checked weekly), then the variant top-up.
- **Variants:** `cards.variants` = `mergeVariants(flags, price keys, manual, in-use)`.
  The top-up reads REST TCGplayer price keys (incl. legacy `reverse`/`holo`) for the
  44 placeholder-flag sets and discards prices (D19). Owned/placed variants are never
  dropped. Long-press a checklist row → Add variant (stored in `manual_variants`, no
  sync touches it); Remove is refused while owned or placed.
- **Removed:** per-card REST from checklist, picker and import (`ensureSetCards`),
  checklist prices, `mapCardDetail` / `mapCardBrief`. Stats keep REST prices via
  `applyRestDetails(storePrices: true)`, which never rewrites card metadata.
- **Placeholder:** `CardFace` shows name + #number when an image is missing or fails.
- **Progress:** `useSyncStore` + `SyncStatusLine` (binder list, checklist sets,
  checklist) and `[catalogue]` lines in the Metro log (dev; failures always warn).
- **Migration 0005:** adds `illustrator`, `flag_variants`, `price_variants`,
  `price_checked_at`, `manual_variants`, `placeholder_flags`, `variants_checked_at`;
  clears every set's `cards_ingested_at` (re-download). No user data touched. Check:
  `bash scripts/verify-migration-0005.sh <scratch-dir>`.
- **Decisions taken in the plan:** set rows stay on REST (GraphQL sets have no
  `abbreviation`, needed for CSV set codes); `cards_ingested_at` reused as the sync
  marker; raw flags stored; recent placeholder sets re-topped-up weekly, not daily; no
  monthly back-off for never-priced sets; GraphQL filter variable is `ID!`.
- **Review fixes (2026-11-23):** real transactions (drizzle's expo-sqlite
  `transaction` is sync: writes now use `.all()`/`.run()` in sync callbacks),
  15 s REST timeout, settled set/card fetches, hostile-key and field
  sanitising, Android-safe variant sheet.
- **Simulator check (2026-11-23):** items 2–10 pass; item 1 (offline first
  launch) not tested yet, re-test before merge. Images take a few seconds on
  first view (lazy). Onboarding showed "30+ sets couldn't download": the
  Simulator lost its connection for ~1 min mid-download (log: 4 timeouts then
  "Network request failed"), plus 4 sets TCGdex lists but has no cards for
  (`jumbo`, `rc`, `sp`, `wp`). All others synced on the next start.
- **Follow-ups from that check:** incomplete sets (local cards < cardCount.total)
  are stored as synced, noted in the checklist and re-checked daily; empty
  synced sets are hidden from set lists; 3 network failures in a row skip the
  rest ("Connection lost") and other failures get one automatic retry;
  "Continue with N sets" when some are downloaded; checklist ↻ greys out with
  "Syncing this set in the background…" while the set is busy; onboarding
  sets the re-check timestamp; dead code removed.
- Remaining low-risk items: docs/idea.md Backlog → "Deferred minors".
- **Re-test (2026-11-25):** offline first launch and a mid-download drop both
  show the expected errors and recover on retry; the `mfb` "34 of 48" note
  shows. The 4 empty sets are hidden as intended (Radiant Collection's cards
  live in `bw11` and `g1`).
- NEEDS: phone check (starts onboarding there), in the step 8 device pass.

## Roadmap step 1: cleanup + quick fixes (2026-11-22) — DONE, merged 2026-11-23 (PR #1)

Spec: docs/superpowers/specs/2026-11-22-step1-cleanup-design.md. Plan:
docs/superpowers/plans/2026-11-22-step1-cleanup.md. Cut code is
restorable from `189daaa` (D20).
- **Removed:** merged pockets + custom pocket images (the whole "pinned
  pocket" idea, `merge.ts`, `customImage.ts`, `expo-image-picker`), the
  Pokédex gaps prompt and `pokedexGaps` setting, and the one-time TCGdex
  migration (`migrateToTcgdex.ts`, startup status text).
- **Packed sorts:** Pokédex and master set leave no pockets for missing
  cards. Colour/rarity categories and master-set sets still start on a
  fresh page.
- **Migration 0004:** one-time wipe of binders, pages, slots, collection,
  prices, cards and sets on every device; keeps exchange rates and the
  display currency; drops the two slot columns and the obsolete
  settings. Check: `bash scripts/verify-migration-0004.sh <scratch-dir>`.
- **TCG Pocket excluded:** `ingestSets` looks up series `tcgp` first and
  never fetches its sets; a failed lookup skips the sync.
- **Export fixed:** the captured pager View was layout-only, so the New
  Architecture flattened it and view-shot failed with "No view found
  with reactTag" (measureInWindow still worked through the shadow tree).
  `collapsable={false}` keeps the native view. Failures now alert with
  the stage (capture / share) and the error. Verified on the Simulator:
  the share sheet opens with a PNG of the visible page (page 2).
- **Review follow-ups:** an empty Pocket lookup counts as an error (no
  sync); the Pocket series and set list are fetched in parallel; set
  details that don't name a non-Pocket series are skipped (fail closed);
  edge-case tests for packed sorts, variant stacking and the lookup.
- **Verified:** 156 Jest tests, `tsc`, lint, iOS bundle export and
  `verify-migration-0004.sh` pass. Full Simulator check passed before
  merge: app starts empty, no Pocket sets, packed Pokédex/master-set
  organize with no prompt, no merge or custom-image menu items, PNG
  export. Not yet opened on the phone (it will start empty; intended).

## M4 test feedback round (2026-07-13) — all addressed

Device results: organize animates instantly ✓; mirror capture ✓ (only
gap: no way to clear a pocket — fixed with an "Empty it" action);
physical re-sort move list correct and commit matches ✓. Fixes:
1. **Checklist flicker (1→0→1)**: previous fix cleared optimistic
   overrides when the WRITE finished, but the live-query re-read lags
   the write → rows flashed back. Overrides now clear per-key only when
   the DB echo matches them, and collection writes are serialized
   through a promise queue (rapid toggles can't interleave their
   read-then-write). Failed writes drop their override (revert to
   truth). NEEDS DEVICE RE-TEST.
2. **Rarity buckets** now 8, ordered (sort.ts RARITY_BUCKETS, matchers
   most-specific-first): commons/uncommons | rares | regular
   ex/V/GX/VMAX (incl. Double Rare) | full arts/Ultra Rare |
   Illustration Rare | Special Illustration Rare |
   hyper/rainbow/secret/gold | promos+unknown.
3. **Pokédex gaps option**: picking Pokédex (both the digital organize
   picker and physical re-sort) asks "With gaps / No gaps"; persisted in
   app_settings ('pokedexGaps'), reused by 1-tap ⇅ and move plans.
   No-gaps = fully packed (SequenceContext.pokedexGaps=false), avoiding
   blank-page blowup for sparse collections.

## M4 — code complete (approved; variant stacks move as single units)

- **Diff engine** `src/lib/binder/diff.ts` (tested with a step simulator):
  `computeMoves(pockets, targetSources)` — targetOrdinal → sourceOrdinal
  over binder-wide ordinals; phase 1 chains cards into pockets freed
  just in time (worklist over empty pockets), phase 2 emits `swapCycle`
  rings for mutual displacement (physically: one card in hand). Every
  card touched exactly once. `batchInstructions` collapses chained
  ±1 runs that stay on one page into `shift` instructions and 2-rings
  into `swap`s; cross-page portions fall back to singles.
- **Phrasing** `src/lib/binder/moveText.ts` (tested): 1-based
  page/pocket wording; shifts name the safe starting end; rings become
  step-by-step "take/put, taking out X" lists.
- **Plan service** `src/db/movePlan.ts`: reuses `prepareOrganize` (now
  exported) so the physical target equals the digital auto-organize
  target (same buildSequence gaps/page groups); pinned pockets excluded;
  new-page pockets appended as free targets; names carry stack size
  ("Pikachu (stack of 3)").
- **Mirror capture** (`MirrorCaptureScreen`, binder menu → "Mirror
  capture…"): compact page preview with the current pocket highlighted,
  name search fills + auto-advances, Skip pocket = skip-slot, Back,
  pages auto-append when walking off the end, Done in header. Places
  overwrite (re-capture friendly) and bypass variant stacking — mirror
  captures physical layout verbatim. Long-press result = variant menu.
- **Physical re-sort** (`MoveListScreen`, binder menu → "Physical
  re-sort…" → strategy): checkable steps (add-pages step first when the
  layout grows), progress in the footer button, and "Done — update the
  app binder" commits via autoOrganize (deterministic same target).
  Caveat: the binder shouldn't be edited digitally mid-checklist; the
  commit recomputes rather than replays.

## Perf + feature feedback round (2026-07-13) — all addressed

User profiled on device (dev-mode Expo Go; note dev builds exaggerate JS
costs). Four perf findings + two feature asks, all fixed:
1. **Edge auto-flip up to 1s late** → dwell was only evaluated in the pan
   onUpdate worklet, which fires on finger *movement*; a still finger
   waited for the next micro-move. Now a `useFrameCallback` (active only
   while dragging) checks dwell every UI frame.
2. **Rapid chevron taps bounced back** (6 taps → 3 pages) →
   `onMomentumScrollEnd` of interrupted programmatic scrolls reported
   intermediate offsets and rewound `currentPageRef`. Fixed with
   `pendingTargetRef`: momentum-ends are ignored until the target index
   is reached; finger swipes (`onScrollBeginDrag`) clear the guard.
   (Swipes intentionally use native scroll physics, no page-turn overlay
   — user OK with it.)
3. **Organize lagged before the shuffle** → planning/growth-check ran
   before showing the overlay. Overlay now starts on tap; the >3-page
   growth confirm fades it out and back in around the dialog.
4. **Checklist taps ~500ms** → whole-list re-render + DB round-trip per
   toggle. Rows are now `React.memo` and toggles flip an optimistic
   `overrides` map synchronously (cleared when the live-query echo
   lands), so feedback is immediate.
Features: completion sections now render each set's FULL checklist in
collector order — owned rows green with ✓ — with converted prices on
every row (— when unpriced); checklist rows show prices too (loaded per
visit with display currency + rate). statsService returns `entriesBySet`
and `pricesUsd` for this.
**Untested: price accuracy** (user hasn't compared against TCGplayer).

Second pass (2026-07-13): two stragglers fixed in a42ccad —
(3b) organize without the confirm dialog hung before animating: the
expo-sqlite driver runs queries synchronously on the JS thread, so the
plan+organize microtask chain finished before React could mount the
overlay (the Alert was an accidental async boundary). runOrganize now
yields ~80ms after starting the shuffle. (4b) rapid checklist taps
looked dropped: the first DB echo cleared ALL optimistic overrides,
reverting rows with writes still in flight. Overrides now clear only
when a pending-write counter hits zero. **M4 plan approved to write;
present for approval before implementing.**

## M3 — code complete (approved plan incl. currency-converter tweak)

- **Prices**: `card_prices` (card_id, variant) PK, `market_usd`,
  `fetched_at` — separate from the catalog on purpose (volatile data,
  narrow updates, TTL refresh). Prices upsert on every set fetch (same
  payload); `refreshSetPrices(db, setId)` re-fetches when older than 24h
  (`PRICE_TTL_MS`). `extractPrices` maps tcgplayer entries with
  market → mid → low fallback (tested). Migration 0003.
- **Currency**: `exchange_rates` cached from frankfurter.dev (ECB, no
  key) with 24h TTL; `app_settings` stores `displayCurrency`;
  `src/lib/currency.ts` pure convert/format (Intl with fallback,
  tested); `SUPPORTED_CURRENCIES` list in `ratesService.ts`. USD is
  canonical — conversion happens at display time only.
- **Completion**: `src/lib/binder/completion.ts` (pure, tested) —
  per-set owned/missing vs full variant-level checklists +
  cost-to-complete (unpriced entries counted separately).
  `statsService.computeBinderStats` joins it all from SQLite.
- **Stats UI**: ％ button in binder header → `StatsScreen`: overall %,
  per-set sections with missing rows (number/name/variant), cost in the
  chosen currency (header currency picker, persisted), "prices as of"
  label, background TTL refresh of rates + per-set prices.
- **Sleeve animation**: just-placed pocket (zustand `uiStore`
  lastPlaced signal) plays a worklet entering animation — spring slide
  into the clipped pocket + gloss sweep. Only that pocket animates.
  (Note: Reanimated-only; CLAUDE.md named Skia for sleeve — a per-pocket
  Skia canvas wasn't justified for a 500ms one-off. Flagged.)
- **PNG export**: ⇪ in the binder footer captures the visible page
  (react-native-view-shot on the pager view) → expo-sharing share sheet.
  New deps (user-approved): react-native-view-shot 4.0.3, expo-sharing.
- **60fps profiling pass: NOT DONE — needs user + device.** Checklist:
  create a 4x4 binder, import a large CSV (several hundred rows) →
  (1) drag & drop with edge auto-flip held down, (2) fast page swipes and
  chevron page-turns, (3) one-tap organize (shuffle overlay) on the full
  binder, (4) checklist rapid-tapping, (5) sleeve placement. Watch the
  Expo perf monitor (shake → Show Perf Monitor): UI thread should hold
  ~60, JS dips acceptable during organize commit only. Profile on a
  low-end Android if available, per CLAUDE.md.

## Smoke-test feedback round (2026-07-12) — all addressed

User tested M1+M2 on device and reported five issues; fixes are in:
1. **Variants invisible** → checklist now renders one row per (card,
   variant) against collection's (card_id, variant) key; picker places
   default variant on tap, long-press opens a variant menu
   (`variantLabels.ts` for display names).
2. **Stacking not retroactive** → toggling ON offers "stack existing
   duplicates" (planConsolidate), OFF offers "unstack into separate
   pockets" (planUnstack, grows binder; `src/db/stackingService.ts`);
   dragging a card onto the same card stacks instead of swapping while
   stacking is on.
3. **Merge gaps** → all four directions (left/up added); menus evaluate
   from every edge of the source group (groupMergeUnion) since region
   taps land on the anchor; phantom same-group merges rejected;
   mergeUnion now absorbs loose cells to complete the rectangle
   (2x1 ↓ → 2x2) and rejects rectangles cutting other groups.
4. **Sort UX** → organize jumps back to page 1 (scroll under the shuffle
   overlay); confirm dialog before growing the binder by >3 pages.
5. **Sort semantics** → buildSequence replaces compaction: master-set
   lays out every card of each represented set in collector order (fresh
   page per set, gaps = missing cards); pokédex leaves one gap per
   missing dex number in the owned range (non-Pokémon on a fresh page
   after); colour/rarity start each category on a new page (rarity uses
   coarse keyword buckets: common/uncommon | rare | ultra (ex/V/GX/double
   rare) | illustration/full-art/secret | promo/other — rarityBucket in
   sort.ts). SortableEntry gained `cardId`.

## Approved decisions (user-confirmed)

- **Schema additions**: `sets` table and `cards.national_pokedex_numbers`.
- **Ingestion**: per-set on demand. Sets catalog (~173 rows) refreshes in
  background at launch; a set's cards fetched once when first browsed
  (`sets.cards_ingested_at` marks done), offline afterwards.
- **Navigation**: React Navigation (native stack), per user choice.
- **M1 plan approved** (2026-07-07): logic-first order, then binder list,
  picker, spread view, dnd, stacking, page-turn.
- **M1 smoke-tested on user's iPhone (2026-07-10): all flows pass.**
- **M2 plan approved** (2026-07-10), including the two new Expo deps
  (expo-document-picker for CSV, expo-image-picker for custom images).

## Notable deviations / environment facts

- **On Expo SDK 54 (2026-07-10, user decision; briefly on 56, then user
  corrected to 54).** The user's App Store Expo Go client is SDK 54; their
  Xcode (16.4, iOS 17.5 sim runtime only) can't build for their iOS 26.2
  iPhone, and they chose not to update Xcode. Project pinned to SDK 54 so
  they can test in Expo Go. **Caveat (user informed): when their Expo Go
  auto-updates past 54, this SDK stops loading in it** — they may want to
  disable Expo Go auto-updates. Re-upgrade path: `npx expo install
  expo@^<target> && npx expo install --fix`, then re-check `app.json`
  `plugins` (see expo-image note below) — the 57-compatible config is in
  git history (commit c28cbda and earlier).
- **`expo-image` has no config plugin on SDK 54** (added later upstream):
  it must NOT appear in `app.json`'s `plugins` array on this SDK, or
  `expo export`/`expo start` fails trying to resolve one from its
  (TS-only, unbuilt) main entry. Re-check this when upgrading SDK again —
  add it back only if a future SDK's expo-image ships an app.plugin.js.
- **Reanimated 4.x, not 3**: SDK 54+ requires v4; worklets API unchanged.
  (CLAUDE.md updated to say 4 on 2026-11-17.)
- Expo SDK 54 (~54.0.13), RN 0.81.5, React 19.1, TS ~5.9.2, drizzle-orm
  0.45, jest-expo ~54.0.17, reanimated ~4.1.1, gesture-handler ~2.28.
- **`react-native-worklets` MUST be pinned to exactly 0.5.1, not left to
  npm's peer-range resolution.** Reanimated 4's peerDependency range is
  "0.5 - 0.8"; npm picked 0.8.3, which crashed instantly in Expo Go with
  "Exception in HostFunction" / NativeWorklets / guardedLoadModule — a
  JS↔native protocol mismatch against the exact native worklets version
  Expo Go's SDK 54 binary has compiled in (confirmed via
  `node_modules/expo/bundledNativeModules.json`). Explicit dependency
  entry `"react-native-worklets": "0.5.1"` in package.json. **Re-check
  this exact way (read the new expo version's bundledNativeModules.json)
  on every future SDK upgrade or downgrade — the correct worklets version
  changes with it and npm won't pick it for you.**
- TS 6 needs explicit `"types": ["jest", "node"]` in tsconfig.
- Drizzle `.sql` migrations bundle via `babel-plugin-inline-import` +
  metro sourceExts + `babel-preset-expo` as direct devDependency.
- Project dir name has spaces → scaffold was created in temp dir and moved;
  scaffold's initial commit has a clobbered CLAUDE.md (restored in 7dab45c).
- `npx expo export --platform ios` used as bundle smoke test throughout.

## M0 — done

> Superseded in M5: `src/lib/tcg/`, its fixtures, `scripts/fetch-fixtures.mjs`
> and `src/db/devSeed.ts` were removed; ingestion now lives in `src/lib/tcgdex/`.

- Schema `src/db/schema.ts` (binders/pages/slots/cards/collection/sets),
  migration `drizzle/0000_*.sql` applied at startup (`useMigrations`),
  client with WAL + foreign_keys + change listener (`src/db/client.ts`).
- Ingestion: `src/lib/tcg/` (types, pure mappers with `deriveVariants`
  from tcgplayer price keys, paginated API client), `src/db/ingest.ts`
  (chunked `excluded.*` upserts, `ingestSets`, `ensureSetCards`).
- Fixtures `src/lib/tcg/__fixtures__/` (173 sets + cel25's 25 cards) via
  `scripts/fetch-fixtures.mjs`; `src/db/devSeed.ts` seeds them in `__DEV__`.
- Image caching helpers `src/features/cards/images.ts` (expo-image).

## M1 — code complete

Pure logic (all Jest-tested, 39 tests total):
- `src/lib/binder/layout.ts` — layoutSpec, slot position↔index,
  ordinal↔(page,slot), pagesNeeded.
- `src/lib/binder/provision.ts` — pure row builders (binder/pages/slots,
  injectable id fn); empty pockets are concrete slot rows.
- `src/lib/binder/dnd.ts` — pocketAt (gap-snapping drop target),
  edgeDirection; worklet-safe.
- `src/lib/binder/stacking.ts` — resolvePlacement (stack vs place).
- `src/lib/search.ts` — LIKE escaping/normalization.

DB services: `src/db/binders.ts` (create/list/update/touch/delete/
duplicate — merged groups re-keyed on copy, addPages, getBinderDetail),
`src/db/cards.ts` (listSets, listSetCards with CAST(number) ordering,
searchCards ESCAPE'd LIKE), `src/db/slots.ts` (placeCard, setSlotQuantity,
clearSlot, swapSlotContents).

UI (`src/features/`, React Navigation stack in App.tsx):
- `binders/BinderListScreen` — live-query list; create (name + layout +
  page-count stepper in `BinderFormModal`), rename, duplicate, delete
  (long-press menu).
- `binders/BinderScreen` — spread view: horizontal paging FlatList, one
  page per screen; ＋page in header; footer chevrons + indicator;
  variant-stacking Switch; tap empty pocket → picker; tap filled pocket →
  menu (Move via tap-to-place with banner, Clear).
- Drag & drop: single Pan gesture per pager with
  `activateAfterLongPress(350)`; source pocket resolved by geometry
  (`measureInWindow` + arithmetic origin); `DragOverlay` floating card on
  shared values; haptics on pickup/drop; dwell ~450ms at screen edge
  auto-flips page (cooldown 650ms); drop swaps pocket contents
  (swap-with-empty = move). Scroll disabled during drag.
- `binders/PageTurnOverlay` — Skia fixed-cost sheet flip (cos scaleX
  around spine, gradient sheen, fade shadow) on programmatic flips
  (chevrons, edge auto-flip); finger swipes stay native.
- `cards/PickerSetsScreen` — debounced name search over ingested cards,
  else sets list (downloaded badge); `cards/PickerCardsScreen` — downloads
  set on demand, 3-col grid, offline error state; `cards/placement.ts` —
  placeIntoSlot honoring variant stacking. Add-a-card = 3 taps:
  empty pocket → set → card.

## M2 — code complete

Pure logic (Jest-tested; suite now 87 tests):
- `src/lib/import/csv.ts` — RFC 4180 parser (quotes, CRLF, embedded
  commas/newlines), no deps.
- `src/lib/import/formats.ts` — header-synonym mapping + format detection.
  TCGplayer signature is real (Simple Name + Set Code + Printing);
  **pkmnbindr and Collectr signatures are reconstructions** (no official
  spec found) — unknown headers fall back to 'generic' synonym mapping,
  so mismatches degrade instead of failing. Fixture CSVs in
  `src/lib/import/__fixtures__/`; replace with real exports when the user
  provides samples.
- `src/lib/import/resolve.ts` — set resolution (ptcgoCode/id/name, code
  beats name), card matching (zero-stripped number key, name tie-break,
  ambiguity detection), variant-hint application, placement planning
  (same card+variant rows merge; stacking merges per card).
- `src/lib/binder/sort.ts` — comparators: master-set (release date → set →
  numeric-aware collector number; alpha-prefixed ranges like TG12 after
  plain numbers), colour (canonical energy-type order, Trainer/Energy
  last), pokedex (min dex, non-Pokémon last), rarity (ladder, unknown
  after known), custom = no-op.
- `src/lib/binder/organize.ts` — planOrganize: cards flow into unpinned
  pockets in sorted order, rest empty; **pinned = mergedGroupId or
  customImageUri set** — pinned pockets are never sources or targets.
  Emits only actual changes.
- `src/lib/binder/merge.ts` — merged-slot rectangle validation
  (isSolidRectangle, mergeUnion of whole groups, groupRegions for
  rendering, top-left anchor holds region content).

DB/services: `src/db/organize.ts` (autoOrganize: join + plan + one
transaction + records sortStrategy), `src/db/collectionService.ts`
(toggleOwned — row existence = owned, zero deletes; adjustOwnedQuantity;
addOwned bulk upsert adding quantities), `src/db/importService.ts`
(resolveImport downloads referenced sets once, per-line problems;
applyImport fills empty unpinned pockets in page order, grows binder,
then addOwned + touch), slots.ts gains setMergedGroup/unmergeGroup/
setCustomImage.

UI:
- **1-tap organize**: ⇅ in binder header re-runs binder.sortStrategy
  (picker on long-press, or on tap while strategy is 'custom').
  `ShuffleOverlay` = 16-sprite fixed-cost Skia card-tumble, min 1200ms,
  is the loading state (`SHUFFLE_MIN_MS`).
- **Checklists**: BinderList header → ChecklistSets (per-set owned
  progress bars, live) → Checklist (ensureSetCards on open; tap row
  toggles owned instantly, +/- quantity steppers on owned rows; header
  shows owned/total). `src/features/checklist/`.
- **CSV import**: binder long-press → Import CSV… → document picker →
  parse/resolve with spinner → preview (format, matched count, per-line
  problems) → apply (pockets filled, pages added, collection updated).
  `src/features/import/ImportScreen.tsx`. Uses
  `expo-file-system/legacy` readAsStringAsync (SDK 54 has both APIs).
- **Merged slots + custom images**: pocket menu (tap filled / long-press
  any) offers merge right/below (only when the union stays a solid
  rectangle), unmerge, custom image (copied into
  documentDirectory/custom-images/ — picker URIs are temporary), remove
  custom image. Merged regions render as one absolute-positioned
  pressable spanning the bounding box, anchored at the top-left slot.
  Merged/custom pockets are excluded from drag & drop (source and
  target), consistent with organize/import pinning.

## Next

> Superseded 2026-11-17: the current ordered roadmap is in docs/idea.md.

MVP (M0–M4) is feature-complete. Remaining before calling it done:
- Device test of M4: mirror-capture a few pages (incl. skips + variant
  long-press), run a physical re-sort by master-set and by colour,
  verify the move list is followable and the commit matches.
- Price-accuracy spot-check vs tcgplayer.com (still pending from M3).
- Then: release prep (icons/splash, app.json metadata, EAS build) and
  any polish backlog — all Phase-2/OUT-of-scope features stay out.

## Variant-visibility follow-up (2026-07-12)

User reported variants still not visible after the fix. Two causes
identified: (a) cel25 — the dev-seeded set — is genuinely all
single-variant holofoil, so its checklist looks unchanged by design;
(b) pokemontcg.io intermittently omits the tcgplayer block, so sets
ingested during a hiccup stored single fallback variants and never
refetched. Migration 0002 nulls all `cards_ingested_at` (one-time
re-download per set on next open; offline keeps local rows), and the
checklist header has a ↻ force-refresh (`ensureSetCards(force)`).
Verify with SV base (sv1): Pineco #1 should show Normal + Reverse Holo
rows. Awaiting user confirmation.

## M5 — TCGdex migration (2026-07-19, user-approved "full migration") — code complete, NEEDS DEVICE TEST

pokemontcg.io stalled (team moved to paid Scrydex, $29/mo minimum, no
free tier). User chose full migration to TCGdex (free, keyless, open
source; verified live per-variant TCGplayer prices for Mega-era sets
that pokemontcg.io lacks; card counts match ptcgio for shared sets).

- `src/lib/tcgdex/` — types (pinned against live payloads 2026-07-19),
  mappers (variants from explicit flags: normal/holo/reverse/
  firstEdition; category 'Pokemon'→'Pokémon'; images = asset base +
  '/low.webp'|'/high.webp', set assets + '.webp'; prices from hyphenated
  tcgplayer keys, market→mid→low; abbreviation.official → ptcgo_code),
  api client with 6-wide pooled fetches. TCGdex quirks: set briefs have
  NO releaseDate (details do, 'YYYY-MM-DD'); card data is per-card
  detail requests (~N per set ingest, progress callback supported);
  rarity strings differ in case ('Double rare') — rarityBucket
  lowercases so buckets work; RARITY_ORDER exact-match ladder may miss
  (cosmetic within-bucket ordering only).
- Ingestion: ingestSets = brief diff + details for new ids only;
  ensureSetCards = set detail + pooled card details → atomic upsert of
  cards+prices+set (cardsIngestedAt); refreshSetPrices = TTL + force
  ensure (prices ride in card details).
- **One-time migration** `src/db/migrateToTcgdex.ts`, gated by
  app_settings 'catalogSource'='tcgdex' in useDbReady: fetches all ~218
  set details, maps old sets by lowercase name, remaps referenced card
  ids by numberKey(collector number), inserts placeholder card rows
  (variants=[] until set re-ingested), rewrites slots/collection in one
  transaction, drops old cards/cardPrices/sets. Unmappable references
  cleared (count returned). Offline → deferred to next launch (gate
  shows 'Upgrading card database…'; ingestSets skipped while
  unmigrated to avoid a mixed catalog). devSeed + src/lib/tcg retired.
- **Device test needed**: first launch runs the migration (needs
  network, ~1-2 min for 218 set details); verify binders/collection
  survived, open a checklist (re-downloads full set per-card — slower
  than before, spinner shows), check Mega-era prices now appear, CSV
  import still matches TCGplayer set codes.

## Known upstream data limitation (verified 2026-07-13) — SUPERSEDED by M5

> pokemontcg.io is no longer used. Kept for history; TCGdex has its own
> quirks (see M5 section).

All card/set/price data comes from pokemontcg.io (CLAUDE.md-mandated);
prices are the `tcgplayer.prices` block embedded in card payloads —
synced by THAT api from TCGplayer, not fetched from TCGplayer by us.
Verified live: Mega-era sets lag upstream — Ascended Heroes (me2pt5)
has only 295 cards in the API (its own set record says 295, so no
refetch can find more; the app has all of them — the "439" a checklist
shows is card×variant entries), and me2pt5/me4 (Chaos Rising)/me5
(Pitch Black) have ZERO tcgplayer AND zero cardmarket price blocks even
though tcgplayer.com shows prices. Self-heals: checklist ↻ and the 24h
price TTL re-pull full payloads once upstream syncs. Alternatives
(official TCGplayer API = partner approval; third-party price APIs =
paid) deliberately not pursued in MVP; user informed.

## Open items / blockers (refreshed 2026-11-23 against docs/idea.md)

- Low-risk deferred review items from steps 1 and 2: docs/idea.md Backlog →
  "Deferred minors".

- Real CSV exports from Collectr, TCGplayer and pkmnbindr are needed by
  roadmap step 4 (D6).
- Import + variant stacking stacks only within the import batch, not onto
  pockets already in the binder; D7 fixes this in step 4.
- Settled 2026-11-23: sets with no release date sort last in master-set;
  `planFromSequence` needs no guard (callers always add pages first).
- `pagesRef`/`currentPageRef` assume the page list doesn't shrink
  mid-drag; revisit when page deletion (D4) lands in step 7.
- `app.json` bundle id is still `com.anonymous.pokebinder`; change before
  any store release (D13).
- README Demo / "What I learned" TODOs and the LICENSE decision (D16).
- No API keys needed: TCGdex and frankfurter.dev are both keyless.
- (Merge-pocket and Pokédex-gaps items removed: both features were cut in
  step 1, D20.)
