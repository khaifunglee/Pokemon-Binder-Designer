#!/usr/bin/env bash
# Checks migration 0004 (roadmap step 1) against a populated and a fresh
# database built from migrations 0000-0003. Needs only the sqlite3 CLI.
#
#   bash scripts/verify-migration-0004.sh <scratch-dir>
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: $0 <scratch-dir>" >&2
  exit 2
fi

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
scratch="$1"
mkdir -p "$scratch"
populated="$scratch/populated.db"
fresh="$scratch/fresh.db"
rm -f "$populated" "$fresh"

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

# `--> statement-breakpoint` markers are SQL comments, so files pipe as-is.
apply_base_migrations() {
  for file in \
    0000_flimsy_plazm.sql \
    0001_sparkling_thanos.sql \
    0002_refetch-set-cards.sql \
    0003_mature_hitman.sql; do
    sqlite3 "$1" < "$repo_root/drizzle/$file"
  done
}

apply_base_migrations "$populated"
apply_base_migrations "$fresh"

sqlite3 "$populated" <<'SQL'
INSERT INTO sets (id, name, series, printed_total, total, release_date)
  VALUES ('sv1', 'Scarlet & Violet', 'Scarlet & Violet', 198, 258, '2023-03-31');
INSERT INTO cards (id, name, set_id, number, supertype, types, national_pokedex_numbers, variants)
  VALUES ('sv1-1', 'Pineco', 'sv1', '1', 'Pokemon', '[]', '[204]', '["normal"]'),
         ('sv1-2', 'Forretress', 'sv1', '2', 'Pokemon', '[]', '[205]', '["normal"]');
INSERT INTO binders (id, name, layout, created_at, updated_at)
  VALUES ('b1', 'Test binder', '3x3', 0, 0);
INSERT INTO pages (id, binder_id, page_index) VALUES ('p1', 'b1', 0);
INSERT INTO slots (id, page_id, slot_index, card_id, variant) VALUES ('s1', 'p1', 0, 'sv1-1', 'normal');
INSERT INTO slots (id, page_id, slot_index, merged_group_id) VALUES ('s2', 'p1', 1, 'g1');
INSERT INTO slots (id, page_id, slot_index, custom_image_uri) VALUES ('s3', 'p1', 2, 'file:///x.png');
INSERT INTO collection (card_id, variant, quantity_owned) VALUES ('sv1-1', 'normal', 1);
INSERT INTO card_prices (card_id, variant, market_usd, fetched_at) VALUES ('sv1-1', 'normal', 0.25, 0);
INSERT INTO exchange_rates (currency, rate_per_usd, fetched_at) VALUES ('EUR', 0.92, 0);
INSERT INTO app_settings (key, value)
  VALUES ('displayCurrency', 'EUR'), ('catalogSource', 'tcgdex'), ('pokedexGaps', '0');
SQL

# expo-sqlite runs with foreign keys on; mirror that.
for db in "$populated" "$fresh"; do
  { echo 'PRAGMA foreign_keys=ON;'; cat "$repo_root/drizzle/0004_step1-cleanup.sql"; } \
    | sqlite3 "$db" || fail "0004 errored on $(basename "$db")"
done

for table in slots pages binders collection card_prices cards sets; do
  count="$(sqlite3 "$populated" "SELECT count(*) FROM $table;")"
  [ "$count" = "0" ] || fail "populated: $table still has $count rows"
done

rates="$(sqlite3 "$populated" "SELECT currency || '|' || rate_per_usd FROM exchange_rates;")"
[ "$rates" = "EUR|0.92" ] || fail "populated: exchange_rates changed ($rates)"

settings="$(sqlite3 "$populated" "SELECT key || '=' || value FROM app_settings ORDER BY key;")"
[ "$settings" = "displayCurrency=EUR" ] || fail "populated: app_settings is '$settings'"

for db in "$populated" "$fresh"; do
  name="$(basename "$db")"
  columns="$(sqlite3 "$db" "SELECT name FROM pragma_table_info('slots');")"
  for dropped in merged_group_id custom_image_uri; do
    if grep -qx "$dropped" <<<"$columns"; then
      fail "$name: slots.$dropped still exists"
    fi
  done
  index="$(sqlite3 "$db" "SELECT count(*) FROM sqlite_master WHERE type='index' AND name='slots_page_slot_uq';")"
  [ "$index" = "1" ] || fail "$name: index slots_page_slot_uq is missing"
done

echo "migration 0004 OK"
