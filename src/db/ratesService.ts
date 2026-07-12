import { eq, max, sql } from 'drizzle-orm';

import type { Db } from './client';
import { appSettings, exchangeRates } from './schema';

/** ECB reference rates, free and keyless. */
const RATES_URL = 'https://api.frankfurter.dev/v1/latest?base=USD';
export const RATES_TTL_MS = 24 * 60 * 60 * 1000;

const CURRENCY_KEY = 'displayCurrency';

/** Currencies we surface in the picker (all present in ECB rates). */
export const SUPPORTED_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'AUD',
  'CAD',
  'SGD',
  'MYR',
  'CHF',
  'NZD',
  'HKD',
  'KRW',
] as const;

/**
 * Refresh cached exchange rates when stale. Offline failures leave the
 * cache untouched — conversion then uses the last known rates.
 */
export async function refreshRates(
  db: Db,
  ttlMs: number = RATES_TTL_MS,
): Promise<boolean> {
  const [row] = await db
    .select({ newest: max(exchangeRates.fetchedAt) })
    .from(exchangeRates);
  if (row?.newest != null && Date.now() - row.newest.getTime() < ttlMs) {
    return false;
  }
  const res = await fetch(RATES_URL);
  if (!res.ok) throw new Error(`rates fetch failed: ${res.status}`);
  const body = (await res.json()) as { rates: Record<string, number> };

  const now = new Date();
  const rows = [
    { currency: 'USD', ratePerUsd: 1, fetchedAt: now },
    ...Object.entries(body.rates).map(([currency, ratePerUsd]) => ({
      currency,
      ratePerUsd,
      fetchedAt: now,
    })),
  ];
  await db.transaction(async (tx) => {
    for (const r of rows) {
      await tx
        .insert(exchangeRates)
        .values(r)
        .onConflictDoUpdate({
          target: exchangeRates.currency,
          set: {
            ratePerUsd: sql`excluded.rate_per_usd`,
            fetchedAt: sql`excluded.fetched_at`,
          },
        });
    }
  });
  return true;
}

/** Cached rate for a currency; USD is always 1, unknown → null. */
export async function getRate(db: Db, currency: string): Promise<number | null> {
  if (currency === 'USD') return 1;
  const [row] = await db
    .select({ rate: exchangeRates.ratePerUsd })
    .from(exchangeRates)
    .where(eq(exchangeRates.currency, currency));
  return row?.rate ?? null;
}

export async function getDisplayCurrency(db: Db): Promise<string> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, CURRENCY_KEY));
  return row?.value ?? 'USD';
}

export async function setDisplayCurrency(db: Db, currency: string): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key: CURRENCY_KEY, value: currency })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: sql`excluded.value` },
    });
}
