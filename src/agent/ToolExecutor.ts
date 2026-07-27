import { ToolRegistry } from './ToolRegistry';
import { SafetyPolicy } from './safety/SafetyPolicy';
import { NoriToolCall, NoriToolResult, ToolContext } from './types';

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

    if (!this.registry.has(call.name)) {
      return {
        toolUseId: call.id,
        content: JSON.stringify({ status: 'unavailable', reason: 'unknown_tool' }),
        isError: true,
      };
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
