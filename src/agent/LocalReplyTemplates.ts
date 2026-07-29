import { normalize } from './LocalIntentMatcher';

/**
 * Dựng câu trả lời tiếng Việt THẲNG từ tool_result cho các intent khớp LocalIntentMatcher -
 * KHÔNG qua LLM. Vì vậy câu trả lời chắc chắn grounded (không có bước "LLM diễn đạt lại" nên
 * không có chỗ để bịa số) - nhưng cũng nghĩa là câu văn cứng hơn LLM, không linh hoạt theo ngữ
 * cảnh hội thoại. Giữ mỗi template ngắn, đúng dữ liệu, đúng giọng đã định trong system prompt
 * (mục 1: nhắc tuổi dữ liệu khi có ý nghĩa, nói rõ "chưa kết nối" thay vì im lặng/bịa).
 */

type MonthIntent = 'this_month' | 'last_month' | 'both' | 'unsupported';

/**
 * Bug thật bắt được lúc test app build (2026-07-27): user hỏi "tiền xăng tháng 6" nhưng
 * expense.summary LUÔN trả lời "tháng này" bất kể tháng nào được hỏi - vì LocalIntentMatcher chỉ
 * khớp cụm "tien xang thang" (không quan tâm số tháng theo sau), và template cũ CHỈ đọc
 * `result.this_month`, bỏ qua `result.last_month` dù dữ liệu đã có sẵn. Backend
 * (NoteDriApi.getFuelExpenseSummary) chỉ hỗ trợ this_month/last_month/all_time - KHÔNG có API
 * cho 1 tháng cụ thể bất kỳ - nên chỉ map được khi tháng hỏi trùng tháng hiện tại hoặc tháng
 * liền trước, ngoài ra phải trả lời thật là chưa hỗ trợ (không được ngầm định về tháng này).
 */
function resolveRequestedMonth(userText: string): MonthIntent {
  const normalized = normalize(userText);
  const mentionsThis = /\bthang nay\b/.test(normalized);
  const mentionsLast = /\bthang truoc\b|\bthang roi\b/.test(normalized);
  if (mentionsThis && mentionsLast) return 'both';
  if (mentionsLast) return 'last_month';
  if (mentionsThis) return 'this_month';

  const explicitMonth = normalized.match(/\bthang (\d{1,2})\b/);
  if (explicitMonth) {
    const requested = parseInt(explicitMonth[1], 10);
    const now = new Date();
    const thisMonthNum = now.getMonth() + 1;
    const lastMonthNum = thisMonthNum === 1 ? 12 : thisMonthNum - 1;
    if (requested === thisMonthNum) return 'this_month';
    if (requested === lastMonthNum) return 'last_month';
    return 'unsupported';
  }

  // Không nói rõ tháng nào -> mặc định tháng hiện tại (giữ hành vi cũ cho câu hỏi chung chung
  // kiểu "tốn bao nhiêu tiền xăng").
  return 'this_month';
}

function formatMonthLine(label: string, m: { tong_tien?: number; tong_lit?: number; so_lan?: number } | null | undefined): string {
  if (!m) return `${label} chưa có dữ liệu chi phí nhiên liệu.`;
  return `${label} bạn đã chi ${m.tong_tien?.toLocaleString('vi-VN')}đ tiền nhiên liệu (${m.tong_lit}L, ${m.so_lan} lần đổ).`;
}

function ageSuffix(ageSeconds: number | undefined): string {
  if (ageSeconds == null) return '';
  if (ageSeconds < 5) return '';
  if (ageSeconds < 60) return ` (${ageSeconds} giây trước)`;
  return ` (${Math.round(ageSeconds / 60)} phút trước)`;
}

