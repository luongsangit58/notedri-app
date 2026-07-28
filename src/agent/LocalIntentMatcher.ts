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

/** Bỏ dấu tiếng Việt để khớp được cả khi user gõ không dấu. Export để LocalReplyTemplates.ts
 * tái dùng (vd nhận diện "tháng trước"/"tháng 6" cho expense.summary) - tránh viết lại logic bỏ
 * dấu 2 nơi lệch nhau. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    // "công-tơ-mét" phải khớp được với "công tơ mét" - không chỉ bỏ dấu mà còn cần đồng nhất
    // dấu gạch nối/gạch ngang thành khoảng trắng, nếu không 2 cách viết cùng nghĩa sẽ KHÔNG
    // khớp nhau dù đã bỏ dấu (phát hiện lúc test thật, không phải suy đoán).
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsAny(normalized: string, phrases: string[]): boolean {
  return phrases.some((p) => normalized.includes(p));
}

/** true nếu MỌI term trong ít nhất 1 nhóm đều xuất hiện (thứ tự/khoảng cách không quan trọng) -
 * dùng cho câu hỏi tiếng Việt hay chêm chủ ngữ/trợ động từ giữa các từ khoá chính (vd "hôm nay
 * TÔI chạy ĐƯỢC bao nhiêu km") khiến khớp theo cụm liền mạch bị trượt (phát hiện lúc test thật). */
function matchesAllOfAnyGroup(normalized: string, groups: string[][]): boolean {
  return groups.some((group) => group.every((term) => normalized.includes(term)));
}

type Rule = { toolName: string; phrases?: string[]; allOfGroups?: string[][] };

