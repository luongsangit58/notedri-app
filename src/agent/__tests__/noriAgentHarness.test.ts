import { runScenario } from '../platform/TestHarness';
import { NoriChatResponse } from '../../api/nori';

/**
 * Test tự động cho `NoriAgent` qua `TestHarness` (docs/nori-agent-plan.md mục 7 `TestHarness`) -
 * chạy `npm test` (Jest, đã cấu hình sẵn `testMatch: **__tests__**.test.ts`) sẽ tự nhặt file
 * này, thay vì phải tự tay mở app/gõ câu hỏi mỗi lần sửa `LocalIntentMatcher`/tool như trước giờ.
 *
 * Phạm vi (xem docblock `TestHarness.ts`): chỉ cover được các tool KHÔNG gọi network
 * (vehicle.* + knowledge.explainDTC) end-to-end, cộng cơ chế vòng lặp tool-calling/grounding
 * validator/xác nhận ghi dữ liệu qua kịch bản LLM giả. Tool "business" (gọi NoteDriApi -> HTTP
 * thật) KHÔNG được test ở đây - vẫn cần test tay/backend thật như trước.
 */

function toolUseResponse(id: string, name: string, input: Record<string, unknown>): NoriChatResponse {
  return {
    stop_reason: 'tool_use',
    request_id: `fake-${id}`,
    content: [{ type: 'tool_use', id, name, input }],
  };
}

function textResponse(text: string, id = 'final'): NoriChatResponse {
  return { stop_reason: 'end_turn', request_id: `fake-${id}`, content: [{ type: 'text', text }] };
}

describe('NoriAgent - Local Intent Matcher (offline tools, no network)', () => {
  it('answers vehicle.getSpeed locally from the mock snapshot', async () => {
    const result = await runScenario({
      name: 'getSpeed',
      vehicle: { snapshot: { speedKmh: 72 } },
      turns: [{ userText: 'xe đang chạy bao nhiêu km/h', expectSource: 'local', expectReplyContains: '72' }],
    });
    expect(result.passed).toBe(true);
  });

  it('answers vehicle.getLiveData locally, combining all 5 metrics', async () => {
    const result = await runScenario({
      name: 'getLiveData',
      vehicle: { snapshot: { speedKmh: 50, rpm: 2000, coolantTempC: 90, fuelLevelPct: 40, controlModuleVoltage: 13.8 } },
      turns: [{ userText: 'toàn bộ thông số xe hiện tại', expectSource: 'local', expectReplyContains: '50 km/h' }],
    });
    expect(result.passed).toBe(true);
  });

  it('reports BLE disconnected instead of a stale/fake number', async () => {
    const result = await runScenario({
      name: 'getSpeed-disconnected',
      vehicle: { connected: false },
      turns: [{ userText: 'xe đang chạy bao nhiêu km/h', expectSource: 'local', expectReplyContains: 'không kết nối' }],
    });
    expect(result.passed).toBe(true);
  });

  it('answers knowledge.explainDTC locally via the DTC code regex, no BLE needed', async () => {
    const result = await runScenario({
      name: 'explainDTC',
      vehicle: { connected: false },
      turns: [{ userText: 'P0301 là lỗi gì', expectSource: 'local' }],
    });
    expect(result.passed).toBe(true);
  });

  it('blocks the write-intent guard from ever matching a read rule, even with ODO phrasing', async () => {
    // Guard phải thắng - câu này KHÔNG được rơi vào vehicle.getCurrentODO (bug thật 2026-07-28,
    // xem LocalIntentMatcher.ts) - ép sang đường LLM bằng cách script sẵn 1 phản hồi.
    const result = await runScenario({
      name: 'write-intent-guard',
      chatScript: [textResponse('Bạn xác nhận ghi 5588 km giúp mình nhé.')],
      turns: [{ userText: 'ghi công tơ mét 5588', expectSource: 'llm' }],
    });
    expect(result.passed).toBe(true);
  });
});

