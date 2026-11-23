import { createFailureStreak, createThrottle } from '../throttle';

describe('createThrottle', () => {
  it('lets the first call through, then at most once per interval', () => {
    let t = 0;
    const shouldEmit = createThrottle(250, () => t);
    expect(shouldEmit()).toBe(true);
    t = 100;
    expect(shouldEmit()).toBe(false);
    t = 260;
    expect(shouldEmit()).toBe(true);
  });

  it('always lets a forced call through, e.g. the final progress tick', () => {
    let t = 0;
    const shouldEmit = createThrottle(250, () => t);
    shouldEmit();
    t = 10;
    expect(shouldEmit(true)).toBe(true);
  });
});

describe('createFailureStreak', () => {
  it('trips after the threshold of consecutive failures', () => {
    const streak = createFailureStreak(3);
    streak.fail();
    streak.fail();
    expect(streak.tripped()).toBe(false);
    streak.fail();
    expect(streak.tripped()).toBe(true);
  });

  it('resets on a success before the threshold', () => {
    const streak = createFailureStreak(3);
    streak.fail();
    streak.fail();
    streak.succeed();
    streak.fail();
    expect(streak.tripped()).toBe(false);
  });

  it('stays tripped once tripped', () => {
    const streak = createFailureStreak(1);
    streak.fail();
    streak.succeed();
    expect(streak.tripped()).toBe(true);
  });
});
