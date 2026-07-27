/**
 * Dựng câu trả lời tiếng Việt THẲNG từ tool_result cho các intent khớp LocalIntentMatcher -
 * KHÔNG qua LLM. Vì vậy câu trả lời chắc chắn grounded (không có bước "LLM diễn đạt lại" nên
 * không có chỗ để bịa số) - nhưng cũng nghĩa là câu văn cứng hơn LLM, không linh hoạt theo ngữ
 * cảnh hội thoại. Giữ mỗi template ngắn, đúng dữ liệu, đúng giọng đã định trong system prompt
 * (mục 1: nhắc tuổi dữ liệu khi có ý nghĩa, nói rõ "chưa kết nối" thay vì im lặng/bịa).
 */

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
    default:
      return 'Mình chưa lấy được thông tin này lúc này, bạn thử lại sau giúp mình nhé.';
  }
}

export function buildLocalReply(toolName: string, result: any): string {
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
      return total != null ? `Điểm sức khoẻ xe hiện tại: ${total}/100.` : 'Chưa đủ dữ liệu để tính điểm sức khoẻ xe.';
    }

    case 'vehicle.getRecentIssues': {
      const moodText: Record<string, string> = {
        happy: 'đang ổn, không có vấn đề gì đáng lo',
        warn: 'có vài điểm cần chú ý',
        urgent: 'đang có vấn đề cần xử lý sớm',
        unknown: 'chưa đủ dữ liệu để đánh giá',
      };
      let text = `Xe bạn ${moodText[result.mood] ?? 'chưa rõ tình trạng'}.`;
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
      const m = result.this_month;
      return m ? `Tháng này bạn đã chi ${m.tong_tien?.toLocaleString('vi-VN')}đ tiền nhiên liệu (${m.tong_lit}L, ${m.so_lan} lần đổ).`
        : 'Chưa có dữ liệu chi phí nhiên liệu tháng này.';
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

    default:
      return 'Mình đã có thông tin nhưng chưa biết diễn đạt sao cho gọn - bạn hỏi lại chi tiết hơn giúp mình nhé.';
  }
}