describe('NoriAgent - grounding validator (LLM path, scripted chatFn)', () => {
  it('blocks a final answer containing a number not backed by any tool_result', async () => {
    const result = await runScenario({
      name: 'grounding-blocked',
      vehicle: { snapshot: { speedKmh: 80 } },
      chatScript: [
        toolUseResponse('t1', 'vehicle.getSpeed', {}),
        // 999 không khớp số liệu thật (80) trong tool_result nào -> phải bị chặn.
        textResponse('Xe bạn đang chạy 999 km/h.'),
      ],
      turns: [{ userText: 'kể chuyện cười cho tôi nghe', expectSource: 'llm', expectReplyNotContains: '999' }],
    });
    expect(result.passed).toBe(true);
  });

  it('allows a final answer whose numbers are grounded in an executed tool_result', async () => {
    const result = await runScenario({
      name: 'grounding-allowed',
      vehicle: { snapshot: { speedKmh: 80 } },
      chatScript: [
        toolUseResponse('t1', 'vehicle.getSpeed', {}),
        textResponse('Xe bạn đang chạy 80 km/h.'),
      ],
      turns: [{ userText: 'kể chuyện cười cho tôi nghe', expectSource: 'llm', expectReplyContains: '80 km/h' }],
    });
    expect(result.passed).toBe(true);
  });

  it('gives up gracefully after MAX_TOOL_LOOP_ITERATIONS instead of looping forever', async () => {
    // ConversationManager.MAX_TOOL_LOOP_ITERATIONS = 6 - script đúng 6 lần tool_use, không bao
    // giờ trả stop_reason khác 'tool_use', để xác nhận vòng lặp THỰC SỰ dừng ở lần thứ 6 thay vì
    // treo app hoặc gọi chatFn vô hạn (harness sẽ ném lỗi rõ ràng nếu gọi tới lần thứ 7).
    const script = Array.from({ length: 6 }, (_, i) => toolUseResponse(`t${i}`, 'vehicle.getSpeed', {}));
    const result = await runScenario({
      name: 'max-loop-iterations',
      vehicle: { snapshot: { speedKmh: 80 } },
      chatScript: script,
      turns: [{ userText: 'kể chuyện cười cho tôi nghe', expectSource: 'local' }],
    });
    // Fallback cuối cùng dùng requestId dạng "local-..." (xem ConversationManager.ts) dù đi qua
    // đường LLM - đúng theo thiết kế hiện tại (source name hơi lệch nghĩa nhưng đã biết trước).
    expect(result.turns[0].replyText).toContain('xử lý mất nhiều bước quá');
  });
});

describe('NoriAgent - mutating tool confirmation (Phase 2), never touches the network', () => {
  it('never calls NoteDriApi when the user declines the confirmation prompt', async () => {
    const result = await runScenario({
      name: 'odometer-declined',
      confirmAction: async () => false, // user bấm "Huỷ"
      chatScript: [
        toolUseResponse('t1', 'odometer.create', { odometer: 5588 }),
        textResponse('Được rồi, mình không ghi lại nhé.'),
      ],
      turns: [{ userText: 'ghi công tơ mét 5588', expectSource: 'llm' }],
    });
    expect(result.passed).toBe(true);

    // Xác nhận ToolExecutor THỰC SỰ trả 'cancelled' (không hề gọi tới registry.execute() ->
    // NoteDriApi -> network) - không chỉ suy luận từ câu trả lời cuối (vốn đã script sẵn).
    const toolResultBlock = result.messages
      .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
      .find((b) => b.type === 'tool_result');
    expect(toolResultBlock).toBeDefined();
    if (toolResultBlock?.type === 'tool_result') {
      expect(JSON.parse(toolResultBlock.content)).toMatchObject({ status: 'cancelled', reason: 'user_declined' });
    }
  });

  it('rejects fuel.create with fewer than 2 of 3 amounts BEFORE ever reaching the network', async () => {
    const result = await runScenario({
      name: 'fuel-create-insufficient-data',
      confirmAction: async () => true, // user đồng ý, nhưng tool tự validate input trước khi ghi
      chatScript: [
        toolUseResponse('t1', 'fuel.create', { tong_tien: 50000 }), // chỉ 1/3 số
        textResponse('Bạn cho mình biết thêm số lít hoặc đơn giá nhé.'),
      ],
      turns: [{ userText: 'ghi đổ xăng 50 nghìn', expectSource: 'llm' }],
    });
    expect(result.passed).toBe(true);

    const toolResultBlock = result.messages
      .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
      .find((b) => b.type === 'tool_result');
    expect(toolResultBlock).toBeDefined();
    if (toolResultBlock?.type === 'tool_result') {
      expect(JSON.parse(toolResultBlock.content)).toMatchObject({ status: 'invalid_input', reason: 'need_at_least_2_of_3_amounts' });
    }
  });
});
