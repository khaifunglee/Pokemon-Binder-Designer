import type { DexCardDetail, DexSeriesDetail, DexSetBrief, DexSetDetail } from './types';

const BASE_URL = 'https://api.tcgdex.net/v2/en';

/** TCGdex asks for considerate use; keep parallelism modest. */
const CONCURRENCY = 6;

/** RN fetch has no reliable default timeout; a stalled request must fail. */
const TIMEOUT_MS = 15_000;

async function getJson<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`TCGdex ${path} failed: ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export function fetchSetBriefs(): Promise<DexSetBrief[]> {
  return getJson<DexSetBrief[]>('/sets');
}

/**
 * Set ids in a series. Throws when the lookup fails or yields no set ids:
 * callers use this list to exclude sets, so an empty or malformed answer
 * would silently exclude nothing.
 */
export async function fetchSeriesSetIds(seriesId: string): Promise<string[]> {
  const series = await getJson<DexSeriesDetail>(`/series/${encodeURIComponent(seriesId)}`);
  const ids = (Array.isArray(series?.sets) ? series.sets : [])
    .map((s) => s?.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (ids.length === 0) throw new Error(`TCGdex series ${seriesId} returned no sets`);
  return ids;
}

export function fetchSetDetail(setId: string): Promise<DexSetDetail> {
  return getJson<DexSetDetail>(`/sets/${encodeURIComponent(setId)}`);
}

export function fetchCardDetail(cardId: string): Promise<DexCardDetail> {
  return getJson<DexCardDetail>(`/cards/${encodeURIComponent(cardId)}`);
}

/**
 * Run fetches through a small worker pool, preserving input order in the
 * results. `onProgress` fires after each completion (ingestion UIs show
 * "45/122"). Individual failures reject the whole batch — callers treat
 * a set's ingestion as all-or-nothing.
 */
export async function pooledFetch<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let done = 0;

  const run = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
      done++;
      onProgress?.(done, items.length);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, () => run()),
  );
  return results;
}

export function fetchCardDetails(
  cardIds: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<DexCardDetail[]> {
  return pooledFetch(cardIds, fetchCardDetail, onProgress);
}

export function fetchSetDetails(
  setIds: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<DexSetDetail[]> {
  return pooledFetch(setIds, fetchSetDetail, onProgress);
}

/**
 * Like pooledFetch, but one failure doesn't stop the rest: onboarding
 * keeps every set that downloads and retries only the ones that didn't.
 */
export async function pooledSettled<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency: number,
  onProgress?: (done: number, total: number) => void,
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let next = 0;
  let done = 0;

  const run = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { status: 'fulfilled', value: await worker(items[index]) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
      done++;
      onProgress?.(done, items.length);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run()),
  );
  return results;
}

export interface SettledDetails<T> {
  details: T[];
  failedIds: string[];
}

function splitSettled<T>(ids: string[], results: PromiseSettledResult<T>[]): SettledDetails<T> {
  const out: SettledDetails<T> = { details: [], failedIds: [] };
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') out.details.push(r.value);
    else out.failedIds.push(ids[i]);
  });
  return out;
}

/** Set details; one bad set no longer fails the whole listing. */
export async function fetchSetDetailsSettled(setIds: string[]): Promise<SettledDetails<DexSetDetail>> {
  return splitSettled(setIds, await pooledSettled(setIds, fetchSetDetail, CONCURRENCY));
}

/**
 * Card details; failures are returned by id. A detail whose id isn't the
 * one requested counts as failed, so it can't overwrite another card.
 */
export async function fetchCardDetailsSettled(
  cardIds: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<SettledDetails<DexCardDetail>> {
  const results = await pooledSettled(
    cardIds,
    async (id) => {
      const detail = await fetchCardDetail(id);
      if (detail?.id !== id) throw new Error(`TCGdex card ${id} answered as ${String(detail?.id)}`);
      return detail;
    },
    CONCURRENCY,
    onProgress,
  );
  return splitSettled(cardIds, results);
}
