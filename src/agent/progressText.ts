import { ProgressStage } from './ConversationManager';

/**
 * Diễn giải `ProgressStage` thành 1 câu đệm tiếng Việt ngắn, để NoriChatScreen/NoriQuickPopover
 * không còn hiện MỘT dòng "đang kiểm tra..." tĩnh suốt cả lượt hỏi - cải thiện UX 2026-07-28
 * (góp ý user: cảm giác treo khi phải chờ tool chạy, nhất là ở popup giọng nói lúc lái xe).
 * Không cần hiểu NGỮ NGHĨA thật của tool - chỉ đoán theo TIỀN TỐ tên tool là đủ để câu đệm hợp
 * lý hơn hẳn 1 câu chung chung, mà không phải liệt kê thủ công cả 21 tool.
 */
export function describeProgressStage(stage: ProgressStage | null): string {
  if (!stage) return 'Nori đang suy nghĩ...';
  if (stage.phase === 'thinking') return 'Nori đang suy nghĩ...';

  const names = stage.toolNames;
  if (names.length === 0) return 'Nori đang xử lý...';
  if (names.some((n) => n.endsWith('.create'))) return 'Nori đang chuẩn bị ghi dữ liệu...';
  if (names.some((n) => n.includes('findNearby'))) return 'Nori đang tìm vị trí gần bạn...';
  if (names.some((n) => n.startsWith('vehicle.') || n === 'knowledge.explainDTC')) {
    return 'Nori đang đọc dữ liệu xe...';
  }
  return 'Nori đang tra cứu dữ liệu...';
}
