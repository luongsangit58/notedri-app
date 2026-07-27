import { AnthropicToolSchema, ToolContext, ToolDefinition } from './types';

/**
 * Đăng ký + validate tool theo schema, có version ở tên file (docs/nori-agent-plan.md mục 5,
 * 10.1). Phase 1 chưa cần Tool SDK/manifest chính thức (mục 12, câu hỏi mở) - registry này là
 * bản tối giản: Map tên -> định nghĩa, xuất schema đúng shape Anthropic `tools[]`.
 */
export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" đã được đăng ký - tên tool phải duy nhất.`);
    }
    this.tools.set(tool.name, tool);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /** Danh sách schema gửi lên backend làm `tools` param cho Anthropic Messages API. */
  getSchemas(): AnthropicToolSchema[] {
    return this.list().map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));
  }

  async execute(name: string, input: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool "${name}" không tồn tại trong ToolRegistry.`);
    }
    return tool.execute(input, ctx);
  }
}
