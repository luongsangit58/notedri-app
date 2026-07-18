import { suggestDtcOffline } from '../dtcOfflineDictionary';

describe('suggestDtcOffline', () => {
  it('returns [] below 2 characters (avoid dumping the whole dictionary on 1 keystroke)', () => {
    expect(suggestDtcOffline('')).toEqual([]);
    expect(suggestDtcOffline('P')).toEqual([]);
  });

  it('matches by code prefix, case-insensitively', () => {
    const upper = suggestDtcOffline('P030');
    const lower = suggestDtcOffline('p030');
    expect(upper.length).toBeGreaterThan(0);
    expect(upper.every((s) => s.code.startsWith('P030'))).toBe(true);
    expect(lower).toEqual(upper);
  });

  it('caps results at the given limit', () => {
    const wide = suggestDtcOffline('P0', 3);
    expect(wide.length).toBeLessThanOrEqual(3);
  });

  it('each suggestion carries code, title_vi and severity', () => {
    const [first] = suggestDtcOffline('P0300');
    expect(first).toMatchObject({ code: 'P0300' });
    expect(typeof first.title_vi).toBe('string');
    expect(['critical', 'warn', 'info']).toContain(first.severity);
  });

  it('returns [] when nothing matches the prefix', () => {
    expect(suggestDtcOffline('ZZ99')).toEqual([]);
  });
});
