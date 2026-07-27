import { create } from 'zustand';
import { NoriAgent } from '../agent/NoriAgent';
import { VehicleContext } from '../agent/VehicleContext';

/**
 * Trạng thái hội thoại Nori Agent (docs/nori-agent-plan.md mục 10.1), theo pattern
 * obdSessionStore.ts. Chỉ giữ state hiển thị (UiMessage) - transcript tool-call thật nằm
 * trong ConversationManager bên trong NoriAgent (mục 1: "Transcript tool là nguồn sự thật").
 */
export type UiMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

type NoriAgentState = {
  agent: NoriAgent | null;
  vehicleContext: VehicleContext | null;
  uiMessages: UiMessage[];
  isThinking: boolean;
  init: (getVehicleId: () => number | null, userName?: string | null) => void;
  sendMessage: (text: string) => Promise<void>;
  dispose: () => void;
};

let nextId = 0;

export const useNoriAgentStore = create<NoriAgentState>((set, get) => ({
  agent: null,
  vehicleContext: null,
  uiMessages: [],
  isThinking: false,

  init: (getVehicleId, userName) => {
    if (get().agent) return;
    const vehicleContext = new VehicleContext();
    const agent = new NoriAgent(vehicleContext, getVehicleId);
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

    const reply = await agent.sendMessage(text);

    set((state) => ({
      uiMessages: [...state.uiMessages, { id: String(nextId++), role: 'assistant', text: reply }],
    }));
  },

  dispose: () => {
    get().vehicleContext?.dispose();
    set({ agent: null, vehicleContext: null, uiMessages: [], isThinking: false });
  },
}));
