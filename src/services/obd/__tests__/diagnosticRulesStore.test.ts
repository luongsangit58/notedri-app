/**
 * Rule Engine v2 lên server (14/7): getActiveRules() phải luôn trả về được
 * rule (không bao giờ rỗng) - snapshot bundled là lưới an toàn cuối cùng khi
 * chưa tải được từ server hoặc mất mạng.
 */
import bundledSnapshot from '../../../data/diagnosticRules.json';

const mockGet = jest.fn();
jest.mock('../../../api/client', () => ({ __esModule: true, default: { get: (...args: any[]) => mockGet(...args) } }));

describe('diagnosticRulesStore', () => {
  // require() thay vì import() động: jest môi trường này không bật ESM dynamic
  // import runtime - resetModules()+require() là cách chuẩn để lấy state module
  // mới sau mỗi test (mỗi module-level singleton activeRules cần tinh khôi).
  // AsyncStorage cũng phải require() LẠI trong cùng lần reset - moduleNameMapper
  // trỏ tới file mock thật, resetModules() làm nó tự tạo storage nội bộ mới;
  // import tĩnh ở đầu file sẽ trỏ vào 1 instance cũ, đọc luôn ra null.
  function freshStore() {
    jest.resetModules();
    return {
      ...require('../diagnosticRulesStore'),
      AsyncStorage: require('@react-native-async-storage/async-storage'),
    };
  }

  beforeEach(() => {
    mockGet.mockReset();
  });

  it('trước khi tải từ server: dùng bundled snapshot, không bao giờ rỗng', () => {
    const { getActiveRules } = freshStore();
    expect(getActiveRules().length).toBe(bundledSnapshot.rules.length);
  });

  it('refreshRulesFromServer thành công -> thay bằng rule server + cache lại', async () => {
    const serverRules = [{ id: 'test-rule', title_vi: 'x', action_vi: 'y', severity: 'warn', can_drive: 'yes', required_signals: [], min_session_seconds: 0, conditions: [], source: 'test', beta: true }];
    mockGet.mockResolvedValueOnce({ data: { data: { version: 99, rules: serverRules } } });

    const { getActiveRules, refreshRulesFromServer, AsyncStorage } = freshStore();
    await refreshRulesFromServer();

    expect(getActiveRules()).toEqual(serverRules);
    const cached = JSON.parse((await AsyncStorage.getItem('obd_diagnostic_rules_cache')) ?? 'null');
    expect(cached.version).toBe(99);
  });

  it('mất mạng khi refresh -> giữ nguyên rule đang có (không throw, không xoá)', async () => {
    mockGet.mockRejectedValueOnce(new Error('network down'));

    const { getActiveRules, refreshRulesFromServer } = freshStore();
    const before = getActiveRules();
    await expect(refreshRulesFromServer()).resolves.toBeUndefined();
    expect(getActiveRules()).toEqual(before);
  });

  it('server trả rules rỗng -> KHÔNG ghi đè (tránh evaluate() luôn trả [])', async () => {
    mockGet.mockResolvedValueOnce({ data: { data: { version: 1, rules: [] } } });

    const { getActiveRules, refreshRulesFromServer } = freshStore();
    await refreshRulesFromServer();
    expect(getActiveRules().length).toBe(bundledSnapshot.rules.length);
  });
});
