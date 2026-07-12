/** Display names for the TCG API's variant keys (see KNOWN_VARIANTS). */
const LABELS: Record<string, string> = {
  normal: 'Normal',
  holofoil: 'Holo',
  reverseHolofoil: 'Reverse Holo',
  '1stEditionNormal': '1st Edition',
  '1stEditionHolofoil': '1st Edition Holo',
  unlimited: 'Unlimited',
  unlimitedHolofoil: 'Unlimited Holo',
};

export function variantLabel(variant: string): string {
  return LABELS[variant] ?? variant;
}
