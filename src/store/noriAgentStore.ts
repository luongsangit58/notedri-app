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
  init: (getVehicleId: () => number | null) => void;
  sendMessage: (text: string) => Promise<void>;
  dispose: () => void;
};

let nextId = 0;

export const useNoriAgentStore = create<NoriAgentState>((set, get) => ({
  agent: null,
  vehicleContext: null,
  uiMessages: [],
  isThinking: false,

  init: (getVehicleId) => {
    if (get().agent) return;
    const vehicleContext = new VehicleContext();
    const agent = new NoriAgent(vehicleContext, getVehicleId);
    agent.onStateChange((s) => set({ isThinking: s === 'thinking' }));
    set({ agent, vehicleContext });
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
