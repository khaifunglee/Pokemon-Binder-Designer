import {
  fetchCardDetailsSettled,
  fetchSeriesSetIds,
  fetchSetDetailsSettled,
  pooledSettled,
} from '../api';
import { POCKET_SERIES_ID } from '../filter';
import type { DexSetBrief } from '../types';

const brief = (id: string): DexSetBrief => ({ id, name: id, cardCount: { total: 1, official: 1 } });
const realFetch = global.fetch;

afterEach(() => {
  global.fetch = realFetch;
});

describe('fetchSeriesSetIds', () => {
  it('returns the series set ids', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'tcgp', name: 'Pokémon TCG Pocket', sets: [brief('A1'), brief('P-A')] }),
    }) as jest.Mock;
    await expect(fetchSeriesSetIds('tcgp')).resolves.toEqual(['A1', 'P-A']);
    expect(global.fetch).toHaveBeenCalledWith('https://api.tcgdex.net/v2/en/series/tcgp', expect.objectContaining({ signal: expect.anything() }));
  });

  it('throws when the lookup fails, so the sync stops instead of ingesting unfiltered', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 }) as jest.Mock;
    await expect(fetchSeriesSetIds('tcgp')).rejects.toThrow('503');
  });

  it('throws when the series lists no sets, so nothing can slip past the filter', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'tcgp', name: 'Pokémon TCG Pocket', sets: [] }),
    }) as jest.Mock;
    await expect(fetchSeriesSetIds('tcgp')).rejects.toThrow('no sets');
  });

  it('throws when the response has no usable set list', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'tcgp', name: 'Pokémon TCG Pocket', sets: [{ name: 'A1' }] }),
    }) as jest.Mock;
    await expect(fetchSeriesSetIds('tcgp')).rejects.toThrow('no sets');
  });
});

describe('fetchSeriesSetIds — malformed and failed lookups', () => {
  const respondWith = (body: unknown) => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => body }) as jest.Mock;
  };

  it('keeps the valid ids from a mixed list', async () => {
    respondWith({
      id: 'tcgp',
      sets: [brief('A1'), null, { name: 'no id' }, { id: '' }, { id: 42 }, brief('P-A')],
    });
    await expect(fetchSeriesSetIds('tcgp')).resolves.toEqual(['A1', 'P-A']);
  });

  it('throws when every id is empty or not a string', async () => {
    respondWith({ id: 'tcgp', sets: [{ id: '' }, { id: 7 }, { id: null }] });
    await expect(fetchSeriesSetIds('tcgp')).rejects.toThrow('no sets');
  });

  it('throws on a null JSON body', async () => {
    respondWith(null);
    await expect(fetchSeriesSetIds('tcgp')).rejects.toThrow('no sets');
  });

  it('throws when sets is null', async () => {
    respondWith({ id: 'tcgp', sets: null });
    await expect(fetchSeriesSetIds('tcgp')).rejects.toThrow('no sets');
  });

  it('throws when sets is not an array', async () => {
    respondWith({ id: 'tcgp', sets: { A1: brief('A1') } });
    await expect(fetchSeriesSetIds('tcgp')).rejects.toThrow('no sets');
  });

  it('propagates a network failure (offline) instead of returning an empty list', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed')) as jest.Mock;
    await expect(fetchSeriesSetIds('tcgp')).rejects.toThrow('Network request failed');
  });

  it('propagates an unparseable body', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    }) as jest.Mock;
    await expect(fetchSeriesSetIds('tcgp')).rejects.toThrow('Unexpected token');
  });

  it('URL-encodes the series id', async () => {
    respondWith({ id: 'x', sets: [brief('A1')] });
    await fetchSeriesSetIds('a/b c');
    expect(global.fetch).toHaveBeenCalledWith('https://api.tcgdex.net/v2/en/series/a%2Fb%20c', expect.objectContaining({ signal: expect.anything() }));
  });

  it('looks up the TCG Pocket series by its TCGdex id', async () => {
    respondWith({ id: 'tcgp', sets: [brief('A1')] });
    await fetchSeriesSetIds(POCKET_SERIES_ID);
    expect(global.fetch).toHaveBeenCalledWith('https://api.tcgdex.net/v2/en/series/tcgp', expect.objectContaining({ signal: expect.anything() }));
  });
});

describe('pooledSettled', () => {
  it('keeps going past failures and preserves input order', async () => {
    const results = await pooledSettled(
      [1, 2, 3],
      async (n) => {
        if (n === 2) throw new Error('boom');
        return n * 10;
      },
      2,
    );
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
    expect(results[0]).toEqual({ status: 'fulfilled', value: 10 });
  });

  it('never runs more workers at once than the concurrency', async () => {
    let inFlight = 0;
    let peak = 0;
    await pooledSettled(
      [1, 2, 3, 4, 5],
      async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight--;
      },
      2,
    );
    expect(peak).toBe(2);
  });

  it('reports progress after each item', async () => {
    const onProgress = jest.fn();
    await pooledSettled([1, 2], async () => undefined, 4, onProgress);
    expect(onProgress).toHaveBeenLastCalledWith(2, 2);
  });
});

describe('REST timeout', () => {
  afterEach(() => jest.useRealTimers());

  it('aborts a stalled request after 15 s', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    ) as unknown as typeof fetch;
    const pending = fetchSeriesSetIds('tcgp');
    jest.advanceTimersByTime(15_000);
    await expect(pending).rejects.toThrow('aborted');
  });
});

describe('fetchSetDetailsSettled / fetchCardDetailsSettled', () => {
  it('returns what succeeded and the ids that failed', async () => {
    global.fetch = jest.fn(async (url: string) =>
      url.endsWith('/sets/bad')
        ? { ok: false, status: 500 }
        : { ok: true, json: async () => ({ id: url.split('/').pop() }) },
    ) as unknown as typeof fetch;
    const sets = await fetchSetDetailsSettled(['a', 'bad', 'b']);
    expect(sets.details.map((d) => d.id)).toEqual(['a', 'b']);
    expect(sets.failedIds).toEqual(['bad']);
  });

  it('rejects a card detail whose id is not the one requested', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ id: 'other-001' }),
    })) as unknown as typeof fetch;
    const result = await fetchCardDetailsSettled(['sm1-1']);
    expect(result.details).toEqual([]);
    expect(result.failedIds).toEqual(['sm1-1']);
  });
});
