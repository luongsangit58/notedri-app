# Nori Agent — Bảng câu hỏi user hay hỏi & mức độ xử lý

> Cập nhật: 2026-07-27. Đi kèm `docs/nori-agent-plan.md` (kiến trúc/quyết định) — file này chỉ
> tập trung vào "hỏi gì thì Nori làm được gì", để dễ rà soát khi cần bổ sung câu hỏi mới.
>
> Quy ước cột "Đã xử lý":
> - ✅ Xong — có tool thật, dữ liệu thật, đã test qua Groq (xem mục 15 `nori-agent-plan.md`)
> - 🟡 Có nhưng có điều kiện — chạy được nhưng phụ thuộc Premium/BLE/vị trí, có thể báo "unavailable"
> - ❌ Chưa có — không có tool nào xử lý, Nori sẽ trả lời chung chung hoặc nói không biết
> - 🚫 Cố tình không làm — nằm ngoài phạm vi Phase 1 (ghi/xoá dữ liệu), để Phase 2

## Dữ liệu xe sống (cần BLE/OBD đang kết nối)

| Câu hỏi ví dụ | Đã xử lý | Tool | Ghi chú |
|---|---|---|---|
| "Xe đang chạy bao nhiêu km/h?" | 🟡 | `vehicle.getSpeed` | Cần BLE đang kết nối, nếu không sẽ báo "chưa kết nối" thay vì bịa số. **Ít giá trị thực tế** vì số liệu đổi liên tục lúc đang lái — theo góp ý, ưu tiên thấp cho UX chat. |
| "Vòng tua máy hiện tại?" | 🟡 | `vehicle.getRPM` | Như trên. |
| "Nhiệt độ nước làm mát?" | 🟡 | `vehicle.getCoolant` | Như trên. |
| "Mức xăng còn bao nhiêu %?" | 🟡 | `vehicle.getFuelLevel` | Như trên. |
| "Điện áp ắc-quy ổn không?" | 🟡 | `vehicle.getBatteryVoltage` | Như trên. |
| "Cho xem toàn bộ thông số xe" | 🟡 | `vehicle.getLiveData` | Gộp cả 5 chỉ số trên trong 1 lần gọi. |
| "Xe tôi có mã lỗi gì không?" (đọc thô) | 🟡 | `vehicle.readDTC` | Cần BLE đang kết nối. |

## Mã lỗi & chẩn đoán (không cần BLE)

| Câu hỏi ví dụ | Đã xử lý | Tool | Ghi chú |
|---|---|---|---|
| "P0301 là lỗi gì?" | ✅ | `knowledge.explainDTC` | Tra từ điển offline đóng gói sẵn, không cần mạng/BLE. |
| "Mã C0300 có nghiêm trọng không, tôi lái tiếp được không?" | ✅ | `knowledge.explainDTC` | Trả kèm `severity`, `can_drive`. |

## Sức khoẻ & vấn đề gần đây (nhóm câu hỏi ưu tiên cao theo góp ý thực tế)

| Câu hỏi ví dụ | Đã xử lý | Tool | Ghi chú |
|---|---|---|---|
| "Xe tôi sức khoẻ thế nào?" | ✅ | `vehicle.getHealthScore` | Miễn phí, không cần Premium. |
| "Hôm qua/tuần qua xe tôi có vấn đề gì không?" | 🟡 | `vehicle.getRecentIssues` | Vừa thêm 2026-07-27. Tái dùng đúng logic mood/top-issue của Nori mascot (Home). Phần "so sánh tuần" cần Premium (`obd2/*`) — nếu không có Premium vẫn trả được mood/vấn đề nổi bật (miễn phí), chỉ thiếu phần so sánh tuần kèm ghi chú rõ lý do. |
| "Xe tôi dạo này ổn không?" | 🟡 | `vehicle.getRecentIssues` | Như trên. |

## Hành trình & công-tơ-mét

| Câu hỏi ví dụ | Đã xử lý | Tool | Ghi chú |
|---|---|---|---|
| "Hôm nay tôi chạy được bao nhiêu km?" | ✅ | `vehicle.getTripToday` | Tự lọc đúng ngày hôm nay từ dữ liệu GPS, không cần BLE. |
| "Số công-tơ-mét gần nhất là bao nhiêu?" | ✅ | `vehicle.getCurrentODO` | |

## Chi phí

