#!/usr/bin/env node
/**
 * Downloads a snapshot of TCG API data into src/lib/tcg/__fixtures__/:
 *   - sets.json        — the full sets catalog
 *   - cards.<id>.json  — all cards of one set (default: cel25, 25 cards)
 *
 * Fixtures are checked in. They feed mapper tests (API-shape drift guard)
 * and the in-app dev seed (offline first-run in dev builds).
 *
 * Usage: node scripts/fetch-fixtures.mjs [setId]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://api.pokemontcg.io/v2';
const OUT_DIR = path.join(import.meta.dirname, '../src/lib/tcg/__fixtures__');
const setId = process.argv[2] ?? 'cel25';

async function getAll(pathname, params) {
  const all = [];
  for (let page = 1; ; page++) {
    const query = new URLSearchParams({ ...params, page: String(page), pageSize: '250' });
    const res = await fetch(`${BASE}${pathname}?${query}`);
    if (!res.ok) throw new Error(`${pathname} failed: ${res.status}`);
    const body = await res.json();
    all.push(...body.data);
    if (page * body.pageSize >= body.totalCount || body.data.length === 0) break;
  }
  return all;
}

await mkdir(OUT_DIR, { recursive: true });

const sets = await getAll('/sets', { orderBy: 'releaseDate' });
await writeFile(path.join(OUT_DIR, 'sets.json'), JSON.stringify(sets, null, 1));
console.log(`sets.json: ${sets.length} sets`);

const cards = await getAll('/cards', { q: `set.id:${setId}`, orderBy: 'number' });
await writeFile(path.join(OUT_DIR, `cards.${setId}.json`), JSON.stringify(cards, null, 1));
console.log(`cards.${setId}.json: ${cards.length} cards`);
