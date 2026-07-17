/**
 * Rà soát 17/7 (phản hồi Sang): handleConnectLink() (thẻ NFC/App Link
 * https://notedri.com/connect, không mang vehicleId/deviceId) trước đây suy xe
 * bằng "thiết bị BLE ghép gần nhất" - sai ngữ nghĩa cho 1 thẻ đại diện "xe của
 * tôi" khi máy có ghép >1 xe/adapter. Test đảm bảo giờ dùng đúng XE MẶC ĐỊNH
 * (is_default), giống quy ước mọi màn hình khác trong app.
 */

let mockNavigateSpy: jest.Mock;
let mockIsReady: boolean;
let mockToken: string | null;
let mockAlertSpy: jest.Mock;
let mockCachedVehicles: any;
let mockListResponse: any;
let mockListError: boolean;

jest.mock('react-native', () => ({
  Alert: { alert: (...args: any[]) => mockAlertSpy(...args) },
}));

jest.mock('../../../navigation/navigationRef', () => ({
  navigationRef: {
    isReady: () => mockIsReady,
    navigate: (...args: any[]) => mockNavigateSpy(...args),
  },
}));

jest.mock('../../../api/vehicles', () => ({
  vehiclesApi: {
    list: () => (mockListError ? Promise.reject(new Error('network')) : Promise.resolve(mockListResponse)),
  },
}));

jest.mock('../../../api/queryClient', () => ({
  queryClient: { getQueryData: () => mockCachedVehicles },
}));

jest.mock('../../../store/authStore', () => ({
  useAuthStore: { getState: () => ({ token: mockToken }) },
}));

jest.mock('../../../i18n', () => ({
  useI18nStore: { getState: () => ({ t: (key: string) => key }) },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { handleConnectLink } = require('../handleConnectLink');

describe('handleConnectLink', () => {
  beforeEach(() => {
    mockNavigateSpy = jest.fn();
    mockAlertSpy = jest.fn();
    mockIsReady = true;
    mockToken = 'valid-token';
    mockCachedVehicles = undefined;
    mockListResponse = { data: [] };
    mockListError = false;
  });

  it('điều hướng tới OBDSetup với XE MẶC ĐỊNH lấy từ cache React Query (không phải xe ghép BLE gần nhất)', async () => {
    mockCachedVehicles = {
      data: [
        { id: 1, ten: 'Xe A', is_default: false },
        { id: 2, ten: 'Xe B (mặc định)', is_default: true },
      ],
    };

    await handleConnectLink();

    expect(mockNavigateSpy).toHaveBeenCalledWith('OBDSetup', { vehicleId: 2, vehicleName: 'Xe B (mặc định)' });
  });

  it('không có xe nào is_default=true -> lấy xe ĐẦU TIÊN trong danh sách (giống quy ước các màn khác)', async () => {
    mockCachedVehicles = { data: [{ id: 5, ten: 'Xe duy nhất', is_default: false }] };

    await handleConnectLink();

    expect(mockNavigateSpy).toHaveBeenCalledWith('OBDSetup', { vehicleId: 5, vehicleName: 'Xe duy nhất' });
  });

  it('cache trống -> gọi thẳng vehiclesApi.list() để lấy xe mặc định', async () => {
    mockCachedVehicles = undefined;
    mockListResponse = { data: [{ id: 9, ten: 'Xe từ API', is_default: true }] };

    await handleConnectLink();

    expect(mockNavigateSpy).toHaveBeenCalledWith('OBDSetup', { vehicleId: 9, vehicleName: 'Xe từ API' });
  });

  it('không có xe nào (cache rỗng + API rỗng) -> hiện Alert, KHÔNG điều hướng', async () => {
    mockCachedVehicles = { data: [] };
    mockListResponse = { data: [] };

    await handleConnectLink();

    expect(mockNavigateSpy).not.toHaveBeenCalled();
    expect(mockAlertSpy).toHaveBeenCalledWith('obd.nfc_no_vehicle_title', 'obd.nfc_no_vehicle_body');
  });

  it('API lỗi mạng -> hiện Alert, KHÔNG điều hướng, KHÔNG throw', async () => {
    mockCachedVehicles = undefined;
    mockListError = true;

    await expect(handleConnectLink()).resolves.toBeUndefined();
    expect(mockNavigateSpy).not.toHaveBeenCalled();
    expect(mockAlertSpy).toHaveBeenCalled();
  });

  it('chưa đăng nhập (token null) -> không điều hướng, không gọi API', async () => {
    mockToken = null;
    mockCachedVehicles = { data: [{ id: 1, ten: 'Xe A', is_default: true }] };

    await handleConnectLink();

    expect(mockNavigateSpy).not.toHaveBeenCalled();
  });

  it('NavigationContainer chưa sẵn sàng (cold start quá lâu) -> bỏ qua, không lỗi', async () => {
    mockIsReady = false;

    await expect(handleConnectLink()).resolves.toBeUndefined();
    expect(mockNavigateSpy).not.toHaveBeenCalled();
  }, 10000);
});
