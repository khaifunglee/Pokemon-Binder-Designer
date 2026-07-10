import { parseCsv } from './csv';
import type { ImportFormat, ImportRow, ParsedImport } from './types';

/**
 * Header-driven CSV import. TCGplayer's export format is stable and
 * detected by signature; pkmnbindr and Collectr signatures are
 * best-effort reconstructions (no official spec) — anything unrecognized
 * falls back to 'generic', which maps headers by synonym, so a format
 * mismatch degrades gracefully instead of failing.
 */

/** Column synonyms → normalized keys, lowercase-trimmed for lookup. */
const HEADER_SYNONYMS: Record<string, keyof RawRow> = {
  // name
  'simple name': 'name',
  'product name': 'name',
  'card name': 'name',
  name: 'name',
  card: 'name',
  // set code
  'set code': 'setCode',
  'set id': 'setCode',
  code: 'setCode',
  // set name
  set: 'setName',
  'set name': 'setName',
  edition: 'setName',
  // number
  'card number': 'number',
  number: 'number',
  'collector number': 'number',
  no: 'number',
  '#': 'number',
  // quantity
  quantity: 'quantity',
  qty: 'quantity',
  count: 'quantity',
  // variant
  printing: 'variant',
  variant: 'variant',
  variance: 'variant',
  foil: 'variant',
  // condition
  condition: 'condition',
};

interface RawRow {
  name?: string;
  setCode?: string;
  setName?: string;
  number?: string;
  quantity?: string;
  variant?: string;
  condition?: string;
}

const VARIANT_SYNONYMS: Record<string, string> = {
  normal: 'normal',
  'non holo': 'normal',
  'non-holo': 'normal',
  holo: 'holofoil',
  holofoil: 'holofoil',
  foil: 'holofoil',
  'reverse holo': 'reverseHolofoil',
  'reverse holofoil': 'reverseHolofoil',
  'reverse-holo': 'reverseHolofoil',
  reverse: 'reverseHolofoil',
  '1st edition': '1stEditionNormal',
  '1st edition normal': '1stEditionNormal',
  'first edition': '1stEditionNormal',
  '1st edition holofoil': '1stEditionHolofoil',
  '1st edition holo': '1stEditionHolofoil',
  'first edition holofoil': '1stEditionHolofoil',
  unlimited: 'unlimited',
  'unlimited holofoil': 'unlimitedHolofoil',
};

export function normalizeVariant(raw: string | undefined): string | null {
  if (!raw) return null;
  return VARIANT_SYNONYMS[raw.trim().toLowerCase()] ?? null;
}

/** "025/198" → "025"; trims whitespace, keeps alpha numbers ("TG12"). */
export function normalizeNumber(raw: string | undefined): string | null {
  if (!raw) return null;
  const beforeSlash = raw.split('/')[0].trim();
  return beforeSlash === '' ? null : beforeSlash;
}

function detectFormat(headerKeys: string[]): ImportFormat {
  const has = (k: string) => headerKeys.includes(k);
  // TCGplayer app export: Quantity,Name,Simple Name,Set,Card Number,Set Code,Printing,…
  if (has('simple name') && has('set code') && has('printing')) return 'tcgplayer';
  // Collectr (reconstructed): Product Name,Set,Card Number,…
  if (has('product name')) return 'collectr';
  // pkmnbindr (reconstructed): Card Name/Name,Set,Number,Variant,Quantity
  if (has('variant') && (has('number') || has('card number'))) return 'pkmnbindr';
  return 'generic';
}

export function parseImportCsv(text: string): ParsedImport {
  const table = parseCsv(text);
  if (table.length === 0) return { format: 'generic', rows: [], skipped: [] };

  const headerKeys = table[0].map((h) => h.trim().toLowerCase());
  const format = detectFormat(headerKeys);

  // Column index → normalized field. First synonym match wins per field,
  // so TCGplayer's "Simple Name" beats its raw "Name" column when both map.
  const mapping = new Map<number, keyof RawRow>();
  const claimed = new Set<keyof RawRow>();
  // More-specific (longer) header names claim their field first, so
  // TCGplayer's "Simple Name" wins the name field over its "Name" column.
  const entries = [...headerKeys.entries()].sort(([, a], [, b]) => b.length - a.length);
  for (const [idx, key] of entries) {
    const field = HEADER_SYNONYMS[key];
    if (field && !claimed.has(field)) {
      mapping.set(idx, field);
      claimed.add(field);
    }
  }

  const rows: ImportRow[] = [];
  const skipped: ParsedImport['skipped'] = [];

  for (let r = 1; r < table.length; r++) {
    const line = r + 1;
    const raw: RawRow = {};
    for (const [idx, field] of mapping) {
      const value = table[r][idx]?.trim();
      if (value) raw[field] = value;
    }

    const quantity = raw.quantity === undefined ? 1 : Number(raw.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      skipped.push({ line, reason: `bad quantity "${raw.quantity}"` });
      continue;
    }
    const number = normalizeNumber(raw.number);
    const name = raw.name ?? null;
    if (!name && !number) {
      skipped.push({ line, reason: 'no card name or number' });
      continue;
    }

    rows.push({
      line,
      name,
      setCode: raw.setCode ?? null,
      setName: raw.setName ?? null,
      number,
      quantity: Math.floor(quantity),
      variantHint: normalizeVariant(raw.variant),
      condition: raw.condition ?? null,
    });
  }

  return { format, rows, skipped };
}
