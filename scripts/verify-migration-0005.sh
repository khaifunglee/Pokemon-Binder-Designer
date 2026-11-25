#!/usr/bin/env bash
# Checks migration 0005 (roadmap step 2) against a populated and a fresh
# database built from migrations 0000-0004. Needs only the sqlite3 CLI.
#
#   bash scripts/verify-migration-0005.sh <scratch-dir>
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
    0003_mature_hitman.sql \
    0004_step1-cleanup.sql; do
    sqlite3 "$1" < "$repo_root/drizzle/$file"
  done
}

apply_base_migrations "$populated"
apply_base_migrations "$fresh"

# A set cached over REST in step 1 testing, with a placed and owned card.
sqlite3 "$populated" <<'SQL'
INSERT INTO sets (id, name, series, printed_total, total, release_date, cards_ingested_at)
  VALUES ('sv01', 'Scarlet & Violet', 'Scarlet & Violet', 198, 258, '2023-03-31', 1);
INSERT INTO cards (id, name, set_id, number, supertype, types, national_pokedex_numbers, variants)
  VALUES ('sv01-001', 'Pineco', 'sv01', '001', 'Pokémon', '[]', '[204]', '["normal","reverseHolofoil"]');
INSERT INTO binders (id, name, layout, created_at, updated_at) VALUES ('b1', 'Test binder', '3x3', 0, 0);
INSERT INTO pages (id, binder_id, page_index) VALUES ('p1', 'b1', 0);
INSERT INTO slots (id, page_id, slot_index, card_id, variant) VALUES ('s1', 'p1', 0, 'sv01-001', 'normal');
INSERT INTO collection (card_id, variant, quantity_owned) VALUES ('sv01-001', 'reverseHolofoil', 2);
SQL

# expo-sqlite runs with foreign keys on; mirror that.
for db in "$populated" "$fresh"; do
  { echo 'PRAGMA foreign_keys=ON;'; cat "$repo_root/drizzle/0005_step2-catalogue.sql"; } \
    | sqlite3 "$db" || fail "0005 errored on $(basename "$db")"
done

ingested="$(sqlite3 "$populated" "SELECT count(*) FROM sets WHERE cards_ingested_at IS NOT NULL;")"
[ "$ingested" = "0" ] || fail "populated: $ingested sets still marked ingested"

card="$(sqlite3 "$populated" "SELECT flag_variants || '|' || manual_variants || '|' || variants || '|' || ifnull(illustrator, 'NULL') || '|' || ifnull(price_variants, 'NULL') || '|' || ifnull(price_checked_at, 'NULL') FROM cards;")"
[ "$card" = '[]|[]|["normal","reverseHolofoil"]|NULL|NULL|NULL' ] \
  || fail "populated: card columns are '$card'"

set_row="$(sqlite3 "$populated" "SELECT placeholder_flags || '|' || ifnull(variants_checked_at, 'NULL') FROM sets;")"
[ "$set_row" = "0|NULL" ] || fail "populated: set columns are '$set_row'"

user_rows="$(sqlite3 "$populated" "SELECT (SELECT count(*) FROM slots WHERE card_id IS NOT NULL) || '|' || (SELECT quantity_owned FROM collection);")"
[ "$user_rows" = "1|2" ] || fail "populated: user data changed ($user_rows)"

for db in "$populated" "$fresh"; do
  name="$(basename "$db")"
  card_columns="$(sqlite3 "$db" "SELECT name FROM pragma_table_info('cards');")"
  for column in illustrator flag_variants price_variants price_checked_at manual_variants; do
    grep -qx "$column" <<<"$card_columns" || fail "$name: cards.$column is missing"
  done
  set_columns="$(sqlite3 "$db" "SELECT name FROM pragma_table_info('sets');")"
  for column in placeholder_flags variants_checked_at; do
    grep -qx "$column" <<<"$set_columns" || fail "$name: sets.$column is missing"
  done
done

echo "migration 0005 OK"
