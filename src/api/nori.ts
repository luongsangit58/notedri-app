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
};

/**
 * Gọi POST /api/v1/ai/nori/chat (docs/nori-agent-plan.md mục 5, 9, 10.1) - theo pattern
 * axios client hiện có (src/api/client.ts, đã tự gắn Bearer token + Accept-Language). Backend
 * KHÔNG tự thực thi tool, chỉ forward tới Anthropic và trả lại content/stop_reason gần
 * nguyên bản cho ConversationManager tiếp tục vòng lặp tool-calling.
 */
export const noriApi = {
  chat: (messages: NoriChatRequestMessage[], tools: AnthropicToolSchema[] = []) =>
    client.post<NoriChatResponse>('/ai/nori/chat', { messages, tools }),
};
