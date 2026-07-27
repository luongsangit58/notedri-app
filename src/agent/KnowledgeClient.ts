import { lookupDtcOffline, withDefaultDtcPrefix } from '../services/obd/dtcOfflineDictionary';

/**
 * Wrapper gọi lại dtcOfflineDictionary.ts (docs/nori-agent-plan.md mục 6, 10.1) - coi giải
 * nghĩa mã lỗi là 1 tool RIÊNG (knowledge.explainDTC), KHÔNG gộp vào vehicle.readDTC(). Dùng
 * tra offline đóng gói sẵn trong app - đủ cho Phase 1, không phụ thuộc mạng.
 */
export const KnowledgeClient = {
  explainDTC(rawCode: string) {
    const code = withDefaultDtcPrefix(rawCode);
    return lookupDtcOffline(code);
  },
};