| Câu hỏi ví dụ | Đã xử lý | Tool | Ghi chú |
|---|---|---|---|
| "Tháng này tôi tốn bao nhiêu tiền xăng?" | ✅ | `expense.summary` | Chỉ tính chi phí NHIÊN LIỆU (xăng/điện), KHÔNG gồm bảo dưỡng/sửa chữa. |
| "Tháng trước so với tháng này thế nào?" | ✅ | `expense.summary` | Trả cả `this_month`/`last_month`/`all_time` cùng lúc. |
| "Tổng chi phí xe tôi từ trước tới giờ (xăng + bảo dưỡng)?" | ❌ | — | Chưa có tool — dữ liệu tồn tại ở backend (`CostSummary::lifetime()`) nhưng chỉ lộ qua endpoint báo cáo theo năm, Premium-gated cho năm cũ. Cần cân nhắc thêm route/tool riêng nếu câu hỏi này phổ biến. |

## Bảo dưỡng & giấy tờ

| Câu hỏi ví dụ | Đã xử lý | Tool | Ghi chú |
|---|---|---|---|
| "Xe tôi có gì sắp đến hạn không?" | ✅ | `maintenance.getUpcoming` | Gộp cả bảo dưỡng lẫn giấy tờ. |
| "Bảo hiểm xe tôi còn hạn không?" | ✅ | `maintenance.getUpcoming` | Bảo hiểm chỉ là 1 loại nhắc nhở (`loai=bao_hiem`) trong cùng danh sách trên, không phải tool riêng. |
| "Đăng kiểm xe tôi khi nào tới hạn?" | ✅ | `maintenance.getUpcoming` | Tương tự (`loai=dang_kiem`). |

## Vị trí & tiện ích gần đây

| Câu hỏi ví dụ | Đã xử lý | Tool | Ghi chú |
|---|---|---|---|
| "Tìm cây xăng gần đây" | 🟡 | `fuel.findNearbyStations` | Vừa thêm 2026-07-27. Cần quyền vị trí (đã có sẵn permission, không cần xin thêm) + tính năng Premium (`gas_finder`). Toạ độ GPS không bao giờ gửi cho LLM — chỉ danh sách trạm mới vào tool_result. |
| "Tìm trạm sạc gần đây" (xe điện) | ❌ | — | Backend có endpoint `nearby-charging` tương tự nearby-stations nhưng CHƯA làm tool riêng — dễ thêm nếu cần (giống hệt pattern `fuel.findNearbyStations`). |
| "Tìm garage/tiệm sửa xe gần đây" | ❌ | — | Backend có `services/garages` (`ServiceLogController@garages`) nhưng chưa xác nhận có filter theo vị trí không — cần rà soát riêng nếu muốn làm. |

## Ghi/sửa dữ liệu (cố tình NGOÀI phạm vi Phase 1)

| Câu hỏi ví dụ | Đã xử lý | Ghi chú |
|---|---|---|
| "Ghi giúp tôi vừa đổ 50k tiền xăng" | 🚫 | Phase 2 (`fuel.create`) — cần hội thoại nhiều lượt xác nhận trước khi ghi (authority: mutating). |
| "Cập nhật số công-tơ-mét thành 45.230" | 🚫 | Phase 2 (`odometer.create`) — tương tự. |
| "Xoá mã lỗi vừa quét được" | 🚫 | Phase 2, đánh dấu `destructive` — bắt buộc xác nhận + khoá thực thi (mục 7 kế hoạch), KHÔNG làm trước khi có cơ chế confirm rõ ràng. |
| "Đặt lịch nhắc bảo dưỡng mới" | 🚫 | Phase 2 (`maintenance.create` kiểu). |

## Ngoài phạm vi tool (Nori tự trả lời tự nhiên, không ép gọi tool)

| Câu hỏi ví dụ | Đã xử lý | Ghi chú |
|---|---|---|
| "Chào Nori", "Cảm ơn nhé" | ✅ | Không có tool nào phù hợp thì Nori trả lời hội thoại bình thường — đã test qua Groq, hoạt động đúng. |
| Câu hỏi mơ hồ Nori không có tool trả lời chính xác (vd "chạy được bao xa với bình xăng đầy") | ✅ | Grounding validator chặn nếu Nori tự đoán ra số — xem `ConversationManager.applyGroundingValidator()`. |

---

## Tổng kết nhanh

- **13 tool đã xây** (11 tool gốc + 2 tool vừa thêm), phủ hầu hết câu hỏi "hỏi đáp thường ngày" trừ vài câu chi phí tổng/trạm sạc/garage.
- **Khoảng trống lớn nhất hiện tại**: tổng chi phí trọn đời (xăng + bảo dưỡng), tìm trạm sạc điện, tìm garage gần đây — đều là mở rộng nhỏ, không phải thiết kế lại.
- **Mọi câu hỏi "sống" (tốc độ/vòng tua lúc đang lái)** đã xây nhưng giá trị thực tế thấp theo góp ý — không cần ưu tiên quảng bá trong UX chat.
