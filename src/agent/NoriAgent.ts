import { ChatFn, ConversationManager, NoriReply } from './ConversationManager';
import { ConfirmActionFn, ToolExecutor } from './ToolExecutor';
import { ToolRegistry } from './ToolRegistry';
import { SafetyPolicy } from './safety/SafetyPolicy';
import { buildBusinessTools } from './tools/businessTools';
import { buildKnowledgeTools } from './tools/knowledgeTools';
import { buildVehicleTools } from './tools/vehicleTools';
import { buildWriteTools } from './tools/writeTools';
import { IVehicleIO } from './platform/types';

export type NoriAgentState = 'idle' | 'thinking';

/**
 * Orchestrator chính (docs/nori-agent-plan.md mục 5, 10.1) - vòng lặp state machine tối giản
 * cho Phase 1 (text-first): idle -> thinking -> idle. ConversationManager tự lo phần
 * Understanding/Executing/Responding bên trong 1 lượt sendMessage() (đã gộp vì Phase 1 chưa
 * cần tách state chi tiết hơn cho UI voice - Phase 3 mở rộng sau nếu cần).
 *
 * Không đặt tên "Chat"/"ChatService" cho lớp lõi - đúng tinh thần "Nori là Agent" (mục 1).
 */
export class NoriAgent {
  private registry = new ToolRegistry();
  private safetyPolicy: SafetyPolicy;
  private executor: ToolExecutor;
  private conversation: ConversationManager;
  private state: NoriAgentState = 'idle';
  private stateListeners = new Set<(s: NoriAgentState) => void>();

  constructor(
    private vehicleIO: IVehicleIO,
    getVehicleId: () => number | null,
    /** Phase 2 (mục 7): hỏi user xác nhận trước khi thực thi tool mutating (odometer.create,
     * fuel.create). Không truyền -> ToolExecutor tự từ chối mọi tool cần xác nhận (an toàn hơn
     * là âm thầm ghi dữ liệu không qua xác nhận). */
    confirmAction?: ConfirmActionFn,
    /** Chỉ dùng trong `TestHarness.ts` - xem docblock `ConversationManager.ChatFn`. */
    chatFn?: ChatFn,
  ) {
    this.safetyPolicy = new SafetyPolicy(vehicleIO);
    this.executor = new ToolExecutor(this.registry, this.safetyPolicy, confirmAction);
    this.conversation = new ConversationManager(
      this.registry,
      this.executor,
      () => ({ vehicleId: getVehicleId() }),
      chatFn, // undefined -> ConversationManager tự dùng default noriApi.chat
    );

    buildVehicleTools(vehicleIO).forEach((t) => this.registry.register(t));
    buildKnowledgeTools().forEach((t) => this.registry.register(t));
    buildBusinessTools().forEach((t) => this.registry.register(t));
    buildWriteTools().forEach((t) => this.registry.register(t));
  }

  getState(): NoriAgentState {
    return this.state;
  }

  onStateChange(cb: (s: NoriAgentState) => void): () => void {
    this.stateListeners.add(cb);
    return () => this.stateListeners.delete(cb);
  }

  getMessages() {
    return this.conversation.getMessages();
  }

  async sendMessage(text: string): Promise<NoriReply> {
    this.setState('thinking');
    try {
      return await this.conversation.sendMessage(text);
    } finally {
      this.setState('idle');
    }
  }

  private setState(s: NoriAgentState): void {
    this.state = s;
    this.stateListeners.forEach((fn) => fn(s));
  }
}
