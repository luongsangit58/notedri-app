# Nori Agent — Bảng câu hỏi user hay hỏi & mức độ xử lý

> Cập nhật: 2026-07-27. Đi kèm `docs/nori-agent-plan.md` (kiến trúc/quyết định) — file này chỉ
> tập trung vào "hỏi gì thì Nori làm được gì", để dễ rà soát khi cần bổ sung câu hỏi mới.
>
> Quy ước cột "Đã xử lý":
> - ✅ Xong — có tool thật, dữ liệu thật, đã test qua Groq (xem mục 15 `nori-agent-plan.md`)
> - 🟡 Có nhưng có điều kiện — chạy được nhưng phụ thuộc Premium/BLE/vị trí, có thể báo "unavailable"
> - ❌ Chưa có — không có tool nào xử lý, Nori sẽ trả lời chung chung hoặc nói không biết
> - 🚫 Cố tình không làm — nằm ngoài phạm vi đã chốt (xoá/sửa dữ liệu khác), để Phase 2 sau
>
> Quy ước cột "Xử lý qua" (thêm 2026-07-27, sau khi có `LocalIntentMatcher`):
> - ⚡ Local — khớp mẫu câu hỏi trên thiết bị (`src/agent/LocalIntentMatcher.ts`), trả lời THẲNG
>   từ tool_result qua template (`LocalReplyTemplates.ts`) - **KHÔNG gọi LLM**, miễn phí, tức
>   thời, grounding tự động đúng 100% (không có bước LLM diễn đạt lại nên không có chỗ bịa số).
>   Chỉ khớp khi câu hỏi đủ rõ ràng - phrasing khác thường vẫn rơi về LLM bình thường (không vỡ).
> - 🧠 LLM — không có mẫu rõ ràng (hoặc câu hỏi ghép nhiều ý/phức tạp), đi qua Groq/Anthropic/
>   Gemini như bình thường để LLM tự chọn tool.

## Dữ liệu xe sống (cần BLE/OBD đang kết nối)

| Câu hỏi ví dụ | Đã xử lý | Xử lý qua | Tool | Ghi chú |
|---|---|---|---|---|
| "Xe đang chạy bao nhiêu km/h?" | 🟡 | ⚡ Local | `vehicle.getSpeed` | Cần BLE đang kết nối, nếu không sẽ báo "chưa kết nối" thay vì bịa số. **Ít giá trị thực tế** vì số liệu đổi liên tục lúc đang lái — theo góp ý, ưu tiên thấp cho UX chat. |
| "Vòng tua máy hiện tại?" | 🟡 | ⚡ Local | `vehicle.getRPM` | Như trên. |
| "Nhiệt độ nước làm mát?" | 🟡 | ⚡ Local | `vehicle.getCoolant` | Như trên. |
| "Mức xăng còn bao nhiêu %?" | 🟡 | ⚡ Local | `vehicle.getFuelLevel` | Như trên. |
| "Điện áp ắc-quy ổn không?" | 🟡 | ⚡ Local | `vehicle.getBatteryVoltage` | Như trên. |
| "Cho xem toàn bộ thông số xe" | 🟡 | 🧠 LLM | `vehicle.getLiveData` | Gộp cả 5 chỉ số trên trong 1 lần gọi. Tool DUY NHẤT chưa có mẫu local (câu hỏi kiểu "cho xem hết" ít cố định phrasing hơn, chưa đáng thêm rule). |
| "Xe tôi có mã lỗi gì không?" (đọc thô) | 🟡 | ⚡ Local | `vehicle.readDTC` | Cần BLE đang kết nối. |

## Mã lỗi & chẩn đoán (không cần BLE)

