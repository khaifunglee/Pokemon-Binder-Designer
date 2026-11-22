import { fetchSeriesSetIds } from '../api';
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
    expect(global.fetch).toHaveBeenCalledWith('https://api.tcgdex.net/v2/en/series/tcgp');
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
    expect(global.fetch).toHaveBeenCalledWith('https://api.tcgdex.net/v2/en/series/a%2Fb%20c');
  });

  it('looks up the TCG Pocket series by its TCGdex id', async () => {
    respondWith({ id: 'tcgp', sets: [brief('A1')] });
    await fetchSeriesSetIds(POCKET_SERIES_ID);
    expect(global.fetch).toHaveBeenCalledWith('https://api.tcgdex.net/v2/en/series/tcgp');
  });
});
