import { NoriAgent } from '../NoriAgent';
import { ChatFn } from '../ConversationManager';
import { ConfirmActionFn } from '../ToolExecutor';
import { NoriMessage } from '../types';
import { NoriChatResponse } from '../../api/nori';
import { MockVehicleAdapter } from './MockVehicleAdapter';

/**
 * Chạy `NoriAgent` thật (không phải bản rút gọn viết lại riêng cho test) qua đúng 2 điểm nối đã
 * thiết kế sẵn để test được (docs/nori-agent-plan.md mục 7 `TestHarness`/`MockAdapter`):
 *   - `MockVehicleAdapter` thay Bluetooth/OBD thật.
 *   - `ChatFn` (bơm qua `NoriAgent`/`ConversationManager`) thay HTTP thật tới backend - kịch bản
 *     LLM giả dựng sẵn, không cần mạng/API key.
 *
 * Phạm vi THẬT SỰ cover được (không phóng đại): mọi tool KHÔNG gọi network (8 `vehicle.*` +
 * `knowledge.explainDTC`) được test end-to-end (matcher thật -> tool thật -> template thật).
 * Các tool "business" (expense.summary, maintenance.*, cost, tìm trạm...) gọi `NoteDriApi` ->
 * HTTP thật tới backend Laravel - harness này KHÔNG mock lớp đó, nên kịch bản đi tới các tool
 * này (kể cả khi khớp Local) sẽ nhận lỗi mạng thật từ `ToolExecutor` (bắt gọn thành
 * `tool_execution_error`, không crash, nhưng KHÔNG xác nhận được logic nghiệp vụ thật) - vẫn cần
 * test tay/backend thật cho nhóm này như trước giờ.
 */

export type ScenarioTurn = {
  userText: string;
  /** Nếu set: kiểm tra câu trả lời có đi đúng đường (local matcher / LLM) như dự tính không -
   * bắt được regression kiểu "câu này lẽ ra local nhưng giờ rơi về LLM" (hoặc ngược lại). */
  expectSource?: 'local' | 'llm';
  expectReplyContains?: string;
  expectReplyNotContains?: string;
};

export type Scenario = {
  name: string;
  vehicle?: ConstructorParameters<typeof MockVehicleAdapter>[0];
  vehicleId?: number | null;
  confirmAction?: ConfirmActionFn;
  /** Kịch bản phản hồi LLM giả, tiêu thụ THEO THỨ TỰ mỗi lần `ConversationManager` gọi chatFn
   * (không phải theo turn - 1 turn có thể lặp vòng tool-calling nhiều lần, tiêu thụ nhiều phần
   * tử liên tiếp trong mảng này). Turn nào chỉ khớp Local Matcher thì không tiêu thụ phần tử
   * nào (không bao giờ gọi chatFn). */
  chatScript?: NoriChatResponse[];
  turns: ScenarioTurn[];
};

export type TurnResult = {
  userText: string;
  passed: boolean;
  failures: string[];
  replyText?: string;
  replySource?: 'local' | 'llm';
};

export type ScenarioResult = {
  name: string;
  passed: boolean;
  turns: TurnResult[];
  /** Toàn bộ transcript tool-call sau khi chạy hết kịch bản (`NoriAgent.getMessages()`) - dùng
   * để kiểm tra sâu hơn câu trả lời cuối, vd nội dung `tool_result` thật (status
   * cancelled/invalid_input) khi câu trả lời văn bản cuối cùng chỉ là text đã script sẵn, không
   * tự phản ánh được ToolExecutor có thật sự chặn đúng hay không. */
  messages: NoriMessage[];
};

function buildScriptedChatFn(script: NoriChatResponse[] | undefined, scenarioName: string): ChatFn {
  let i = 0;
  return async () => {
    if (!script || i >= script.length) {
      // Ném lỗi rõ ràng thay vì hang vô thời hạn hoặc âm thầm trả undefined - kịch bản thiếu
      // hoặc câu hỏi rơi vào LLM ngoài dự tính đều là tín hiệu quan trọng cần thấy ngay trong
      // kết quả test, không phải 1 lỗi mơ hồ ở nơi khác.
      throw new Error(
        `[TestHarness] "${scenarioName}": chatFn được gọi lần thứ ${i + 1} nhưng chatScript chỉ có ${script?.length ?? 0} phần tử.`,
      );
    }
    return { data: script[i++] };
  };
}

export async function runScenario(scenario: Scenario): Promise<ScenarioResult> {
  const vehicleIO = new MockVehicleAdapter(scenario.vehicle);
  const chatFn = buildScriptedChatFn(scenario.chatScript, scenario.name);
  const vehicleId = scenario.vehicleId === undefined ? 1 : scenario.vehicleId;
  const agent = new NoriAgent(vehicleIO, () => vehicleId, scenario.confirmAction, chatFn);

  const turnResults: TurnResult[] = [];

  for (const turn of scenario.turns) {
    const failures: string[] = [];
    let replyText: string | undefined;
    let replySource: 'local' | 'llm' | undefined;

    try {
      const reply = await agent.sendMessage(turn.userText);
      replyText = reply.text;
      replySource = reply.source;

      if (turn.expectSource && reply.source !== turn.expectSource) {
        failures.push(`expected source="${turn.expectSource}", got "${reply.source}"`);
      }
      if (turn.expectReplyContains && !reply.text.includes(turn.expectReplyContains)) {
        failures.push(`expected reply to contain "${turn.expectReplyContains}", got "${reply.text}"`);
      }
      if (turn.expectReplyNotContains && reply.text.includes(turn.expectReplyNotContains)) {
        failures.push(`expected reply NOT to contain "${turn.expectReplyNotContains}", got "${reply.text}"`);
      }
    } catch (err) {
      failures.push(`threw: ${err instanceof Error ? err.message : String(err)}`);
    }

    turnResults.push({ userText: turn.userText, passed: failures.length === 0, failures, replyText, replySource });
  }

  return {
    name: scenario.name,
    passed: turnResults.every((t) => t.passed),
    turns: turnResults,
    messages: agent.getMessages(),
  };
}

export async function runScenarios(scenarios: Scenario[]): Promise<ScenarioResult[]> {
  const results: ScenarioResult[] = [];
  for (const s of scenarios) {
    results.push(await runScenario(s));
  }
  return results;
}
