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
  it('returns [] for empty input', () => {
    expect(suggestDtcOffline('')).toEqual([]);
    expect(suggestDtcOffline('   ')).toEqual([]);
  });

  // Rà soát 22/7: gõ số trước ("0") luôn hiện gợi ý ngay sau 1 phím (withDefaultDtcPrefix
  // tự thêm "P" -> "P0", đủ 2 ký tự) - nhưng gõ CHỮ hệ thống trước (P/C/B/U) chỉ có 1 ký
  // tự, không có gì để cộng thêm, nên trước đây bị chặn ở ngưỡng 2 ký tự -> màn hình trống
  // đúng lúc gõ chữ, user báo "gõ P không ăn thua". Mỗi hệ (không chỉ P) phải có gợi ý ngay
  // từ ký tự hệ thống đầu tiên để đối xứng với đường gõ số.
  it('shows suggestions from a single system-letter prefix, for every system (P/C/B/U)', () => {
    expect(suggestDtcOffline('P').length).toBeGreaterThan(0);
    expect(suggestDtcOffline('P').every((s) => s.code.startsWith('P'))).toBe(true);
    expect(suggestDtcOffline('C').every((s) => s.code.startsWith('C'))).toBe(true);
    expect(suggestDtcOffline('C').length).toBeGreaterThan(0);
    expect(suggestDtcOffline('B').every((s) => s.code.startsWith('B'))).toBe(true);
    expect(suggestDtcOffline('B').length).toBeGreaterThan(0);
    expect(suggestDtcOffline('U').every((s) => s.code.startsWith('U'))).toBe(true);
    expect(suggestDtcOffline('U').length).toBeGreaterThan(0);
  });

  // suggestDtcOffline không tự thêm "P" - việc đó là của withDefaultDtcPrefix ở tầng màn
  // hình (DtcLookupScreen luôn gọi suggestDtcOffline(withDefaultDtcPrefix(input))). Test
  // đúng cách 2 hàm phối hợp: gõ "03" (qua withDefaultDtcPrefix -> "P03") phải cho ĐÚNG
  // gợi ý như gõ "P03" thẳng (đã tự có prefix, withDefaultDtcPrefix để nguyên).
  it('gives identical suggestions whether the system letter is typed explicitly or inferred from a digit', () => {
    expect(suggestDtcOffline(withDefaultDtcPrefix('P03'))).toEqual(suggestDtcOffline(withDefaultDtcPrefix('03')));
    expect(suggestDtcOffline(withDefaultDtcPrefix('P0300'))).toEqual(suggestDtcOffline(withDefaultDtcPrefix('0300')));
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
