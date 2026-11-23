# PokéBinder — What's Built, What's Next

Two planning interviews shaped this doc:
- **2026-11-17:** the features built so far, the first decisions (D1–D17) and the roadmap.
- **2026-11-22:** a concept review after the first device test pass. It gave every
  feature a verdict (keep / fix / change / leave out) and **replaced the roadmap and
  backlog**. Where the two disagree, the 2026-11-22 review wins.

For how the code works, see [architecture.md](architecture.md). For the detailed build
log, see [../PROGRESS.md](../PROGRESS.md).

## Goal

**A portfolio piece that I also use personally**, with an **iOS App Store
release** planned for the near future (TestFlight first). When the two pull apart,
**"I'd actually use this every week" beats "has an impressive feature list"**.

---

## Concept (2026-11-22)

- **Primary user:** a collector who keeps **physical binders**. For them, "planning" means
  1. **tracking** their collection, and
  2. **organizing binders in different ways** to view the collection differently.
- **Core job:** plan and organize binders, with collection tracking built in.
- **Signature feature:** "replicate my binder", meaning mirror capture plus the physical
  re-sort move list. Later it grows into a digital re-sort with a smooth animation.
- **Foundation:** offline-first. Prices are the only regular network use, and they're
  fetched only where they're shown.
- **Reference user (me):**
  - Two binders: one **master set** binder, and one **personal collection (PC)** binder sorted by **colour gradient**.
  - I re-sort every few months.
  - I track in **Collectr**, whose checklists are weak. Beating that is a real gap to fill.
- **Rule for buggy features:**
  - Buggy and not core: cut from the app and move to the backlog.
  - Core: fix.
  - Right purpose but wrong design: change.

### Two kinds of binder

Every binder is one of two kinds, chosen at creation. **To switch kinds, duplicate the
binder** ("Duplicate as template / as collection binder"). Nothing changes kind in place.

| | **Template binder** | **Collection binder** |
|---|---|---|
| What it holds | Every card in a **scope**, each in a fixed pocket | Only the cards you put in it, packed tight |
| Scopes / sorts | Set (**complete set**: one pocket per card number; **master set**: one pocket per variant), **Pokédex** (generation or number range), **artist** | Energy type, **colour gradient**, rarity, Pokédex (no gaps), master set, custom |
| Filling | **Automatic from `collection`**. Owned cards show in colour, missing ones in **black & white** | Manual (picker, drag & drop, mirror capture, import) |
| Missing pocket shows | Set and artist: the card image in greyscale. Pokédex: a placeholder with dex number and name. With several owned cards of one species, you pick which one shows | — |
| Drag & drop | Off (pockets are fixed) | On |
| Re-sort | Never needed. New cards give a simple list ("Put Pikachu in page 3, pocket 5") | Diff engine move list (shifts, swaps, rings). Auto-organize is **preview → Apply** with a per-page card-move animation |
| Mirror capture, variant stacking, page deletion | Not applicable | Available |
| Prices | Stats: "$X to complete" plus a price on each missing card | None |

The per-set **checklist** screen and a set template binder are two views of the same
`collection` data. Toggling a card in either one updates the other.

### Feature verdicts (2026-11-22)

| Feature | Verdict | Notes |
|---|---|---|
| Binder create / edit / delete, layouts, add page | **Keep** | |
| 3-tap picker, search, variant menu | **Keep** | |
| Drag & drop, edge auto-flip, page-turn | **Keep** | Collection binders only |
| Sleeve slide-in animation, currency display | **Keep** | |
| Binder kinds (template vs collection) | **Change (new)** | The structure described above |
| Template: set (complete / master) | **Change (new)** | Master set depends on the variant fix (see Checklists) |
| Template: Pokédex | **Change (new)** | Generation or range picker. TCGdex gives dex numbers only, so species names are taken from single-Pokémon cards |
| Template: artist | **Change (new)** | Store the TCGdex `illustrator` field (present on ~97% of cards) and merge duplicate name spellings |
| Pokédex "gaps / no gaps" prompt | **Leave out** | Template = gaps, collection binder = no gaps. Remove the prompt and the `pokedexGaps` setting |
| Sorts: master set, Pokédex, rarity, custom | **Keep** | Rarity still needs D9 |
| Sort: colour | **Change** | Rename the current sort to **"Energy type"**, since it orders by energy type, not artwork colour. Add a real **colour gradient**: each card's main colour is computed from its image on-device, cached, and ordered by hue |
| Auto-organize | **Change** | Preview → **Apply**. Apply animates the visible page's cards (at most 16) moving to their new pockets, replacing the generic shuffle. The cost stays fixed, so the 60fps rule holds |
| Checklists | **Fix (pillar)** | (a) Show every variant TCGdex prices, even when its variant flags are wrong. In Delta Reign the flags are placeholder data, so 42% of rows had no price. (b) Placeholder card (name + number) when an image is missing. (c) Rapid-tap lag → backlog. **No prices on the checklist** |
| CSV import | **Change** | One adapter per platform: **Collectr** (first) → TCGplayer → **pkmnbindr** (kept, it's testable). Each is locked against a real export I provide |
| Variant stacking | **Keep** | Collection binders only. D7 matters more once Collectr imports bring in duplicates |
| Stats / cost-to-complete | **Keep + fix** | Template binders only. Labelled "TCGplayer market estimate, updated <date>". Device spot-check: within about ±$5 of tcgplayer.com |
| PNG export | **Fix** | The view being captured is optimised away under SDK 54, so it needs `collapsable={false}`. Also show the real error instead of a generic alert, and check that sharing is available first |
| Mirror capture | **Keep** | Collection binders only. Test on my real binders |
| Physical re-sort | **Keep** | Collection binders. Test on my real binders |
| Merged pockets + custom images | **Leave out** | Serves display looks, not tracking or organizing, and it complicates organize, import and drag. Moved to backlog, and D5 is superseded |
| TCGdex migration (`migrateToTcgdex`) | **Leave out** | I'm starting fresh, and no other users exist. Remove the code. (It could permanently drop cards whose set names didn't match.) |
| TCG Pocket sets | **Fix** | Digital-only, so exclude them everywhere (about 2,480 cards) |
| Catalogue onboarding | **Change (new)** | See D18 |
| Local backup / restore | **Keep (new)** | Export the SQLite file to Files or iCloud Drive through the share sheet, and restore it. No backend |
| Page deletion (D4) | **Fix** | Collection binders only |