// Thứ tự có ý nghĩa: rule đứng TRƯỚC được xét trước - đặt rule cụ thể/hiếm nhầm lẫn lên đầu.
const RULES: Rule[] = [
  {
    toolName: 'vehicle.getRecentIssues',
    phrases: [
      'hom qua xe', 'tuan qua xe', 'gan day xe', 'may hom nay xe',
      'xe co van de gi', 'xe co bi gi khong', 'xe co sao khong',
    ],
    // "dao nay xe"/"xe on khong" (liền mạch) bị trượt khi câu thật chêm chủ ngữ TRƯỚC, kiểu "XE
    // TÔI dạo này ổn không" (xe đứng ĐẦU câu, không liền "dạo này") - phát hiện lúc rà soát lại
    // theo yêu cầu user mở rộng độ phủ local 2026-07-28. allOfGroups không quan tâm thứ tự.
    allOfGroups: [['dao nay', 'xe'], ['xe', 'on khong']],
  },
  {
    toolName: 'vehicle.getHealthScore',
    // "suc khoe" đứng riêng (không bắt buộc kèm "xe" ngay trước/sau) - câu hỏi thật kiểu
    // "xe tôi sức khoẻ thế nào" có "xe" đứng TRƯỚC "sức khoẻ" khá xa, không khớp "suc khoe xe"
    // liền nhau (phát hiện lúc test thật). Rủi ro nhầm sang "sức khoẻ" của user chấp nhận
    // được vì đây là app xe, ngữ cảnh chat luôn xoay quanh xe.
    phrases: ['suc khoe', 'diem suc khoe', 'health score'],
  },
  {
    toolName: 'fuel.findNearbyStations',
    phrases: ['cay xang gan day', 'tim cay xang', 'cay xang gan nhat', 'tram xang gan day'],
  },
  {
    // Đứng TRƯỚC expense.summary - "tiền bảo dưỡng"/"tiền sửa xe" phải không rơi nhầm vào
    // rule chi phí xăng (thứ tự mảng RULES quyết định rule nào được xét trước).
    toolName: 'maintenance.expenseSummary',
    phrases: ['tien bao duong', 'chi phi bao duong', 'tien sua xe', 'chi phi sua xe', 'tien sua chua'],
  },
  {
    toolName: 'expense.summary',
    phrases: ['ton bao nhieu tien xang', 'chi phi xang', 'tien xang thang', 'het bao nhieu tien xang'],
    // Bug thật bắt được qua ảnh chụp user gửi 2026-07-28: "tháng trước so với tháng này thế
    // nào" KHÔNG khớp phrases ở trên (không nhắc "tiền"/"xăng"/"chi phí" trực tiếp) nên rơi về
    // LLM dù đây là câu hỏi rất tự nhiên cho đúng tool này (tool DUY NHẤT trong app so sánh
    // tháng-qua-tháng). allOfGroups không quan tâm thứ tự/khoảng cách 2 từ khoá tháng.
    allOfGroups: [['thang truoc', 'thang nay']],
  },
  {
    toolName: 'maintenance.getUpcoming',
    phrases: [
      'sap den han', 'con han khong', 'bao hiem xe', 'dang kiem xe',
      'nhac nho bao duong',
    ],
    // "đến hạn khi nào" hay bị đảo thứ tự thành "khi nào đến hạn" tuỳ câu - bug thật bắt được
    // qua ảnh chụp user gửi 2026-07-28: "đăng kiểm CỦA TÔI ĐẾN HẠN KHI NÀO" không khớp (rơi về
    // LLM, gặp đúng lúc backend lỗi nên báo "mất kết nối"), trong khi "xe tôi KHI NÀO ĐẾN HẠN
    // đăng kiểm" (cùng ý, đảo thứ tự) khớp đúng. allOfGroups không quan tâm thứ tự.
    allOfGroups: [['den han', 'khi nao']],
  },
  {
    toolName: 'vehicle.getTripToday',
    // allOfGroups (không phải phrases liền mạch): "hôm nay tôi CHẠY ĐƯỢC bao nhiêu km" có chủ
    // ngữ/trợ động từ chêm giữa "hôm nay" và "chạy"/"km" - cụm liền mạch sẽ trượt, chỉ cần cả
    // 2 từ khoá cùng xuất hiện (không quan trọng thứ tự/khoảng cách) là đủ tin cậy ở đây.
    // Cố tình KHÔNG thêm nhóm ['hom nay', 'km'] đơn thuần - quá lỏng, dễ khớp nhầm câu hỏi
    // khác có nhắc "hôm nay" và "km" nhưng không hỏi về quãng đường (vd hỏi đổ xăng).
    allOfGroups: [['hom nay', 'chay'], ['hom nay', 'di duoc']],
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
    phrases: ['rpm hien tai'],
    // "vong tua hien tai" (liền mạch) bị trượt khi câu thật chêm "máy" ở giữa: "vòng tua MÁY
    // hiện tại" - phát hiện lúc rà soát lại theo yêu cầu user mở rộng độ phủ local 2026-07-28.
    allOfGroups: [['vong tua', 'hien tai'], ['vong tua', 'bao nhieu']],
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

// Bug NGHIÊM TRỌNG bắt được qua ảnh chụp user gửi 2026-07-28: "ghi công tơ mét 5588" bị rule đọc
// `vehicle.getCurrentODO` (chỉ kiểm tra có chứa cụm "công tơ mét") khớp NHẦM và trả lời như đang
// HỎI số hiện tại - hoàn toàn im lặng bỏ qua ý định GHI, user tưởng đã ghi xong nhưng KHÔNG có gì
// được lưu (lặp lại y hệt lần 2 với số khác, vẫn báo số cũ). Việc ghi dữ liệu (odometer.create/
// fuel.create) CHỦ Ý không có mẫu local (xem buildWriteTools trong writeTools.ts) - phải luôn qua
// LLM để parse + có bước xác nhận UI - nhưng các rule ĐỌC có chứa từ khoá trùng ("công tơ mét",
// "xăng"...) vẫn có thể khớp nhầm câu GHI nếu không chặn riêng. Chặn NGAY TỪ ĐẦU bất kỳ câu nào
// có động từ GHI/CẬP NHẬT - false positive (câu đọc lỡ bị đẩy qua LLM) chỉ tốn thêm 1 lượt gọi
// LLM bình thường, AN TOÀN hơn NHIỀU so với false negative (âm thầm không ghi được dữ liệu thật).
const WRITE_INTENT_PATTERN = /\bghi\b|\bcap nhat\b|\bvua do\b/;

export function matchLocalIntent(userText: string): LocalIntentMatch | null {
  const normalized = normalize(userText);

  if (WRITE_INTENT_PATTERN.test(normalized)) {
    return null;
  }

  // Mã DTC (vd "P0301") là mẫu đặc trưng nhất, gần như không nhầm lẫn - ưu tiên xét trước.
  const dtcMatch = userText.match(DTC_CODE_PATTERN);
  if (dtcMatch) {
    const code = dtcMatch[1].replace(/\s/g, '').toUpperCase();
    return { toolName: 'knowledge.explainDTC', toolInput: { code } };
  }

  for (const rule of RULES) {
    const matched = (rule.phrases && containsAny(normalized, rule.phrases))
      || (rule.allOfGroups && matchesAllOfAnyGroup(normalized, rule.allOfGroups));
    if (matched) {
      return { toolName: rule.toolName, toolInput: {} };
    }
  }

  return null;
}
