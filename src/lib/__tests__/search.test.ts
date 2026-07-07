import { escapeLike, likePattern, normalizeQuery } from '../search';

describe('normalizeQuery', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeQuery('  pikachu  ')).toBe('pikachu');
    expect(normalizeQuery('mr.   mime')).toBe('mr. mime');
    expect(normalizeQuery('   ')).toBe('');
  });
});

describe('escapeLike', () => {
  it('escapes %, _ and backslash', () => {
    expect(escapeLike('100%')).toBe('100\\%');
    expect(escapeLike('a_b')).toBe('a\\_b');
    expect(escapeLike('a\\b')).toBe('a\\\\b');
  });
});

describe('likePattern', () => {
  it('wraps in wildcards', () => {
    expect(likePattern('pikachu')).toBe('%pikachu%');
  });

  it('returns null for blank input', () => {
    expect(likePattern('')).toBeNull();
    expect(likePattern('   ')).toBeNull();
  });

  it('escapes user wildcards', () => {
    expect(likePattern(' 50% _off ')).toBe('%50\\% \\_off%');
  });
});
