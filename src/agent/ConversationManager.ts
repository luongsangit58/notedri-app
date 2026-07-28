import { noriApi, NoriChatResponse } from '../api/nori';
import { ToolExecutor } from './ToolExecutor';
import { ToolRegistry } from './ToolRegistry';
import { AnthropicToolSchema, NoriContentBlock, NoriMessage, NoriToolCall, ToolContext } from './types';
import { matchLocalIntent } from './LocalIntentMatcher';
import { buildLocalReply } from './LocalReplyTemplates';

const MAX_TOOL_LOOP_ITERATIONS = 6;

/** Chữ ký `noriApi.chat` - tách riêng để `TestHarness.ts` bơm được 1 hàm giả (kịch bản LLM dựng
 * sẵn) thay vì gọi HTTP thật, không cần network/API key để test vòng lặp tool-calling. */
export type ChatFn = (
  messages: NoriMessage[],
  tools: AnthropicToolSchema[],
) => Promise<{ data: NoriChatResponse }>;

export type NoriReply = {
  text: string;
  /** Dùng để chấm điểm câu trả lời (noriApi.feedback) - "local-*" cho câu trả lời không qua
   * LLM (không có request thật ở backend để nối log, nhưng vẫn cần id để UI theo dõi được). */
  requestId: string;
  source: 'local' | 'llm';
};

/**
 * Trạng thái CHI TIẾT hơn "thinking" (mục cải thiện UX 2026-07-28, góp ý user: 1 dòng "đang
 * kiểm tra..." tĩnh suốt cả lượt hỏi cảm giác như treo, nhất là lúc lái xe/dùng giọng nói) -
 * "phản hồi 2 pha": phân biệt lúc LLM đang suy nghĩ/chọn tool (`thinking`) với lúc app đang thật
 * sự đọc dữ liệu xe/gọi API (`calling_tool`, kèm tên tool để UI đoán được câu đệm phù hợp, xem
 * `progressText.ts`). KHÔNG áp dụng cho đường Local Matcher (trả lời tức thời, không có giai
 * đoạn nào đáng báo).
 */
export type ProgressStage = { phase: 'thinking' } | { phase: 'calling_tool'; toolNames: string[] };

let localRequestCounter = 0;

/**
 * Giữ transcript tool-call (mục 1: "Transcript tool là nguồn sự thật"), gọi API backend, điều
 * phối vòng lặp tool-calling, và grounding validator (mục 1, 18). Lịch sử chat văn bản tự do
 * (`history`) chỉ là lớp hiển thị phái sinh từ transcript này.
 *
 * Matcher tất định (mục 4, câu hỏi mở mục 12 - đã quyết định làm): câu hỏi khớp mẫu rõ ràng
 * được trả lời THẲNG từ tool_result, không gọi LLM - nhanh hơn, rẻ hơn, và grounding tự động
 * đúng 100% (không có bước LLM diễn đạt lại nên không có chỗ để bịa số).
 *
 * Grounding validator (Phase 1, bản thật - không chỉ dặn dò prompt, chỉ áp dụng cho đường LLM):
 * mọi token giống-số trong câu trả lời cuối phải xuất hiện trong ít nhất 1 tool_result đã thực
 * thi TỪ TRƯỚC ĐẾN GIỜ TRONG CẢ CUỘC HỘI THOẠI (không chỉ lượt này - xem bug thật đã bắt được
 * 2026-07-27: hỏi "P0120 có lái tiếp được không" NGAY SAU KHI đã hỏi "P0120 là gì" ở lượt trước
 * bị chặn nhầm, vì LLM trả lời dựa vào tool_result CŨ đã có trong lịch sử, không gọi tool mới ở
 * lượt này - nếu chỉ soát tool_result "trong lượt này" thì mọi câu hỏi nối tiếp hợp lệ kiểu này
 * đều bị chặn oan). Nếu không khớp bất kỳ tool_result nào (cũ lẫn mới), coi là vi phạm hợp đồng
 * grounding - không hiển thị nguyên văn, trả về câu an toàn kèm log cảnh báo để dev soát lại.
 */
export class ConversationManager {
  private messages: NoriMessage[] = [];

  constructor(
    private registry: ToolRegistry,
    private executor: ToolExecutor,
    private getContext: () => ToolContext,
    /** Mặc định gọi HTTP thật (`noriApi.chat`) - chỉ override trong `TestHarness.ts` để chạy
     * kịch bản tool-calling xác định mà không cần mạng/API key. Production (`NoriAgent`) không
     * truyền tham số này nên hành vi không đổi. */
    private chatFn: ChatFn = noriApi.chat,
    /** Chỉ dùng để cập nhật UI (câu đệm 2 pha) - không ảnh hưởng logic hội thoại, an toàn để
     * bỏ trống (vd trong `TestHarness.ts`). */
    private onProgress?: (stage: ProgressStage) => void,
  ) {}

  getMessages(): NoriMessage[] {
    return this.messages;
  }

