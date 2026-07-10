# PROGRESS

Working agreement: CLAUDE.md is authoritative (product, stack, data model,
milestones M0–M4, scope exclusions). Loop per milestone: plan → approval →
small committed steps → `npx tsc --noEmit` + `npm test` green before each
commit. Pure logic in `src/lib/` first, unit-tested before UI. This file must
always be enough for a fresh session to resume.

## Status: M1 code complete (not yet smoke-tested on simulator) — next: M2 plan (needs user approval)

## Approved decisions (user-confirmed)

- **Schema additions**: `sets` table and `cards.national_pokedex_numbers`.
- **Ingestion**: per-set on demand. Sets catalog (~173 rows) refreshes in
  background at launch; a set's cards fetched once when first browsed
  (`sets.cards_ingested_at` marks done), offline afterwards.
- **Navigation**: React Navigation (native stack), per user choice.
- **M1 plan approved** (2026-07-07): logic-first order, then binder list,
  picker, spread view, dnd, stacking, page-turn.

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
- **Reanimated 4.x, not 3** (CLAUDE.md says 3): SDK 54+ requires v4;
  worklets API unchanged. Flagged to user, not objected so far.
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

## Next: M2 (write plan, get user approval BEFORE implementing)

Set checklists with rapid multi-tap toggles; CSV import (TCGplayer /
pkmnbindr / Collectr); sort themes; one-tap auto-organize + shuffle
animation; merged slots + custom slot images. Logic-first candidates:
CSV parsers (3 formats), sort comparators per strategy, checklist state
derivation, auto-organize slot assignment (uses ordinal→address from
layout.ts).

## Open items / blockers

- **No simulator/device run yet across M0+M1.** Bundle exports cleanly but
  runtime behavior (migrations, live queries, gestures, Skia overlay,
  haptics) is unverified. Now that SDK 54 matches the user's Expo Go:
  `npx expo start`, scan QR on the iPhone, then the manual pass: create
  binder → add card (3 taps) → drag/swap → edge flip → stacking toggle →
  duplicate/delete binder.
- Reanimated 4 deviation stands (see above).
- Variant selection UI: placement uses the card's first variant; a variant
  chooser (long-press in picker?) is a candidate M2 nicety, not committed.
- `pagesRef`/`currentPageRef` pattern in BinderScreen assumes page list
  doesn't shrink mid-drag; deleting pages isn't built yet, so safe.
- No API key configured; unauthenticated rate limits fine for dev.