function unavailableText(reason: string | undefined): string {
  switch (reason) {
    case 'ble_disconnected':
    case 'no_data_yet':
      return 'Xe hiện không kết nối OBD, bạn bật Bluetooth và kết nối lại giúp mình nhé.';
    case 'no_active_vehicle':
      return 'Mình chưa xác định được xe nào để tra cứu - bạn kiểm tra đã thêm xe trong app chưa.';
    case 'premium_required':
      return 'Tính năng này chỉ dành cho tài khoản Premium.';
    case 'location_permission_denied':
      return 'Mình cần quyền vị trí để tìm giúp bạn - bạn cấp quyền vị trí cho app rồi hỏi lại nhé.';
    case 'not_enough_refuel_history':
      return 'Xe cần thêm vài lần đổ xăng có ghi ODO thì mình mới dự đoán được, hiện chưa đủ dữ liệu.';
    case 'not_enough_data':
      return 'Xe cần thêm dữ liệu (vài lần đổ đầy bình có ghi ODO) thì mình mới đánh giá được mức tiêu hao.';
    case 'not_applicable_ev':
      return 'Xe điện chưa hỗ trợ chấm điểm tiêu hao nhiên liệu kiểu này.';
    case 'weather_no_data':
      return 'Mình chưa lấy được dữ liệu thời tiết tại vị trí của bạn lúc này, bạn thử lại sau giúp mình nhé.';
    default:
      return 'Mình chưa lấy được thông tin này lúc này, bạn thử lại sau giúp mình nhé.';
  }
}

