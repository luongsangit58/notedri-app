import { suggestDtcOffline, withDefaultDtcPrefix } from '../dtcOfflineDictionary';

describe('withDefaultDtcPrefix', () => {
  it('prepends P when input starts with a digit', () => {
    expect(withDefaultDtcPrefix('03')).toBe('P03');
    expect(withDefaultDtcPrefix('0300')).toBe('P0300');
  });

  it('leaves input starting with a system letter untouched (just uppercased/trimmed)', () => {
    expect(withDefaultDtcPrefix('p0300')).toBe('P0300');
    expect(withDefaultDtcPrefix('C0035')).toBe('C0035');
    expect(withDefaultDtcPrefix('  u0100  ')).toBe('U0100');
  });

  it('leaves empty input as empty (no P prepended to nothing)', () => {
    expect(withDefaultDtcPrefix('')).toBe('');
    expect(withDefaultDtcPrefix('   ')).toBe('');
  });
});

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
