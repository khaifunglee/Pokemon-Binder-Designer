import type { ApiCard, ApiSet } from './types';

const BASE_URL = 'https://api.pokemontcg.io/v2';
const PAGE_SIZE = 250; // API maximum

// Optional; without a key the API rate-limits harder but still works.
const API_KEY = process.env.EXPO_PUBLIC_POKEMONTCG_API_KEY;

interface PagedResponse<T> {
  data: T[];
  page: number;
  pageSize: number;
  count: number;
  totalCount: number;
}

async function getPage<T>(
  path: string,
  params: Record<string, string>,
  page: number,
): Promise<PagedResponse<T>> {
  const query = new URLSearchParams({
    ...params,
    page: String(page),
    pageSize: String(PAGE_SIZE),
  });
  const res = await fetch(`${BASE_URL}${path}?${query}`, {
    headers: API_KEY ? { 'X-Api-Key': API_KEY } : undefined,
  });
  if (!res.ok) {
    throw new Error(`TCG API ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as PagedResponse<T>;
}

async function getAllPages<T>(
  path: string,
  params: Record<string, string>,
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; ; page++) {
    const res = await getPage<T>(path, params, page);
    all.push(...res.data);
    if (page * res.pageSize >= res.totalCount || res.data.length === 0) break;
  }
  return all;
}

export function fetchAllSets(): Promise<ApiSet[]> {
  return getAllPages<ApiSet>('/sets', { orderBy: 'releaseDate' });
}

export function fetchCardsBySet(setId: string): Promise<ApiCard[]> {
  return getAllPages<ApiCard>('/cards', {
    q: `set.id:${setId}`,
    orderBy: 'number',
  });
}
