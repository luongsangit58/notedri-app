import { NoriAgent } from '../NoriAgent';
import { MockVehicleAdapter } from '../platform/MockVehicleAdapter';
import { NoriChatResponse } from '../../api/nori';

/**
 * Bug thật bắt được lúc rà soát 2026-07-28: `noriAgentStore.ts` trước đây không lưu lại (và
 * không bao giờ gọi) hàm huỷ đăng ký trả về từ `agent.onStateChange()`/`agent.onProgress()` -
 * nếu `dispose()` (vd logout) xảy ra trong lúc 1 lượt hỏi còn đang bay (request mạng chưa xong),
 * rồi user đăng nhập lại NGAY LẬP TỨC (agent MỚI, phiên MỚI), request CŨ khi cuối cùng resolve
 * xong vẫn gọi listener CŨ - âm thầm ghi đè state của phiên MỚI bằng dữ liệu của agent đã bị
 * dispose từ lâu. Test này xác nhận CƠ CHẾ gốc mà `noriAgentStore.dispose()` giờ dựa vào để né
 * bug này: listener PHẢI ngừng nhận sự kiện ngay sau khi hàm huỷ đăng ký được gọi, kể cả khi
 * request đang bay lúc đó chỉ hoàn tất SAU thời điểm huỷ đăng ký.
 */
describe('NoriAgent - onStateChange/onProgress unsubscribe', () => {
  it('stops notifying a listener after unsubscribe, even if the in-flight request resolves later', async () => {
    let resolveChat!: (value: { data: NoriChatResponse }) => void;
    const pendingChat = new Promise<{ data: NoriChatResponse }>((resolve) => {
      resolveChat = resolve;
    });

    const agent = new NoriAgent(new MockVehicleAdapter(), () => 1, undefined, async () => pendingChat);

    const states: string[] = [];
    const unsubscribe = agent.onStateChange((s) => states.push(s));

    // "kể chuyện cười cho tôi nghe" không khớp mẫu Local nào (xác nhận qua matchLocalIntent()
    // thật ở lượt trước) - chắc chắn đi qua đường LLM/chatFn, không trả lời tức thời.
    const sendPromise = agent.sendMessage('kể chuyện cười cho tôi nghe');

    // setState('thinking') chạy ĐỒNG BỘ ngay khi gọi sendMessage() (trước await đầu tiên bên
    // trong) - đã nhận được sự kiện này trước khi request kịp "bay".
    expect(states).toEqual(['thinking']);

    // Giả lập dispose() xảy ra NGAY BÂY GIỜ, trong lúc request vẫn đang chờ.
    unsubscribe();

    // Request "cũ" cuối cùng cũng resolve xong (finally trong NoriAgent.sendMessage() sẽ gọi
    // setState('idle')) - NHƯNG listener đã bị huỷ đăng ký từ trước, không được nhận thêm gì.
    resolveChat({
      data: { stop_reason: 'end_turn', request_id: 'r1', content: [{ type: 'text', text: 'ok' }] },
    });
    await sendPromise;

    expect(states).toEqual(['thinking']);
  });

  it('same guarantee applies to onProgress', async () => {
    let resolveChat!: (value: { data: NoriChatResponse }) => void;
    const pendingChat = new Promise<{ data: NoriChatResponse }>((resolve) => {
      resolveChat = resolve;
    });

    const agent = new NoriAgent(new MockVehicleAdapter(), () => 1, undefined, async () => pendingChat);

    const stages: unknown[] = [];
    const unsubscribe = agent.onProgress((p) => stages.push(p));

    const sendPromise = agent.sendMessage('kể chuyện cười cho tôi nghe');
    expect(stages).toEqual([{ phase: 'thinking' }]);

    unsubscribe();

    resolveChat({
      data: { stop_reason: 'end_turn', request_id: 'r2', content: [{ type: 'text', text: 'ok' }] },
    });
    await sendPromise;

    expect(stages).toEqual([{ phase: 'thinking' }]);
  });
});