| Câu hỏi ví dụ | Đã xử lý | Xử lý qua | Tool | Ghi chú |
|---|---|---|---|---|
| "P0301 là lỗi gì?" | ✅ | ⚡ Local | `knowledge.explainDTC` | Khớp qua regex mã DTC (`/[pbcu]\d{3,4}/i`) - mẫu đặc trưng nhất, gần như không nhầm lẫn với câu hỏi khác. Tra từ điển offline đóng gói sẵn, không cần mạng/BLE. |
| "Mã C0300 có nghiêm trọng không, tôi lái tiếp được không?" | ✅ | ⚡ Local | `knowledge.explainDTC` | Trả kèm `severity`, `can_drive`. |

## Sức khoẻ & vấn đề gần đây (nhóm câu hỏi ưu tiên cao theo góp ý thực tế)

| Câu hỏi ví dụ | Đã xử lý | Xử lý qua | Tool | Ghi chú |
|---|---|---|---|---|
| "Xe tôi sức khoẻ thế nào?" | ✅ | ⚡ Local | `vehicle.getHealthScore` | Miễn phí, không cần Premium. |
| "Hôm qua/tuần qua xe tôi có vấn đề gì không?" | 🟡 | ⚡ Local | `vehicle.getRecentIssues` | Tái dùng đúng logic mood/top-issue của Nori mascot (Home). Phần "so sánh tuần" cần Premium (`obd2/*`) — nếu không có Premium vẫn trả được mood/vấn đề nổi bật (miễn phí), chỉ thiếu phần so sánh tuần kèm ghi chú rõ lý do. |
| "Xe tôi dạo này ổn không?" | 🟡 | ⚡ Local | `vehicle.getRecentIssues` | Như trên. |

## Hành trình & công-tơ-mét

| Câu hỏi ví dụ | Đã xử lý | Xử lý qua | Tool | Ghi chú |
|---|---|---|---|---|
| "Hôm nay tôi chạy được bao nhiêu km?" | ✅ | ⚡ Local | `vehicle.getTripToday` | Tự lọc đúng ngày hôm nay từ dữ liệu GPS, không cần BLE. Dùng `allOfGroups` (cả 2 từ khoá "hôm nay"+"chạy" cùng xuất hiện, không cần liền kề) vì câu hỏi thật hay chêm chủ ngữ ("hôm nay TÔI chạy ĐƯỢC bao km") làm khớp cụm liền mạch bị trượt - phát hiện lúc test thật, không phải suy đoán. |
| "Số công-tơ-mét gần nhất là bao nhiêu?" | ✅ | ⚡ Local | `vehicle.getCurrentODO` | Bug đã fix: "công-tơ-mét" (có gạch nối) không khớp "cong to met" cho tới khi thêm bước thay gạch nối bằng khoảng trắng lúc chuẩn hoá câu. |

## Chi phí

| Câu hỏi ví dụ | Đã xử lý | Xử lý qua | Tool | Ghi chú |
|---|---|---|---|---|
| "Tháng này tôi tốn bao nhiêu tiền xăng?" | ✅ | ⚡ Local | `expense.summary` | Chỉ tính chi phí NHIÊN LIỆU (xăng/điện), KHÔNG gồm bảo dưỡng/sửa chữa. |
| "Tháng trước so với tháng này thế nào?" | ✅ | ⚡ Local | `expense.summary` | Trả cả `this_month`/`last_month`/`all_time` cùng lúc. |
| "Tổng tiền bảo dưỡng tháng trước?" | ✅ | ⚡ Local | `maintenance.expenseSummary` | **Thêm 2026-07-27** - phát hiện thiếu lúc user test thật (không tool nào trả lời được, grounding validator đúng đắn chặn số LLM tự bịa nhưng vẫn không giúp ích gì). Route mới `GET vehicles/{id}/cost-summary` tái dùng `CostSummary::since()`. Trả cả `service` (bảo dưỡng) lẫn `fuel` (xăng) trong 30 ngày để so sánh. |
| "Tổng chi phí xe tôi từ trước tới giờ (xăng + bảo dưỡng, TRỌN ĐỜI)?" | ❌ | — | — | Vẫn chưa có - `CostSummary::lifetime()` tồn tại nhưng chỉ lộ qua endpoint báo cáo theo năm, Premium-gated cho năm cũ. Khác với "30 ngày gần đây" (đã có ở trên) - đây là hỏi TOÀN BỘ lịch sử. |

