/**
 * handleOfferCodeClaimLink() chỉ claim (ghi dấu vết tham khảo) khi ĐANG đăng nhập sẵn,
 * và LUÔN mở tiếp link redeem thật ("target") dù claim thành công/lỗi/bỏ qua - khách
 * không được để bị kẹt lại vì 1 lỗi API không quan trọng.
 */

let mockOpenURLSpy: jest.Mock;
let mockToken: string | null;
let mockClaimOfferCode: jest.Mock;

jest.mock('react-native', () => ({
  Linking: { openURL: (...args: any[]) => mockOpenURLSpy(...args) },
}));

jest.mock('../../../store/authStore', () => ({
  useAuthStore: { getState: () => ({ token: mockToken }) },
}));

jest.mock('../../../api/offerCodes', () => ({
  claimOfferCode: (...args: any[]) => mockClaimOfferCode(...args),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { parseOfferCodeClaimUrl, handleOfferCodeClaimLink } = require('../handleOfferCodeClaimLink');

describe('parseOfferCodeClaimUrl', () => {
  it('parse đúng token + target (đã decode) từ URL hợp lệ', () => {
    const target = encodeURIComponent('https://play.google.com/redeem?code=ABC123');
    const result = parseOfferCodeClaimUrl(`notedri://redeem?token=xyz789&target=${target}`);
    expect(result).toEqual({ token: 'xyz789', target: 'https://play.google.com/redeem?code=ABC123' });
  });

  it('trả null nếu thiếu token hoặc target', () => {
    expect(parseOfferCodeClaimUrl('notedri://redeem?token=xyz789')).toBeNull();
    expect(parseOfferCodeClaimUrl('notedri://redeem?target=abc')).toBeNull();
  });

  it('trả null với URL không khớp scheme/path', () => {
    expect(parseOfferCodeClaimUrl('notedri://autodrive?vehicleId=1')).toBeNull();
    expect(parseOfferCodeClaimUrl('https://notedri.com/connect')).toBeNull();
  });
});

describe('handleOfferCodeClaimLink', () => {
  beforeEach(() => {
    mockOpenURLSpy = jest.fn();
    mockClaimOfferCode = jest.fn().mockResolvedValue(undefined);
    mockToken = null;
  });

  const url = `notedri://redeem?token=xyz789&target=${encodeURIComponent('https://apps.apple.com/redeem?code=ABC')}`;

  it('bỏ qua URL không hợp lệ, không mở gì cả', async () => {
    await handleOfferCodeClaimLink('notedri://autodrive?vehicleId=1');
    expect(mockOpenURLSpy).not.toHaveBeenCalled();
    expect(mockClaimOfferCode).not.toHaveBeenCalled();
  });

  it('chưa đăng nhập: không claim, vẫn mở target', async () => {
    mockToken = null;
    await handleOfferCodeClaimLink(url);
    expect(mockClaimOfferCode).not.toHaveBeenCalled();
    expect(mockOpenURLSpy).toHaveBeenCalledWith('https://apps.apple.com/redeem?code=ABC');
  });

  it('đã đăng nhập: claim rồi mở target', async () => {
    mockToken = 'sometoken';
    await handleOfferCodeClaimLink(url);
    expect(mockClaimOfferCode).toHaveBeenCalledWith('xyz789');
    expect(mockOpenURLSpy).toHaveBeenCalledWith('https://apps.apple.com/redeem?code=ABC');
  });

  it('claim lỗi: vẫn mở target, không throw', async () => {
    mockToken = 'sometoken';
    mockClaimOfferCode.mockRejectedValue(new Error('network'));
    await expect(handleOfferCodeClaimLink(url)).resolves.toBeUndefined();
    expect(mockOpenURLSpy).toHaveBeenCalledWith('https://apps.apple.com/redeem?code=ABC');
  });
});
