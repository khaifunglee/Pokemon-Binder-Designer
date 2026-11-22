import { fetchSeriesSetIds } from '../api';
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
