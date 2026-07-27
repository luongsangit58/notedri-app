/**
 * Kiểu dữ liệu lõi cho Nori Agent (xem docs/nori-agent-plan.md mục 5, 10.1).
 * KHÔNG dùng tên "Chat" cho các type cốt lõi - giữ đúng tinh thần "Nori là Agent".
 */

/** Một lượt hội thoại - map thẳng vào content block của Anthropic Messages API. */
export type NoriMessage = {
  role: 'user' | 'assistant';
  content: string | NoriContentBlock[];
};

export type NoriContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export type NoriToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type NoriToolResult = {
  toolUseId: string;
  /** JSON.stringify của kết quả tool - đây là "bằng chứng" grounding validator đối chiếu. */
  content: string;
  isError?: boolean;
};

/**
 * Kết quả chuẩn hoá mọi tool đọc Vehicle Cache (mục 6): luôn có age_seconds hoặc
 * trạng thái "unavailable" có cấu trúc thay vì throw lỗi - để lớp format LLM viết
 * được câu tự nhiên ("xe hiện không kết nối...") thay vì crash hay im lặng.
 */
export type ToolReading<T> =
  | ({ status: 'ok' } & T & { age_seconds: number })
  | { status: 'unavailable'; reason: string };

/** Gợi ý hiển thị tuỳ chọn cho PlatformAdapter tương lai (mục 8) - Phase 1 không dùng tới. */
export type RenderHint = 'line_chart' | 'gauge' | 'text';

export type ToolAuthority = 'read-only' | 'mutating' | 'destructive';

export type ToolContext = {
  /** Xe đang active - tham số thay đổi được, không hardcode 1 xe (mục 7, MultiVehicleContext). */
  vehicleId: number | null;
};

export type ToolDefinition = {
  name: string;
  description: string;
  authority: ToolAuthority;
  /** JSON Schema chuẩn Anthropic tool `input_schema`. */
  inputSchema: Record<string, unknown>;
  /** requiresConfirmation bắt buộc true cho authority=destructive (mục 6/7) - chưa dùng ở Phase 1. */
  requiresConfirmation?: boolean;
  execute: (input: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
};

/** Schema gửi lên backend đúng shape `tools[]` của Anthropic Messages API. */
export type AnthropicToolSchema = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};
