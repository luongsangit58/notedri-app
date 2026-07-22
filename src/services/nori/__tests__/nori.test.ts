import { noriMoodFromScore } from '../nori';

describe('noriMoodFromScore', () => {
  it('is happy for a high score with no organ issues', () => {
    expect(noriMoodFromScore(85, false, false)).toBe('happy');
  });

  it('is warn for a mid score', () => {
    expect(noriMoodFromScore(55, false, false)).toBe('warn');
  });

  it('is urgent for a low score', () => {
    expect(noriMoodFromScore(20, false, false)).toBe('urgent');
  });

  it('is unknown when there is no score and no warn organ', () => {
    expect(noriMoodFromScore(null, false, false)).toBe('unknown');
    expect(noriMoodFromScore(undefined, false, false)).toBe('unknown');
  });

  it('is urgent whenever an organ is urgent, regardless of score', () => {
    expect(noriMoodFromScore(95, true, false)).toBe('urgent');
    expect(noriMoodFromScore(null, true, false)).toBe('urgent');
  });

  // Rà soát 22/7: bug đã sửa - điểm cao (>=70) nhưng có 1 organ đang ở mức 'warn'
  // (vd sắp hết hạn đăng kiểm) trước đây vẫn ra mood 'happy' (mặt vui) trong khi
  // dòng text bên dưới (NoriDailyCard/HomeScreen, ưu tiên hiện organ warn/urgent
  // nếu có) lại nói "có điều cần xem" - mâu thuẫn ngay trên cùng 1 card.
  it('downgrades a high score to warn when a warn organ exists (no contradicting a happy face with a warning message)', () => {
    expect(noriMoodFromScore(90, false, true)).toBe('warn');
  });

  it('does not downgrade to warn territory below the score thresholds - urgent still wins there', () => {
    expect(noriMoodFromScore(20, false, true)).toBe('urgent');
  });

  it('treats a warn organ with no score at all as warn, not unknown', () => {
    expect(noriMoodFromScore(null, false, true)).toBe('warn');
  });
});