export function buildLocalReply(toolName: string, result: any, userText: string): string {
  if (result?.status === 'unavailable') {
    return unavailableText(result.reason);
  }

  switch (toolName) {
    case 'vehicle.getSpeed':
      return `Xe bạn đang chạy ${result.speed_kmh} km/h${ageSuffix(result.age_seconds)}.`;
    case 'vehicle.getRPM':
      return `Vòng tua máy hiện tại: ${result.rpm} RPM${ageSuffix(result.age_seconds)}.`;
    case 'vehicle.getCoolant':
      return `Nhiệt độ nước làm mát: ${result.coolant_temp_c}°C${ageSuffix(result.age_seconds)}.`;
    case 'vehicle.getFuelLevel':
      return `Mức nhiên liệu còn: ${result.fuel_level_pct}%${ageSuffix(result.age_seconds)}.`;
    case 'vehicle.getBatteryVoltage':
      return `Điện áp ắc-quy: ${result.battery_voltage}V${ageSuffix(result.age_seconds)}.`;

    // Thêm 2026-07-28 (theo yêu cầu user mở rộng độ phủ Local) - tool đọc DUY NHẤT trước đây
    // chưa có mẫu local (câu "cho xem hết thông số" ít cố định phrasing hơn 5 tool đơn lẻ ở
    // trên, nhưng vẫn đủ rõ để thêm mẫu an toàn, xem LocalIntentMatcher.ts).
    case 'vehicle.getLiveData': {
      const parts: string[] = [];
      if (result.speed_kmh != null) parts.push(`tốc độ ${result.speed_kmh} km/h`);
      if (result.rpm != null) parts.push(`vòng tua ${result.rpm} RPM`);
      if (result.coolant_temp_c != null) parts.push(`nước làm mát ${result.coolant_temp_c}°C`);
      if (result.fuel_level_pct != null) parts.push(`nhiên liệu ${result.fuel_level_pct}%`);
      if (result.battery_voltage != null) parts.push(`ắc-quy ${result.battery_voltage}V`);
      if (parts.length === 0) return 'Xe đã kết nối nhưng chưa đọc được thông số nào, bạn đợi thêm chút giúp mình nhé.';
      return `Thông số xe hiện tại: ${parts.join(', ')}${ageSuffix(result.age_seconds)}.`;
    }

    case 'vehicle.readDTC': {
      const codes = result.codes ?? [];
      if (codes.length === 0) return 'Không có mã lỗi nào đang hiện trên xe.';
      return `Xe đang có ${codes.length} mã lỗi: ${codes.map((c: any) => c.code).join(', ')}. Bạn hỏi mình giải nghĩa từng mã nếu cần.`;
    }

    case 'knowledge.explainDTC': {
      if (result.known === false) return `Mình chưa có thông tin về mã ${result.code} trong từ điển offline.`;
      const drive = result.can_drive === 'stop' ? 'KHÔNG nên tiếp tục lái' : result.can_drive === 'caution' ? 'lái cẩn thận' : 'vẫn lái được bình thường';
      return `${result.code}: ${result.title_vi}. Mức độ ${result.severity}, ${drive}. ${result.action_vi ?? ''}`.trim();
    }

    case 'vehicle.getHealthScore': {
      const total = result?.score?.total ?? result?.health_score;
      if (total == null) return 'Chưa đủ dữ liệu để tính điểm sức khoẻ xe.';
      // Thêm chút "cá tính" ấm áp (cải thiện UX 2026-07-28, góp ý user) - CHỈ đổi CÂU KHEN/ĐỘNG
      // VIÊN thêm vào SAU con số thật, không đổi/thêm bất kỳ số liệu nào - an toàn với grounding
      // validator (chỉ áp dụng đường LLM, đường Local vốn đã grounded 100% từ tool_result).
      const warmth = total >= 85
        ? ' Xe bạn đang rất khoẻ, cứ yên tâm cầm lái nhé!'
        : total < 50
          ? ' Có vài điều cần lưu ý, nhưng đừng lo, mình sẽ đồng hành cùng bạn theo dõi tiếp.'
          : '';
      return `Điểm sức khoẻ xe hiện tại: ${total}/100.${warmth}`;
    }

    case 'vehicle.getRecentIssues': {
      const moodText: Record<string, string> = {
        happy: 'đang ổn, không có vấn đề gì đáng lo',
        warn: 'có vài điểm cần chú ý',
        urgent: 'đang có vấn đề cần xử lý sớm',
        unknown: 'chưa đủ dữ liệu để đánh giá',
      };
      // Câu mở đầu ấm áp hơn tuỳ mood (cùng đợt cải thiện UX ở trên) - chỉ đổi TÔNG GIỌNG, phần
      // dữ liệu thật (top_issue/week_comparison) giữ nguyên logic cũ, không đổi số liệu gì.
      const moodOpener: Record<string, string> = {
        happy: 'Tin vui nè,',
        warn: 'Nói bạn nghe,',
        urgent: 'Mình hơi lo một chút -',
        unknown: '',
      };
      const opener = moodOpener[result.mood] ?? '';
      let text = opener
        ? `${opener} xe bạn ${moodText[result.mood] ?? 'chưa rõ tình trạng'}.`
        : `Xe bạn ${moodText[result.mood] ?? 'chưa rõ tình trạng'}.`;
      if (result.top_issue) text += ` Đáng chú ý nhất: ${result.top_issue.label}.`;
      if (result.week_comparison) {
        const d = result.week_comparison.drivingScoreDelta;
        if (d != null) text += ` Điểm lái xe tuần này ${d >= 0 ? 'cao hơn' : 'thấp hơn'} tuần trước ${Math.abs(d)} điểm.`;
      } else if (result.week_comparison_note) {
        text += ` (${result.week_comparison_note})`;
      }
      return text;
    }

    case 'vehicle.getTripToday':
      return result.trips_count > 0
        ? `Hôm nay bạn đã chạy ${result.total_km} km qua ${result.trips_count} chuyến.`
        : 'Hôm nay chưa ghi nhận chuyến đi nào.';

    case 'vehicle.getCurrentODO': {
      const readings = result.readings?.data ?? result.readings ?? [];
      const latest = Array.isArray(readings) ? readings[0] : null;
      return latest ? `Số công-tơ-mét gần nhất: ${latest.odometer ?? latest.so_km} km.` : 'Chưa có dữ liệu công-tơ-mét nào.';
    }

    case 'expense.summary': {
      const monthIntent = resolveRequestedMonth(userText);
      if (monthIntent === 'unsupported') {
        return 'Mình hiện chỉ tra được chi phí xăng của THÁNG NÀY hoặc THÁNG TRƯỚC, chưa hỗ trợ tra một tháng cụ thể xa hơn trong quá khứ - bạn hỏi lại cho tháng này/tháng trước giúp mình nhé.';
      }
      if (monthIntent === 'both') {
        return `${formatMonthLine('Tháng này', result.this_month)} ${formatMonthLine('Tháng trước', result.last_month)}`;
      }
      const label = monthIntent === 'last_month' ? 'Tháng trước' : 'Tháng này';
      const data = monthIntent === 'last_month' ? result.last_month : result.this_month;
      return formatMonthLine(label, data);
    }

    case 'maintenance.expenseSummary': {
      const service = result.service ?? 0;
      const fuel = result.fuel ?? 0;
      if (service === 0) return 'Trong 30 ngày gần đây bạn chưa có chi phí bảo dưỡng/sửa chữa nào được ghi nhận.';
      return `30 ngày gần đây bạn đã chi ${service.toLocaleString('vi-VN')}đ cho bảo dưỡng/sửa chữa (chi phí xăng cùng kỳ: ${fuel.toLocaleString('vi-VN')}đ).`;
    }

    case 'maintenance.getUpcoming': {
      const reminders = result.reminders?.data ?? result.reminders ?? [];
      const urgent = Array.isArray(reminders) ? reminders.filter((r: any) => r?.eval?.status === 'qua_han' || r?.eval?.status === 'sap_toi') : [];
      if (urgent.length === 0) return 'Hiện chưa có mục bảo dưỡng/giấy tờ nào sắp đến hạn.';
      return `Có ${urgent.length} mục sắp đến hạn: ${urgent.map((r: any) => r.reminder?.hang_muc_label ?? r.reminder?.hang_muc).join(', ')}.`;
    }

    case 'fuel.findNearbyStations': {
      const stations = result.stations ?? [];
      if (stations.length === 0) return 'Không tìm thấy cây xăng nào gần vị trí của bạn.';
      const names = stations.slice(0, 3).map((s: any) => s.name ?? s.ten ?? 'Cây xăng').join(', ');
      return `Tìm thấy ${stations.length} cây xăng gần bạn, gần nhất: ${names}.`;
    }

    // Thêm 2026-07-28 (mở rộng độ phủ theo rà soát docs/nori-agent-qa-coverage.md, 3 câu hỏi
    // "chưa có tool"): mirror đúng format fuel.findNearbyStations, chỉ đổi từ "cây xăng" -> "trạm sạc".
    case 'ev.findNearbyChargingStations': {
      const stations = result.stations ?? [];
      if (stations.length === 0) return 'Không tìm thấy trạm sạc nào gần vị trí của bạn.';
      const names = stations.slice(0, 3).map((s: any) => s.name ?? s.ten ?? 'Trạm sạc').join(', ');
      return `Tìm thấy ${stations.length} trạm sạc gần bạn, gần nhất: ${names}.`;
    }

    case 'vehicle.getLifetimeCost': {
      const total = result.total ?? 0;
      const perKm = result.per_km;
      let text = `Từ trước tới giờ xe bạn đã tốn tổng cộng ${total.toLocaleString('vi-VN')}đ (xăng ${(result.fuel ?? 0).toLocaleString('vi-VN')}đ, bảo dưỡng ${(result.service ?? 0).toLocaleString('vi-VN')}đ)`;
      if (perKm != null) text += `, trung bình ${perKm.toLocaleString('vi-VN')}đ/km`;
      return `${text}.`;
    }

    case 'fuel.predictNextRefuel': {
      const parts: string[] = [];
      if (result.days_left != null) parts.push(`còn khoảng ${result.days_left} ngày`);
      if (result.next_odo != null) parts.push(`mốc ODO khoảng ${result.next_odo} km`);
      if (result.cost != null) parts.push(`tốn khoảng ${result.cost.toLocaleString('vi-VN')}đ`);
      if (parts.length === 0) return 'Mình chưa đủ dữ liệu để dự đoán lần đổ xăng tiếp theo.';
      return `Dự đoán lần đổ xăng tiếp theo: ${parts.join(', ')}.`;
    }

    case 'vehicle.getFuelConsumptionHealth':
      return result.detail || result.verdict || 'Mình chưa có nhận định rõ về mức tiêu hao nhiên liệu của xe.';

    case 'weather.getCurrent': {
      const label = result.condition?.label ?? result.condition?.text ?? result.condition?.description;
      let text = `Thời tiết hiện tại chỗ bạn khoảng ${result.temp}°C`;
      if (label) text += `, ${String(label).toLowerCase()}`;
      text += '.';
      if (result.aqi?.value != null) text += ` Chất lượng không khí (AQI) khoảng ${result.aqi.value}.`;
      return text;
    }

    default:
      return 'Mình đã có thông tin nhưng chưa biết diễn đạt sao cho gọn - bạn hỏi lại chi tiết hơn giúp mình nhé.';
  }
}
