# PokéBinder — What's Built, What's Next

Outcome of a planning interview held on 2026-11-17. It covers the features built
so far, the agreed decisions, and the ordered roadmap. For how the code works, see
[architecture.md](architecture.md). For the detailed build log, see
[../PROGRESS.md](../PROGRESS.md).

## Goal

**A portfolio piece that I also use personally**, with an **iOS App Store
release** planned for the near future (TestFlight first).

---

## Features built (M0–M5, code-complete)

| Area | Feature |
|---|---|
| Binders | Create, rename, duplicate, delete. Layouts 2x2 / 3x3 / 3x4 / 4x4. Add pages |
| Adding cards | 3-tap picker (pocket → set → card), name search, long-press variant menu |
| Moving cards | Long-press drag & drop with haptics and edge auto-flip, tap-to-place fallback, Skia page-turn |
| Variant stacking | Per-binder toggle. Retroactively stacks or unstacks existing duplicates |
| Auto-organize | One tap. Master-set / colour / Pokédex (gaps or no gaps) / rarity / custom. Shuffle animation acts as the loading state |
| Checklists | Per-set, variant-level rows, rapid multi-tap toggles, quantity steppers, prices |
| CSV import | TCGplayer, pkmnbindr, Collectr (the last two are unverified), preview with per-line problems |
| Merged pockets | Rectangular merges in four directions, custom pocket images |
| Stats | Completion %, missing cards, cost-to-complete in a chosen currency (24h price + FX refresh) |
| Polish | Sleeve slide-in on placement, PNG export of a page |
| Mirror mode | Pocket-by-pocket capture of a physical binder, with skip and clear |
| Physical re-sort | Minimal human-followable move list (shifts, swaps, rings). "Done" updates the app binder |
| Data source | TCGdex (keyless). One-time migration from pokemontcg.io |

## Not built / not verified (as of 2026-11-17)

- **Unverified on a device:** the M5 TCGdex migration, the checklist toggle fix, the Pokédex
  gaps option, and the earlier feedback-round fixes.
- **Not done:** the 60fps profiling pass and the price-accuracy check.
- **Gaps:** page deletion, merging over filled pockets, import stacking onto existing
  pockets, unverified CSV formats, rarity ordering under TCGdex, and stale re-sort plans.
- **Release:** builds still run in Expo Go, stuck on SDK 54. No store name, branding, README, or demo.

---

## Decisions

### Process
- **D1. Verify before building.** Device-test everything before implementing
  anything new. I'll test step by step and report what breaks.
- **D2. Scope stays hard.** CLAUDE.md's out-of-scope list holds until the goal is
  reached. Phase 2 and 3 are recorded below as a backlog only, with no scaffolding.
- **D3. Fix doc drift first.**
  - CLAUDE.md: change Reanimated 3 to 4, and pokemontcg.io to TCGdex.
  - PROGRESS.md: mark the pokemontcg.io sections as superseded, and the references to the removed `src/lib/tcg/`, `devSeed.ts` and `scripts/` as stale.
  - `schema.ts`: fix the `releaseDate` format comment.
  - `.gitignore`: add `.env`.

### Gaps to close
- **D4. Page deletion.**
  - An **empty** page deletes straight away.
  - A page **with cards** shows an "are you sure?" alert first, e.g. "Page 4 holds 9 cards. They'll be removed from this binder but stay in your collection."
  - `collection` (ownership) is never touched.
  - Later pages renumber.
  - Merged regions and custom images on the page are dropped, and their copied image files are cleaned up.
  - The binder's last page can't be deleted.
- **D5. Merging over filled pockets is blocked.** A merge is allowed only when the non-anchor
  pockets are empty, with a clear message otherwise.
- **D6. CSV formats.** I'll export real pkmnbindr and Collectr files to lock the parsers
  and fixtures. If I can't get samples, ship those two formats labelled **"beta"**.
- **D7. Import stacks onto existing pockets.** With variant stacking on, an imported card
  increases the quantity of a pocket already holding that card, not just pockets within
  the same batch.
- **D8. Pokédex gaps.**
  - Keep gaps limited to the *owned* dex range, and say so in the prompt text ("gaps between your lowest and highest Pokédex number").
  - **No-gaps becomes the default.**
- **D9. Rarity ordering.** Make the ladder case-insensitive and add the rarity strings
  TCGdex actually uses (pulled from the API, not guessed), with a unit test.
- **D10. Stale re-sort plans.** Snapshot the plan, and on "Done" warn if the binder changed
  since it was made (`binders.updated_at`). No hard lock.

### Release (iOS first)
- **D11. EAS development build** replaces Expo Go. It builds in Expo's cloud, so the outdated
  local Xcode doesn't matter. An Apple Developer account is already in place.
- **D12. Upgrade the SDK** to the latest Expo on its own branch, *after* device testing passes on
  54. Re-check the `react-native-worklets` pin (via `bundledNativeModules.json`)
  and the expo-image plugin note, then re-run tests, `tsc`, and the bundle smoke test.
- **D13. Rename for the store.** Use a neutral name without "Pokémon" or "Poké" (Apple guideline 5.2)
  and an icon without card art. Mention "Pokémon TCG" only in the description, and add an "unofficial,
  not affiliated with Nintendo / The Pokémon Company" disclaimer in the app and listing.
  The repo and code can stay "pokebinder". **The name is not chosen yet.**
- **D14. Free**, with no in-app purchases, ads, or analytics. Privacy label: **Data Not Collected**.
- **D15. TestFlight first**, then a public App Store submission once the beta is stable and
  the name is settled.
- **D16. Portfolio assets.** A portfolio-style README (features, architecture link,
  highlights such as the diff engine and offline-first design), screenshots, a ~60s demo
  video (drag & drop, one-tap organize, physical re-sort), and the TestFlight link.

### Constraints
- **D17. No Android device.** Run the 60fps pass on the iPhone plus an Android emulator. The
  **low-end Android profiling required by CLAUDE.md stays outstanding** until a device
  is available. An Android release is deferred.

---

## Roadmap (in order)

1. **Doc-drift chore** (D3). One small commit.
2. **Device test pass on SDK 54** (D1). Fixes come only from what the testing finds.
   1. M5 TCGdex migration on a binder that matters. Check binders and collection
      survive, checklists re-download, Mega-era prices appear, and CSV import still
      matches TCGplayer set codes.
   2. Checklist rapid toggles, Pokédex gaps prompt, mirror capture, physical re-sort.
   3. Earlier feedback fixes: merge in four directions, retroactive stacking,
      organize semantics, variant rows, picker variant menu.
   4. Price spot-check against tcgplayer.com.
   5. 60fps pass on the iPhone (perf monitor checklist in PROGRESS.md, M3).
3. **Close the gaps** (D4–D10). Each one gets its own plan → approval → tested commit.
   Collect the CSV samples (D6) in parallel.
4. **EAS dev build, then SDK upgrade branch** (D11, D12).
5. **Branding** (D13). Choose a name, icon, splash, `app.json` metadata, bundle id, disclaimer.
6. **TestFlight beta** (D14, D15).
7. **Portfolio assets** (D16).
8. **Public App Store submission.**

## Open items
- Store name and branding (D13).
- Whether real pkmnbindr / Collectr exports can be obtained (D6).
- A low-end Android device for profiling (D17).

## Backlog (Phase 2/3, ranked, not to be built yet)
1. Shareable web links. The most demo-able, but they need a backend.
2. Cloud sync and accounts. The prerequisite for anything multi-device.
3. AI binder and theme recommendations.
4. Camera card scanning and recognition (Phase 3).
