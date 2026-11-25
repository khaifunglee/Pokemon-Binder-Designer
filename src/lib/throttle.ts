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

/**
 * Counts consecutive failures; once it trips it stays tripped. Used to
 * stop firing requests into a dead connection (one onboarding run lost
 * the network for a minute and failed 70 sets one by one).
 */
export function createFailureStreak(threshold: number): {
  fail: () => void;
  succeed: () => void;
  tripped: () => boolean;
} {
  let streak = 0;
  let isTripped = false;
  return {
    fail: () => {
      streak++;
      if (streak >= threshold) isTripped = true;
    },
    succeed: () => {
      if (!isTripped) streak = 0;
    },
    tripped: () => isTripped,
  };
}
