import { fetchSetCards, GRAPHQL_URL, isGqlCard, postGraphql } from '../graphql';
import type { GqlCard } from '../types';

const realFetch = global.fetch;

afterEach(() => {
  global.fetch = realFetch;
});

const respondWith = (body: unknown, status = 200) => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as jest.Mock;
};

const card = (id: string, setId: string): GqlCard => ({
  id,
  localId: id.slice(setId.length + 1),
  name: `Card ${id}`,
  category: 'Pokemon',
  set: { id: setId },
});

describe('postGraphql', () => {
  it('posts JSON to the TCGdex GraphQL endpoint and returns data', async () => {
    respondWith({ data: { ok: true } });
    await expect(postGraphql('{ ok }', { a: 1 })).resolves.toEqual({ ok: true });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(GRAPHQL_URL);
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ query: '{ ok }', variables: { a: 1 } });
  });

  it('throws on GraphQL errors even when the status is 200', async () => {
    respondWith({ errors: [{ message: 'Cannot query field "x"' }], data: null });
    await expect(postGraphql('{ x }')).rejects.toThrow('Cannot query field');
  });

  it('throws when the response has no data', async () => {
    respondWith({ data: undefined });
    await expect(postGraphql('{ x }')).rejects.toThrow('no data');
  });

  it('throws on a non-OK status', async () => {
    respondWith({}, 503);
    await expect(postGraphql('{ x }')).rejects.toThrow('503');
  });
});

describe('isGqlCard', () => {
  it('accepts a minimal card and rejects malformed entries', () => {
    expect(isGqlCard(card('sv01-001', 'sv01'))).toBe(true);
    expect(isGqlCard({ id: 5 })).toBe(false);
    expect(isGqlCard(null)).toBe(false);
    expect(isGqlCard({ ...card('sv01-001', 'sv01'), set: null })).toBe(false);
  });
});

describe('fetchSetCards', () => {
  it("keeps only the set's own cards, because the id filter is a substring match", async () => {
    respondWith({
      data: { cards: [card('30th-1', '30th'), card('30th-c-1', '30th-c'), { id: 5 }] },
    });
    const result = await fetchSetCards('30th');
    expect(result.cards.map((c) => c.id)).toEqual(['30th-1']);
    expect(result.dropped).toBe(1);
  });

  it('sends the set id prefix', async () => {
    respondWith({ data: { cards: [] } });
    await fetchSetCards('sm1');
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.variables).toEqual({ prefix: 'sm1-' });
  });

  it('throws when data.cards is not a list', async () => {
    respondWith({ data: { cards: null } });
    await expect(fetchSetCards('sm1')).rejects.toThrow('cards');
  });
});
