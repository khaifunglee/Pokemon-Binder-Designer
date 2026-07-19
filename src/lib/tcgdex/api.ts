import type { DexCardDetail, DexSetBrief, DexSetDetail } from './types';

const BASE_URL = 'https://api.tcgdex.net/v2/en';

/** TCGdex asks for considerate use; keep parallelism modest. */
const CONCURRENCY = 6;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`TCGdex ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export function fetchSetBriefs(): Promise<DexSetBrief[]> {
  return getJson<DexSetBrief[]>('/sets');
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
