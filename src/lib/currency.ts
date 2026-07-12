/** Pure currency conversion/formatting for USD-canonical prices. */

export function convertUsd(amountUsd: number, ratePerUsd: number): number {
  return amountUsd * ratePerUsd;
}

/**
 * "12.34" → "$12.34" / "€11.20" via Intl when available; falls back to
 * "USD 12.34" if the runtime lacks the currency.
 */
export function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
