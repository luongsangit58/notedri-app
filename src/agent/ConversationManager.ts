import { noriApi } from '../api/nori';
import { ToolExecutor } from './ToolExecutor';
import { ToolRegistry } from './ToolRegistry';
import { NoriContentBlock, NoriMessage, NoriToolCall, ToolContext } from './types';

const MAX_TOOL_LOOP_ITERATIONS = 6;

/**
 * Giữ transcript tool-call (mục 1: "Transcript tool là nguồn sự thật"), gọi API backend, điều
 * phối vòng lặp tool-calling, và grounding validator (mục 1, 18). Lịch sử chat văn bản tự do
 * (`history`) chỉ là lớp hiển thị phái sinh từ transcript này.
 *
 * Grounding validator (Phase 1, bản thật - không chỉ dặn dò prompt): mọi token giống-số trong
 * câu trả lời cuối phải xuất hiện trong ít nhất 1 tool_result đã thực thi TRONG LƯỢT NÀY. Nếu
 * không, coi output đó là vi phạm hợp đồng grounding - không hiển thị nguyên văn, trả về câu
 * an toàn kèm log cảnh báo để dev soát lại (không phải throw làm crash hội thoại).
 */
export class ConversationManager {
  private messages: NoriMessage[] = [];

  constructor(
    private registry: ToolRegistry,
    private executor: ToolExecutor,
    private getContext: () => ToolContext,
  ) {}

  getMessages(): NoriMessage[] {
    return this.messages;
  }

  async sendMessage(userText: string): Promise<string> {
    this.messages.push({ role: 'user', content: userText });

    const toolResultContentsThisTurn: string[] = [];
    const tools = this.registry.getSchemas();

    for (let iteration = 0; iteration < MAX_TOOL_LOOP_ITERATIONS; iteration++) {
      let response;
      try {
        response = await noriApi.chat(this.messages, tools);
      } catch (err) {
        // Lỗi mạng/API (backend 502 khi provider lỗi, mất mạng, timeout...) - trước đây không
        // bắt ở đây sẽ làm cả sendMessage() reject, kéo lên tới noriAgentStore mà không nơi
        // nào catch, khiến user chỉ thấy tin nhắn của mình gửi đi mà KHÔNG BAO GIỜ có phản hồi
        // (kể cả báo lỗi) - "thinking" tự tắt (finally ở NoriAgent) nhưng im lặng hoàn toàn.
        // Trả câu an toàn thay vì throw, đúng nguyên tắc "NoriAgent.sendMessage() luôn resolve".
        console.warn('[NoriAgent] Lỗi gọi backend /ai/nori/chat:', err);
        // KHÔNG pop tin nhắn vừa push: transcript hiện tại (user text, hoặc user+tool_result
        // nếu lỗi xảy ra ở vòng lặp tool sau) vẫn là 1 chuỗi hợp lệ kết thúc bằng lượt "user" -
        // lượt sendMessage() kế tiếp chỉ cần nối thêm 1 user turn nữa lên trên (Anthropic tự
        // gộp 2 lượt user liên tiếp thành 1 turn, không lỗi "roles must alternate").
        return 'Mình đang không kết nối được với máy chủ, bạn kiểm tra mạng rồi thử lại giúp mình nhé.';
      }

      const { stop_reason: stopReason, content } = response.data;

      this.messages.push({ role: 'assistant', content });

      if (stopReason !== 'tool_use') {
        const text = extractText(content);
        return this.applyGroundingValidator(text, toolResultContentsThisTurn);
      }

      const toolCalls = content.filter(
        (b): b is Extract<NoriContentBlock, { type: 'tool_use' }> => b.type === 'tool_use',
      );

      const toolResultBlocks: NoriContentBlock[] = [];
      for (const block of toolCalls) {
        const call: NoriToolCall = { id: block.id, name: block.name, input: block.input };
        const result = await this.executor.execute(call, this.getContext());
        toolResultContentsThisTurn.push(result.content);
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: result.toolUseId,
          content: result.content,
          is_error: result.isError,
        });
      }

      this.messages.push({ role: 'user', content: toolResultBlocks });
    }

    return 'Xin lỗi, mình đang xử lý mất nhiều bước quá, bạn hỏi lại theo cách khác giúp mình nhé.';
  }

  private applyGroundingValidator(text: string, toolResultContents: string[]): string {
    const numberTokens = text.match(/\d+([.,]\d+)?/g) ?? [];
    const ungrounded = numberTokens.filter(
      (token) => !toolResultContents.some((result) => result.includes(token)),
    );

    if (ungrounded.length > 0) {
      console.warn(
        `[NoriAgent] Grounding validator chặn output chứa số liệu không truy được về tool_result: ${ungrounded.join(', ')}`,
      );
      return 'Mình chưa xác nhận được số liệu này từ dữ liệu xe thật, bạn hỏi lại cụ thể hơn để mình tra đúng thông tin giúp nhé.';
    }

    return text;
  }
}

function extractText(content: NoriContentBlock[]): string {
  return content
    .filter((b): b is Extract<NoriContentBlock, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}
