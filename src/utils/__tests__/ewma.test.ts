import { ewmaStep } from '../ewma';

describe('ewmaStep', () => {
  it('returns the first sample as-is when there is no previous value', () => {
    expect(ewmaStep(null, 90)).toBe(90);
  });

  it('keeps the previous smoothed value when the new sample is null', () => {
    expect(ewmaStep(90, null)).toBe(90);
  });

  it('returns null when both previous and next are null', () => {
    expect(ewmaStep(null, null)).toBeNull();
  });

  it('blends toward the new sample without jumping straight to it', () => {
    const smoothed = ewmaStep(1000, 2000, 0.3);
    expect(smoothed).toBeCloseTo(1300, 5); // 0.3*2000 + 0.7*1000
    expect(smoothed).toBeGreaterThan(1000);
    expect(smoothed).toBeLessThan(2000);
  });

  it('a higher alpha reacts faster to a jump than a lower alpha', () => {
    const slow = ewmaStep(1000, 2000, 0.1);
    const fast = ewmaStep(1000, 2000, 0.8);
    expect(fast).toBeGreaterThan(slow as number);
  });

  it('a constant stream of identical readings stays at that constant', () => {
    let smoothed: number | null = null;
    for (let i = 0; i < 5; i++) {
      smoothed = ewmaStep(smoothed, 90);
    }
    expect(smoothed).toBe(90);
  });
});
