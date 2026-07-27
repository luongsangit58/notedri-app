/**
 * Matcher tất định trên thiết bị cho câu hỏi phổ biến (docs/nori-agent-plan.md mục 4, câu hỏi
 * mở mục 12 - đã quyết định làm). Route các câu hỏi khớp mẫu rõ ràng qua đây TRƯỚC KHI gọi LLM
 * (Groq/Anthropic/Gemini) - không tốn token, không độ trễ mạng, và AN TOÀN HƠN đường LLM vì câu
 * trả lời dựng thẳng từ tool_result (không có bước "LLM diễn đạt lại" nên không có chỗ để bịa số).
 *
 * Nguyên tắc: ưu tiên ĐỘ CHÍNH XÁC hơn độ phủ - false negative (không match, rơi về LLM) chỉ
 * tốn thêm 1 lượt gọi LLM bình thường; false positive (match sai tool) trả lời sai hoàn toàn mà
 * user không biết để nghi ngờ. Vì vậy mỗi mẫu là cụm từ tương đối ĐẦY ĐỦ, không phải 1 từ khoá
 * đơn lẻ dễ đụng nghĩa khác (vd chỉ "tốc độ" sẽ khớp nhầm cả câu hỏi "tốc độ tối đa xe này bao
 * nhiêu" - một câu hỏi về THÔNG SỐ xe, không phải dữ liệu SỐNG).
 */

export type LocalIntentMatch = {
  toolName: string;
  toolInput: Record<string, unknown>;
};

/** Bỏ dấu tiếng Việt để khớp được cả khi user gõ không dấu. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .trim();
}

function containsAny(normalized: string, phrases: string[]): boolean {
  return phrases.some((p) => normalized.includes(p));
}

type Rule = { toolName: string; phrases: string[] };

// Thứ tự có ý nghĩa: rule đứng TRƯỚC được xét trước - đặt rule cụ thể/hiếm nhầm lẫn lên đầu.
const RULES: Rule[] = [
  {
    toolName: 'vehicle.getRecentIssues',
    phrases: [
      'hom qua xe', 'tuan qua xe', 'gan day xe', 'dao nay xe', 'may hom nay xe',
      'xe co van de gi', 'xe co bi gi khong', 'xe on khong', 'xe co sao khong',
    ],
  },
  {
    toolName: 'vehicle.getHealthScore',
    phrases: ['suc khoe xe', 'diem suc khoe', 'health score'],
  },
  {
    toolName: 'fuel.findNearbyStations',
    phrases: ['cay xang gan day', 'tim cay xang', 'cay xang gan nhat', 'tram xang gan day'],
  },
  {
    toolName: 'expense.summary',
    phrases: ['ton bao nhieu tien xang', 'chi phi xang', 'tien xang thang', 'het bao nhieu tien xang'],
  },
  {
    toolName: 'maintenance.getUpcoming',
    phrases: [
      'sap den han', 'con han khong', 'bao hiem xe', 'dang kiem xe', 'khi nao den han',
      'nhac nho bao duong',
    ],
  },
  {
    toolName: 'vehicle.getTripToday',
    phrases: ['hom nay chay bao nhieu km', 'hom nay di duoc bao nhieu km', 'hom nay chay bao xa'],
  },
  {
    toolName: 'vehicle.getCurrentODO',
    phrases: ['cong to met', 'so km hien tai', 'odo hien tai', 'so odo'],
  },
  {
    toolName: 'vehicle.readDTC',
    phrases: ['co ma loi gi khong', 'doc ma loi', 'quet ma loi'],
  },
  {
    toolName: 'vehicle.getSpeed',
    phrases: ['toc do hien tai', 'dang chay bao nhieu km/h', 'dang chay bao nhieu km h', 'toc do bao nhieu km'],
  },
  {
    toolName: 'vehicle.getRPM',
    phrases: ['vong tua hien tai', 'vong tua may bao nhieu', 'rpm hien tai'],
  },
  {
    toolName: 'vehicle.getCoolant',
    phrases: ['nhiet do nuoc lam mat', 'nhiet do dong co hien tai'],
  },
  {
    toolName: 'vehicle.getFuelLevel',
    phrases: ['muc xang con bao nhieu', 'con bao nhieu % xang', 'muc nhien lieu hien tai'],
  },
  {
    toolName: 'vehicle.getBatteryVoltage',
    phrases: ['dien ap ac quy', 'dien ap ac-quy', 'ac quy con tot khong'],
  },
];

const DTC_CODE_PATTERN = /\b([pbcu]\s?0?\d{3,4})\b/i;

export function matchLocalIntent(userText: string): LocalIntentMatch | null {
  const normalized = normalize(userText);

  // Mã DTC (vd "P0301") là mẫu đặc trưng nhất, gần như không nhầm lẫn - ưu tiên xét trước.
  const dtcMatch = userText.match(DTC_CODE_PATTERN);
  if (dtcMatch) {
    const code = dtcMatch[1].replace(/\s/g, '').toUpperCase();
    return { toolName: 'knowledge.explainDTC', toolInput: { code } };
  }

  for (const rule of RULES) {
    if (containsAny(normalized, rule.phrases)) {
      return { toolName: rule.toolName, toolInput: {} };
    }
  }

  return null;
}
