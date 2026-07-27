import { ToolRegistry } from './ToolRegistry';
import { SafetyPolicy } from './safety/SafetyPolicy';
import { NoriToolCall, NoriToolResult, ToolContext } from './types';

/** Hỏi user xác nhận trước khi thực thi 1 tool `requiresConfirmation` - trả về true nếu user
 * đồng ý. Do UI (Modal) triển khai và bơm vào từ NoriAgent (mục 7, xem writeTools.ts). */
export type ConfirmActionFn = (toolName: string, summary: string) => Promise<boolean>;

/**
 * Tách vận chuyển tool (validate + SafetyPolicy + gọi ToolRegistry) khỏi logic chọn tool của
 * LLM (docs/nori-agent-plan.md mục 10.1). Không bao giờ để lỗi tool làm crash vòng lặp hội
 * thoại - mọi lỗi (kể cả bị SafetyPolicy chặn) đều trả về dạng NoriToolResult is_error để
 * ConversationManager gửi ngược lại cho LLM tự xử lý (xin lỗi/hỏi lại), thay vì throw.
 */
export class ToolExecutor {
  constructor(
    private registry: ToolRegistry,
    private safetyPolicy: SafetyPolicy,
    private confirmAction?: ConfirmActionFn,
  ) {}

  async execute(call: NoriToolCall, ctx: ToolContext): Promise<NoriToolResult> {
    const gate = this.safetyPolicy.canUseTool(call.name);
    if (!gate.allowed) {
      return {
        toolUseId: call.id,
        content: JSON.stringify({ status: 'blocked', reason: gate.reason }),
        isError: true,
      };
    }

    const tool = this.registry.get(call.name);
    if (!tool) {
      return {
        toolUseId: call.id,
        content: JSON.stringify({ status: 'unavailable', reason: 'unknown_tool' }),
        isError: true,
      };
    }

    if (tool.requiresConfirmation) {
      // Không có UI xác nhận (chưa wire confirmAction) -> an toàn hơn là từ chối luôn còn hơn
      // âm thầm ghi dữ liệu không qua xác nhận (mục 7: mutating/destructive PHẢI qua confirm).
      const summary = tool.confirmationSummary?.(call.input) ?? `Thực hiện "${call.name}"?`;
      const approved = this.confirmAction ? await this.confirmAction(call.name, summary) : false;
      if (!approved) {
        return {
          toolUseId: call.id,
          content: JSON.stringify({ status: 'cancelled', reason: 'user_declined' }),
        };
      }
    }

    try {
      const result = await this.registry.execute(call.name, call.input, ctx);
      return { toolUseId: call.id, content: JSON.stringify(result) };
    } catch (err) {
      return {
        toolUseId: call.id,
        content: JSON.stringify({ status: 'unavailable', reason: 'tool_execution_error' }),
        isError: true,
      };
    }
  }
}
