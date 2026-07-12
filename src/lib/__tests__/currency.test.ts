import { convertUsd, formatCurrency } from '../currency';

describe('convertUsd', () => {
  it('multiplies by the rate', () => {
    expect(convertUsd(10, 0.92)).toBeCloseTo(9.2);
    expect(convertUsd(0, 1.5)).toBe(0);
  });
});

describe('formatCurrency', () => {
  it('formats known currencies', () => {
    expect(formatCurrency(12.345, 'USD')).toMatch(/12\.3[45]/);
    expect(formatCurrency(9.9, 'EUR')).toMatch(/9\.9/);
  });

  it('falls back for bogus currency codes', () => {
    expect(formatCurrency(5, 'NOPE')).toBe('NOPE 5.00');
  });
});