  async sendMessage(userText: string): Promise<NoriReply> {
    const localMatch = matchLocalIntent(userText);
    if (localMatch) {
      const toolUseId = `local-${Date.now()}-${localRequestCounter++}`;
      const result = await this.executor.execute(
        { id: toolUseId, name: localMatch.toolName, input: localMatch.toolInput },
        this.getContext(),
      );
      const text = buildLocalReply(localMatch.toolName, JSON.parse(result.content), userText);
      this.messages.push({ role: 'user', content: userText });
      // Ghi lại đúng shape tool_use/tool_result như đường LLM (KHÔNG chỉ đẩy thẳng text) - nếu
      // không, số liệu trong câu trả lời local này sẽ vô hình với getAllToolResultContents(),
      // và 1 câu hỏi nối tiếp qua đường LLM tham chiếu lại số này sẽ bị grounding validator
      // chặn nhầm (cùng gốc bug với follow-up LLM-LLM đã fix, nhưng ở nhánh local->LLM).
      this.messages.push({
        role: 'assistant',
        content: [{ type: 'tool_use', id: toolUseId, name: localMatch.toolName, input: localMatch.toolInput }],
      });
      this.messages.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: toolUseId, content: result.content, is_error: result.isError }],
      });
      this.messages.push({ role: 'assistant', content: text });
      return { text, requestId: toolUseId, source: 'local' };
    }

    this.messages.push({ role: 'user', content: userText });

    const tools = this.registry.getSchemas();

    for (let iteration = 0; iteration < MAX_TOOL_LOOP_ITERATIONS; iteration++) {
      this.onProgress?.({ phase: 'thinking' });
      let response;
      try {
        response = await this.chatFn(this.messages, tools);
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
        //
        // Nori Agent giờ là tính năng Premium (2026-07-27, `AiNoriController::chat()` chặn 403
        // + `premium_required:true` - cùng shape response gas_finder/export đã dùng khắp app,
        // xem `isPremiumRequiredError()` trong businessTools.ts) - nhận diện riêng để nói đúng
        // lý do thay vì báo nhầm "mất mạng" cho user Free.
        const status = (err as any)?.response?.status;
        const premiumRequired = (err as any)?.response?.data?.premium_required === true;
        if (status === 403 && premiumRequired) {
          return {
            text: 'Nori hiện là tính năng dành cho Premium - bạn nâng cấp gói Premium để trò chuyện cùng Nori nhé!',
            requestId: `local-${Date.now()}-${localRequestCounter++}`,
            source: 'local',
          };
        }

        return {
          text: 'Mình đang không kết nối được với máy chủ, bạn kiểm tra mạng rồi thử lại giúp mình nhé.',
          requestId: `local-${Date.now()}-${localRequestCounter++}`,
          source: 'local',
        };
      }

      const { stop_reason: stopReason, content, request_id: requestId } = response.data;

      this.messages.push({ role: 'assistant', content });

      if (stopReason !== 'tool_use') {
        const text = extractText(content);
        return {
          text: this.applyGroundingValidator(text),
          requestId,
          source: 'llm',
        };
      }

      const toolCalls = content.filter(
        (b): b is Extract<NoriContentBlock, { type: 'tool_use' }> => b.type === 'tool_use',
      );

      this.onProgress?.({ phase: 'calling_tool', toolNames: toolCalls.map((c) => c.name) });

      const toolResultBlocks: NoriContentBlock[] = [];
      for (const block of toolCalls) {
        const call: NoriToolCall = { id: block.id, name: block.name, input: block.input };
        const result = await this.executor.execute(call, this.getContext());
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: result.toolUseId,
          content: result.content,
          is_error: result.isError,
        });
      }

      this.messages.push({ role: 'user', content: toolResultBlocks });
    }

    return {
      text: 'Xin lỗi, mình đang xử lý mất nhiều bước quá, bạn hỏi lại theo cách khác giúp mình nhé.',
      requestId: `local-${Date.now()}-${localRequestCounter++}`,
      source: 'local',
    };
  }

  private applyGroundingValidator(text: string): string {
    const toolResultContents = this.getAllToolResultContents();
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

  /** Quét TOÀN BỘ lịch sử hội thoại (không chỉ lượt hiện tại) lấy nội dung mọi tool_result đã
   * từng thực thi - xem docblock class ở trên (bug thật 2026-07-27: câu hỏi nối tiếp tham
   * chiếu tool_result CŨ bị chặn nhầm nếu chỉ soát lượt hiện tại). */
  private getAllToolResultContents(): string[] {
    const contents: string[] = [];
    for (const msg of this.messages) {
      if (!Array.isArray(msg.content)) continue;
      for (const block of msg.content) {
        if (block.type === 'tool_result') contents.push(block.content);
      }
    }
    return contents;
  }
}

function extractText(content: NoriContentBlock[]): string {
  return content
    .filter((b): b is Extract<NoriContentBlock, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}