---

## Decisions

### Process
- **D1. Verify before building.** Device-test everything before implementing
  anything new. I'll test step by step and report what breaks.
  *2026-11-22: first pass done. See "Device test results" below.*
- **D2. Scope stays hard.** CLAUDE.md's out-of-scope list holds until the goal is
  reached. Phase 2 and 3 are recorded below as a backlog only, with no scaffolding.
- **D3. Fix doc drift first.** *Done.*

### Gaps to close
- **D4. Page deletion.** *2026-11-22: collection binders only. A template's pages come from its scope.*
  - An **empty** page deletes straight away.
  - A page **with cards** shows an "are you sure?" alert first, e.g. "Page 4 holds 9 cards. They'll be removed from this binder but stay in your collection."
  - `collection` (ownership) is never touched.
  - Later pages renumber.
  - The binder's last page can't be deleted.
- **D5. ~~Merging over filled pockets is blocked.~~** *Superseded 2026-11-22: merged pockets were cut to the backlog.*
- **D6. CSV formats.** *Updated 2026-11-22:* each platform gets its own adapter, built
  against real exports I provide from **Collectr, TCGplayer and pkmnbindr**. Collectr comes
  first, because it's where my collection lives. My own export is also the realistic
  dataset for the 60fps pass.
- **D7. Import stacks onto existing pockets.** With variant stacking on, an imported card
  increases the quantity of a pocket already holding that card, not just pockets within
  the same batch. Applies to collection binders only.
- **D8. ~~Pokédex gaps.~~** *Superseded 2026-11-22: binder kinds replace the gaps option.
  Template = gaps, collection binder = no gaps.*
- **D9. Rarity ordering.** Make the ladder case-insensitive and add the rarity strings
  TCGdex actually uses (pulled from the API, not guessed), with a unit test.
- **D10. Stale re-sort plans.** Snapshot the plan, and on "Done" warn if the binder changed
  since it was made (`binders.updated_at`). No hard lock. Applies to collection binders only.

### Release (iOS first), unchanged on 2026-11-22
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
- **D16. Portfolio assets.** A portfolio-style README (done 2026-11-18, but the demo and
  "what I learned" sections are still TODO), screenshots, a ~60s demo video (drag & drop,
  one-tap organize, physical re-sort), and the TestFlight link.

### Constraints
- **D17. No Android device.** Run the 60fps pass on the iPhone plus an Android emulator. The
  **low-end Android profiling required by CLAUDE.md stays outstanding** until a device
  is available. An Android release is deferred.
  *2026-11-22: the 60fps pass was blocked on test data. My Collectr import (D6) unblocks it.*

### Concept review (2026-11-22)
- **D18. Catalogue onboarding.**
  - **First launch:** a one-time screen ("Downloading card catalogue…") with progress. It bulk-downloads card metadata from TCGdex's **GraphQL** endpoint (`api.tcgdex.net/v2/graphql`), one query per set.
  - **Data:** name, number, rarity, types, dexId, illustrator, variants and image URL.
  - **Cost, measured 2026-11-22:** about 40 s and about 7 MB for about 21,400 physical cards, roughly 8 MB once stored in SQLite.
  - **Offline at first launch:** show a retry screen.
  - **New sets** are picked up by the same sync at app start.
  - **Images** stay lazy (expo-image disk cache).
  - **Why not the current approach:** fetching card details one at a time over REST would take about 67 minutes for the whole catalogue.
  - **Variants (2026-11-23, built in step 2):** 44 sets (4,396 cards, every main XY and most Sun & Moon sets) have normal-only placeholder flags, but REST TCGplayer price keys list the real variants. **User choice B:** a one-time background top-up reads them after onboarding. About 24% of flagged-set cards have no TCGplayer prices at all (promos like `xyp`, `mfb`, plus ~6% scattered in main sets). **User choice 1 + 3:** keep the flags and re-check those cards weekly (nothing is inferred), and let the user add a missing variant by hand from the checklist.
  - **Freshness:** a daily background re-check re-syncs sets released in the last 90 days or still missing images, since new sets (e.g. Delta Reign) arrive half-finished.
