import { create } from 'zustand';
import { NoriAgent } from '../agent/NoriAgent';
import { VehicleContext } from '../agent/VehicleContext';
import { noriApi, NoriFeedbackRating } from '../api/nori';
import { useAuthStore } from './authStore';

// Export để NoriQuickPopover.tsx tái dùng - tránh mở mic (xin quyền micro) rồi mới báo Premium
// SAU KHI user đã nói xong (trải nghiệm ngược, xin quyền xâm phạm hơn hẳn 1 API call thường).
export const PREMIUM_REQUIRED_TEXT =
  'Nori hiện là tính năng dành cho Premium - bạn nâng cấp gói Premium để trò chuyện cùng Nori nhé!';

/**
 * Trạng thái hội thoại Nori Agent (docs/nori-agent-plan.md mục 10.1), theo pattern
 * obdSessionStore.ts. Chỉ giữ state hiển thị (UiMessage) - transcript tool-call thật nằm
 * trong ConversationManager bên trong NoriAgent (mục 1: "Transcript tool là nguồn sự thật").
 */
export type UiMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Chỉ có ở bọt của Nori (assistant) - dùng để chấm điểm qua submitFeedback(). Bọt chào
   * tĩnh (greeting) không có requestId vì không qua sendMessage() thật. */
  requestId?: string;
  /** Đánh giá đã gửi (nếu có) - hiện lại icon đã chọn, tránh gửi trùng nhiều lần. */
  feedbackRating?: NoriFeedbackRating;
};

/** Yêu cầu xác nhận đang chờ user trả lời (Phase 2, mục 7) - NoriChatScreen render Modal khi
 * field này khác null, và gọi resolveConfirmation() khi user bấm Đồng ý/Huỷ. */
export type PendingConfirmation = {
  toolName: string;
  summary: string;
};

type NoriAgentState = {
  agent: NoriAgent | null;
  vehicleContext: VehicleContext | null;
  uiMessages: UiMessage[];
  isThinking: boolean;
  pendingConfirmation: PendingConfirmation | null;
  init: (getVehicleId: () => number | null, userName?: string | null) => void;
  sendMessage: (text: string) => Promise<void>;
  submitFeedback: (requestId: string, rating: NoriFeedbackRating, note?: string) => Promise<void>;
  resolveConfirmation: (approved: boolean) => void;
  dispose: () => void;
};

let nextId = 0;

// Resolver của Promise confirmAction() đang chờ (mục 7) - sống ở module scope (không phải
// zustand state, vì hàm không nên đi qua set()/react re-render) chỉ trong lúc Modal xác nhận
// đang mở. Tại 1 thời điểm chỉ có tối đa 1 tool-call mutating chờ xác nhận (ConversationManager
// await tuần tự từng tool), nên không cần hàng đợi nhiều resolver.
let pendingResolve: ((approved: boolean) => void) | null = null;

export const useNoriAgentStore = create<NoriAgentState>((set, get) => ({
  agent: null,
  vehicleContext: null,
  uiMessages: [],
  isThinking: false,
  pendingConfirmation: null,

  init: (getVehicleId, userName) => {
    if (get().agent) return;
    const vehicleContext = new VehicleContext();
    const confirmAction = (toolName: string, summary: string) =>
      new Promise<boolean>((resolve) => {
        pendingResolve = resolve;
        set({ pendingConfirmation: { toolName, summary } });
      });
    const agent = new NoriAgent(vehicleContext, getVehicleId, confirmAction);
    agent.onStateChange((s) => set({ isThinking: s === 'thinking' }));
    // Lời chào tĩnh, KHÔNG gọi LLM (miễn phí, tức thời) - chỉ hiển thị 1 lần khi tạo agent
    // (không lặp lại nếu rời màn rồi quay lại trong cùng phiên app, vì init() no-op sau lần
    // đầu). Đây chỉ là UI, KHÔNG đưa vào transcript thật của ConversationManager - LLM không
    // biết câu chào này từng được nói, đúng tinh thần "transcript tool là nguồn sự thật".
    const greeting = userName
      ? `Xin chào ${userName}, mình là Nori - trợ lý xe của bạn. Hỏi mình về tình trạng xe, chi phí, hay lịch bảo dưỡng nhé!`
      : 'Xin chào, mình là Nori - trợ lý xe của bạn. Hỏi mình về tình trạng xe, chi phí, hay lịch bảo dưỡng nhé!';
    set({
      agent,
      vehicleContext,
      uiMessages: [{ id: String(nextId++), role: 'assistant', text: greeting }],
    });
  },

  sendMessage: async (text: string) => {
    const { agent } = get();
    if (!agent || !text.trim()) return;

    set((state) => ({
      uiMessages: [...state.uiMessages, { id: String(nextId++), role: 'user', text }],
    }));

    // Nori Agent là tính năng Premium (2026-07-27) - backend đã chặn ở `/ai/nori/chat`
    // (`AiNoriController::chat()`, 403 + `premium_required`), nhưng đường LocalIntentMatcher
    // KHÔNG đi qua endpoint đó (trả lời thẳng từ tool_result app-side) - nếu không chặn ở ĐÂY,
    // user Free vẫn "lách" được vào Nori miễn phí qua các câu hỏi khớp mẫu local. Chặn TRƯỚC
    // khi gọi agent.sendMessage() để chắn CẢ 2 đường (local lẫn LLM) cho user Free.
    if (!useAuthStore.getState().user?.is_premium) {
      set((state) => ({
        uiMessages: [...state.uiMessages, { id: String(nextId++), role: 'assistant', text: PREMIUM_REQUIRED_TEXT }],
      }));
      return;
    }

    const reply = await agent.sendMessage(text);

    set((state) => ({
      uiMessages: [
        ...state.uiMessages,
        { id: String(nextId++), role: 'assistant', text: reply.text, requestId: reply.requestId },
      ],
    }));
  },

  submitFeedback: async (requestId, rating, note) => {
    // Đánh dấu NGAY trong UI trước khi chờ mạng - phản hồi tức thì, và tự tha thứ nếu request
    // lỗi (chỉ là log chẩn đoán tạm thời, không phải hành động nghiệp vụ quan trọng).
    set((state) => ({
      uiMessages: state.uiMessages.map((m) => (m.requestId === requestId ? { ...m, feedbackRating: rating } : m)),
    }));
    try {
      await noriApi.feedback(requestId, rating, note);
    } catch (err) {
      console.warn('[NoriAgent] Không gửi được feedback:', err);
    }
  },

  resolveConfirmation: (approved: boolean) => {
    const resolve = pendingResolve;
    pendingResolve = null;
    set({ pendingConfirmation: null });
    resolve?.(approved);
  },

  dispose: () => {
    get().vehicleContext?.dispose();
    pendingResolve = null;
    set({ agent: null, vehicleContext: null, uiMessages: [], isThinking: false, pendingConfirmation: null });
  },
}));
