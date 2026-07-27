import client from './client';
import { AnthropicToolSchema, NoriContentBlock } from '../agent/types';

export type NoriChatRequestMessage = {
  role: 'user' | 'assistant';
  content: string | NoriContentBlock[];
};

export type NoriChatResponse = {
  stop_reason: string | null;
  content: NoriContentBlock[];
  usage?: { input_tokens?: number; output_tokens?: number };
  /** Dùng để chấm điểm câu trả lời qua noriApi.feedback() - xem NoriChatScreen (nhấn giữ bọt chat). */
  request_id: string;
};

export type NoriFeedbackRating = 'good' | 'bad' | 'partial';

/**
 * Gọi POST /api/v1/ai/nori/chat (docs/nori-agent-plan.md mục 5, 9, 10.1) - theo pattern
 * axios client hiện có (src/api/client.ts, đã tự gắn Bearer token + Accept-Language). Backend
 * KHÔNG tự thực thi tool, chỉ forward tới Anthropic và trả lại content/stop_reason gần
 * nguyên bản cho ConversationManager tiếp tục vòng lặp tool-calling.
 */
export const noriApi = {
  chat: (messages: NoriChatRequestMessage[], tools: AnthropicToolSchema[] = []) =>
    client.post<NoriChatResponse>('/ai/nori/chat', { messages, tools }),

  /** Chấm điểm 1 câu trả lời cụ thể (request_id) - ghi vào storage/logs/nori.log cùng
   * request/response gốc, để test thủ công có log kèm đánh giá thật thay vì chỉ nhớ trong đầu. */
  feedback: (requestId: string, rating: NoriFeedbackRating, note?: string) =>
    client.post('/ai/nori/feedback', { request_id: requestId, rating, note }),
};
