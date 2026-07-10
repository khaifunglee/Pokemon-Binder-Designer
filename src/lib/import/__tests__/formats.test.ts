import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { normalizeNumber, normalizeVariant, parseImportCsv } from '../formats';

const fixture = (name: string) =>
  readFileSync(join(__dirname, '../__fixtures__', name), 'utf8');

describe('normalizeNumber', () => {
  it('strips the printed-total suffix', () => {
    expect(normalizeNumber('025/198')).toBe('025');
    expect(normalizeNumber('TG12/TG30')).toBe('TG12');
    expect(normalizeNumber(' 5 ')).toBe('5');
    expect(normalizeNumber(undefined)).toBeNull();
    expect(normalizeNumber('')).toBeNull();
  });
});

describe('normalizeVariant', () => {
  it('maps printings to canonical variant keys', () => {
    expect(normalizeVariant('Normal')).toBe('normal');
    expect(normalizeVariant('Holofoil')).toBe('holofoil');
    expect(normalizeVariant('Reverse Holofoil')).toBe('reverseHolofoil');
    expect(normalizeVariant('Reverse Holo')).toBe('reverseHolofoil');
    expect(normalizeVariant('1st Edition Holofoil')).toBe('1stEditionHolofoil');
    expect(normalizeVariant('mystery future foil x')).toBeNull();
    expect(normalizeVariant(undefined)).toBeNull();
  });
});

describe('parseImportCsv — TCGplayer export', () => {
  const parsed = parseImportCsv(fixture('tcgplayer.csv'));

  it('detects the format', () => {
    expect(parsed.format).toBe('tcgplayer');
    expect(parsed.rows).toHaveLength(4);
    expect(parsed.skipped).toHaveLength(0);
  });

  it('prefers Simple Name over the decorated Name column', () => {
    expect(parsed.rows[0]).toMatchObject({
      name: 'Pikachu',
      setName: 'Scarlet & Violet',
      setCode: 'SVI',
      number: '025',
      quantity: 2,
      variantHint: 'normal',
      condition: 'Near Mint',
    });
  });

  it('maps printings and numbers on every row', () => {
    expect(parsed.rows[1]).toMatchObject({
      name: 'Charizard ex',
      number: '199',
      variantHint: 'holofoil',
    });
    expect(parsed.rows[3]).toMatchObject({
      name: 'Ultra Ball',
      variantHint: 'reverseHolofoil',
      quantity: 1,
    });
  });
});

describe('parseImportCsv — pkmnbindr (reconstructed format)', () => {
  const parsed = parseImportCsv(fixture('pkmnbindr.csv'));

  it('detects and parses', () => {
    expect(parsed.format).toBe('pkmnbindr');
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0]).toMatchObject({
      name: 'Pikachu',
      setName: 'cel25',
      number: '5',
      quantity: 1,
      variantHint: 'normal',
    });
    expect(parsed.rows[2].variantHint).toBe('reverseHolofoil');
  });
});

describe('parseImportCsv — Collectr (reconstructed format)', () => {
  const parsed = parseImportCsv(fixture('collectr.csv'));

  it('detects and parses', () => {
    expect(parsed.format).toBe('collectr');
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({
      name: 'Blastoise',
      setName: 'Celebrations: Classic Collection',
      number: '2',
      variantHint: 'holofoil',
      quantity: 1,
      condition: 'NM',
    });
  });
});

describe('parseImportCsv — generic fallback and row validation', () => {
  it('maps unknown-but-synonymous headers', () => {
    const parsed = parseImportCsv('Card,Qty,No\nMewtwo,2,10\n');
    expect(parsed.format).toBe('generic');
    expect(parsed.rows[0]).toMatchObject({ name: 'Mewtwo', quantity: 2, number: '10' });
  });

  it('defaults missing quantity to 1', () => {
    const parsed = parseImportCsv('Name,Number\nDitto,132\n');
    expect(parsed.rows[0].quantity).toBe(1);
  });

  it('skips rows with bad quantity or no identity', () => {
    const parsed = parseImportCsv('Name,Qty\nMew,zero\n,3\nMewtwo,2\n');
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].name).toBe('Mewtwo');
    expect(parsed.skipped).toEqual([
      { line: 2, reason: 'bad quantity "zero"' },
      { line: 3, reason: 'no card name or number' },
    ]);
  });
});