- **D19. Prices only where they're shown.**
  - GraphQL has no pricing, so prices still use REST per card with the 24h TTL.
  - Fetch them **only when a template binder's stats are opened**, for that binder's cards.
  - Checklists and collection binders show no prices and make no price requests.
- **D20. Delete cut code from `master`.** This covers merged pockets and custom images, the gaps
  prompt and the `pokedexGaps` setting, and the TCGdex migration. Record in the backlog the last
  commit that still has each one, so it can be restored. No long-lived branches.
  - **Restore point:** all three are intact at `189daaa` (the last `master` commit before
    roadmap step 1).
- **D21. CLAUDE.md follows this doc.** Its MVP scope, data model and out-of-scope list are
  updated to match these verdicts, so future sessions don't build against the old scope.

### Device test results (2026-11-22, iOS Simulator)
- **Checklist download:** about 1–2 minutes the first time, as expected. **Some prices are missing,** caused by wrong variant flags upstream plus our code trusting them (→ checklist fix (a)).
- **Images:** missing for Delta Reign (`me06`) and 30th Classic Collection (`30th-c`), because TCGdex has no image field for them yet; `30th-c` has no images on its server either (→ placeholder).
- **Binders and collection "didn't survive":** expected. The Simulator has its own separate storage. No data was lost.
- **Checklist rapid taps:** slightly laggy but correct (→ backlog).
- **Pokédex gaps prompt:** works, but is now cut.
- **Merge in four directions, retroactive stacking, picker variant menu:** all work.
- **PNG export:** broken (→ fix).
- **CSV import:** untested, because there were no sample files (→ D6).
- **60fps pass:** blocked on test data (→ D17).
- **Prices:** within about ±$5 of tcgplayer.com.
- **Mirror capture and physical re-sort:** not tested this round.

---

## Roadmap (in order, 2026-11-22)

Each step gets its own plan → approval → tested commits.

1. **Cleanup + quick fixes** (D20): remove merged pockets and custom images, the gaps prompt, and
   the TCGdex migration. Exclude TCG Pocket sets. Fix PNG export.
2. **Catalogue onboarding** (D18): GraphQL bulk sync with progress and offline retry, an
   `illustrator` column, the variant fix (checklist fix (a)), and missing-image placeholders.
3. **Local backup / restore.**
4. **CSV import adapters** (D6, D7): Collectr → TCGplayer → pkmnbindr, against my real
   exports. **I need to provide the three export files by this step.**
5. **Template binders:** binder kind plus scope in the data model. Set (complete / master) →
   Pokédex → artist. Black-and-white missing pockets, auto-fill from `collection`,
   and the "put new card here" list.
6. **Stats / prices for templates** (D19), labelled as estimates.
7. **Collection binders:** split colour into energy type and colour gradient, then preview → Apply
   with the per-page card-move animation. Also page deletion (D4), rarity (D9) and stale plans (D10).
8. **Device test pass** (D1): mirror capture and physical re-sort on my two real
   binders, plus the 60fps pass using my imported Collectr data (D17).
9. **Release track**, unchanged:
   1. EAS dev build, then SDK upgrade branch (D11, D12).
   2. Branding (D13).
   3. TestFlight beta (D14, D15).
   4. Portfolio assets (D16).
   5. Public App Store submission.

## Open items
- Store name and branding (D13).
- Real export files from Collectr, TCGplayer and pkmnbindr (D6), needed by roadmap step 4.
- A low-end Android device for profiling (D17).

## Backlog (ranked, not to be built yet)
1. **Camera card scanner.** Read the printed set number (e.g. "075/139") with on-device text
   recognition, not full image recognition. Needs the EAS dev build (D11). Phase 3 in CLAUDE.md.
2. **"Master set by Pokémon" template scope**, e.g. all Pikachu cards. Built on TCGdex `dexId`,
   which already lists every Pokémon on multi-Pokémon cards such as TAG TEAMs.
3. **Want list for collection binders, with prices.** Cards I'm hunting, shown as a priced
   list and as black-and-white placeholders where they'd sort into the binder. Reuses the
   template greyscale pockets and the price fetch.
4. **Merged pockets + custom images** (cut 2026-11-22; restore from the commit recorded under D20).
5. **Checklist rapid-tap lag**, a small fix.
6. Shareable web links. The most demo-able, but they need a backend (Phase 2).
7. Cloud sync and accounts. The prerequisite for anything multi-device (Phase 2).
8. AI binder and theme recommendations (Phase 2).
9. *Food for thought:* **cameo cards** (a Pokémon appearing on a card labelled as another).
   No data source has this, so it would need a hand-curated list.

---

## Features built (M0–M5, before the 2026-11-22 review)

Kept for reference. The verdicts above decide what survives.

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
