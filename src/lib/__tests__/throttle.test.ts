import { createThrottle } from '../throttle';

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