## Bảo dưỡng & giấy tờ

| Câu hỏi ví dụ | Đã xử lý | Xử lý qua | Tool | Ghi chú |
|---|---|---|---|---|
| "Xe tôi có gì sắp đến hạn không?" | ✅ | ⚡ Local | `maintenance.getUpcoming` | Gộp cả bảo dưỡng lẫn giấy tờ. |
| "Bảo hiểm xe tôi còn hạn không?" | ✅ | ⚡ Local | `maintenance.getUpcoming` | Bảo hiểm chỉ là 1 loại nhắc nhở (`loai=bao_hiem`) trong cùng danh sách trên, không phải tool riêng. |
| "Đăng kiểm xe tôi khi nào tới hạn?" | ✅ | ⚡ Local | `maintenance.getUpcoming` | Tương tự (`loai=dang_kiem`). |

## Vị trí & tiện ích gần đây

| Câu hỏi ví dụ | Đã xử lý | Xử lý qua | Tool | Ghi chú |
|---|---|---|---|---|
| "Tìm cây xăng gần đây" | 🟡 | ⚡ Local | `fuel.findNearbyStations` | Cần quyền vị trí (đã có sẵn permission, không cần xin thêm) + tính năng Premium (`gas_finder`). Toạ độ GPS không bao giờ gửi cho LLM — chỉ danh sách trạm mới vào tool_result. |
| "Tìm trạm sạc gần đây" (xe điện) | ❌ | — | — | Backend có endpoint `nearby-charging` tương tự nearby-stations nhưng CHƯA làm tool riêng — dễ thêm nếu cần (giống hệt pattern `fuel.findNearbyStations`). |
| "Tìm garage/tiệm sửa xe gần đây" | ❌ | — | — | Backend có `services/garages` (`ServiceLogController@garages`) nhưng chưa xác nhận có filter theo vị trí không — cần rà soát riêng nếu muốn làm. |

## Ghi/sửa dữ liệu

| Câu hỏi ví dụ | Đã xử lý | Xử lý qua | Tool | Ghi chú |
|---|---|---|---|---|
| "Ghi công-tơ-mét 15234 km" | ✅ | 🧠 LLM | `odometer.create` | **Thêm 2026-07-27 (Phase 2)** - `authority: mutating`, `requiresConfirmation: true`. Hiện Modal xác nhận số cụ thể trước khi ghi thật, user bấm Đồng ý/Huỷ. Backend từ chối (422) nếu ODO lùi so với mốc đã biết trước đó - lý do cụ thể được Nori nói lại nguyên văn. |
| "Vừa đổ xăng 5 lít hết 150 nghìn, đầy bình" | ✅ | 🧠 LLM | `fuel.create` | **Thêm 2026-07-27 (Phase 2)** - như trên. Backend bắt buộc >= 2 trong 3 số (lít/đơn giá/tổng tiền) - nếu user chỉ cho 1 số, Nori sẽ hỏi thêm trước khi gọi tool (đã ghi rõ trong description tool, bắt được lúc test thật với backend). |
| "Ghi giúp tôi vừa đổ 50k tiền xăng" (chỉ 1 số) | 🟡 | 🧠 LLM | `fuel.create` | Thiếu 1 số (chỉ có tổng tiền) - Nori sẽ hỏi lại số lít hoặc đơn giá trước khi ghi, không tự đoán. |
| "Xoá mã lỗi vừa quét được" | 🚫 | — | — | Phase 2 sau, đánh dấu `destructive` — bắt buộc xác nhận + khoá thực thi (mục 7 kế hoạch), CHƯA làm - nằm ngoài phạm vi "chỉ ghi ODO/đổ xăng" đã chốt lần này. |
| "Đặt lịch nhắc bảo dưỡng mới" | 🚫 | — | — | Phase 2 sau (`maintenance.create` kiểu) - chưa làm, cùng lý do trên. |

