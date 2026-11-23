/**
 * Rate-limit progress updates so per-card ticks don't re-render the UI
 * thousands of times. Returns a gate: true means "emit now".
 */
export function createThrottle(
  intervalMs: number,
  clock: () => number = Date.now,
): (force?: boolean) => boolean {
  let last: number | null = null;
  return (force = false) => {
    const now = clock();
    if (force || last == null || now - last >= intervalMs) {
      last = now;
      return true;
    }
    return false;
  };
}