## Ngoài phạm vi tool (Nori tự trả lời tự nhiên, không ép gọi tool)

| Câu hỏi ví dụ | Đã xử lý | Xử lý qua | Ghi chú |
|---|---|---|---|
| "Chào Nori", "Cảm ơn nhé" | ✅ | 🧠 LLM | Không khớp mẫu local nào (cố tình - lời chào/xã giao không có "tool" tương ứng) → Nori trả lời hội thoại bình thường qua LLM — đã test qua Groq, hoạt động đúng. |
| Câu hỏi mơ hồ Nori không có tool trả lời chính xác (vd "chạy được bao xa với bình xăng đầy") | ✅ | 🧠 LLM | Grounding validator chặn nếu Nori tự đoán ra số — xem `ConversationManager.applyGroundingValidator()`. Validator chỉ áp dụng đường LLM (đường Local không cần vì luôn grounded sẵn). |

---

## Chấm điểm câu trả lời (test thủ công)

Nhấn giữ 1 bọt trả lời của Nori trong app → chọn Đúng / Một phần đúng / Sai + ghi chú tuỳ chọn →
ghi vào `storage/logs/nori.log` (backend), cùng `request_id` với request/response gốc của lượt
đó. `grep request_id storage/logs/nori.log` ra được trọn 1 case: câu hỏi, tool nào chạy (hoặc
"Local" nếu qua matcher), câu trả lời, và đánh giá thật của người test. Xem
`POST /api/v1/ai/nori/feedback` (`AiNoriController::feedback()`).

Câu trả lời qua đường **Local** không có request thật ở backend nên không có dòng log
request/response tương ứng — `request_id` dạng `local-<timestamp>-<counter>` vẫn dùng để chấm
điểm được (feedback log riêng), chỉ là không nối được với log request/response như đường LLM.

---

## Tổng kết nhanh

- **17 tool đã xây** (15 tool đọc + 2 tool ghi mới `odometer.create`/`fuel.create`, Phase 2) —
  phủ hầu hết câu hỏi "hỏi đáp thường ngày" trừ vài câu chi phí tổng/trạm sạc/garage, cộng 2
  hành động ghi dữ liệu cơ bản nhất (ODO, đổ xăng).
- **14/15 tool ĐỌC có mẫu Local Intent Matcher** (chỉ `vehicle.getLiveData` chưa có, vì câu hỏi
  "cho xem hết thông số" ít cố định phrasing hơn để viết mẫu tin cậy) — phần lớn câu hỏi phổ
  biến giờ KHÔNG cần gọi LLM nữa. *(Sửa lại so với lần báo cáo trước: đã nói nhầm "9/13" — con
  số đúng sau khi đếm lại kỹ code là 14/15.)* 2 tool GHI mới cố tình luôn đi qua LLM, không có
  mẫu Local (mục 15 `nori-agent-plan.md`: số liệu ghi vào là dữ liệu thật, cần LLM linh hoạt
  parse câu tự nhiên + có bước xác nhận UI, không tin tưởng regex trích số tự động ghi thẳng).
- **Khoảng trống lớn nhất hiện tại**: tổng chi phí trọn đời (xăng + bảo dưỡng), tìm trạm sạc điện,
  tìm garage gần đây — đều là mở rộng nhỏ, không phải thiết kế lại.
- **Mọi câu hỏi "sống" (tốc độ/vòng tua lúc đang lái)** đã xây nhưng giá trị thực tế thấp theo
  góp ý — không cần ưu tiên quảng bá trong UX chat.
