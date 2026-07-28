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
| "Cho xem toàn bộ thông số xe" | 🟡 | ⚡ Local | `vehicle.getLiveData` | **Thêm mẫu local 2026-07-28** (theo yêu cầu user mở rộng độ phủ) - gộp cả 5 chỉ số trên trong 1 lần gọi + 1 câu trả lời tổng hợp mới trong `LocalReplyTemplates.ts`. |
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
| "Xe tôi có tốn xăng hơn bình thường không?" | 🟡 | ⚡ Local | `vehicle.getFuelConsumptionHealth` | **Thêm 2026-07-28** - trích riêng organ `tieu_thu` từ `/vehicles/{id}/health` (đã tính sẵn: so với trung vị gần đây + trần hãng công bố) thay vì bắt LLM tự mò trong payload health chung. Cần đủ vài lần đổ ĐẦY BÌNH có ghi ODO mới có nhận định; không áp dụng cho xe điện (trả "unavailable" rõ lý do thay vì im lặng). |

## Hành trình & công-tơ-mét

| Câu hỏi ví dụ | Đã xử lý | Xử lý qua | Tool | Ghi chú |
|---|---|---|---|---|
| "Hôm nay tôi chạy được bao nhiêu km?" | ✅ | ⚡ Local | `vehicle.getTripToday` | Tự lọc đúng ngày hôm nay từ dữ liệu GPS, không cần BLE. Dùng `allOfGroups` (cả 2 từ khoá "hôm nay"+"chạy" cùng xuất hiện, không cần liền kề) vì câu hỏi thật hay chêm chủ ngữ ("hôm nay TÔI chạy ĐƯỢC bao km") làm khớp cụm liền mạch bị trượt - phát hiện lúc test thật, không phải suy đoán. |
| "Số công-tơ-mét gần nhất là bao nhiêu?" | ✅ | ⚡ Local | `vehicle.getCurrentODO` | Bug đã fix: "công-tơ-mét" (có gạch nối) không khớp "cong to met" cho tới khi thêm bước thay gạch nối bằng khoảng trắng lúc chuẩn hoá câu. |

## Chi phí

| Câu hỏi ví dụ | Đã xử lý | Xử lý qua | Tool | Ghi chú |
|---|---|---|---|---|
| "Tháng này tôi tốn bao nhiêu tiền xăng?" | ✅ | ⚡ Local | `expense.summary` | Chỉ tính chi phí NHIÊN LIỆU (xăng/điện), KHÔNG gồm bảo dưỡng/sửa chữa. |
| "Tiền xăng tháng trước / tháng 6" (khi tháng 6 = tháng trước) | ✅ | ⚡ Local | `expense.summary` | **Sửa 2026-07-27** - bug thật: trước đây LUÔN trả lời "tháng này" bất kể hỏi tháng nào (template chỉ đọc `this_month`, bỏ qua `last_month` dù đã có sẵn trong tool_result). Giờ `resolveRequestedMonth()` nhận diện "tháng trước"/số tháng cụ thể (so với ngày thật) → trả đúng `last_month`. |
| "Tháng trước so với tháng này thế nào?" | ✅ | ⚡ Local | `expense.summary` | Trả cả `this_month` VÀ `last_month` trong 1 câu. **Sửa thêm 2026-07-28** - dòng này trước đây ghi nhầm là ĐÃ khớp Local, nhưng thực tế `LocalIntentMatcher` chưa có mẫu cho câu KHÔNG nhắc "tiền"/"xăng" trực tiếp (bắt được qua ảnh chụp user gửi thật: câu y hệt này rơi về LLM, đúng lúc backend lỗi nên báo "mất kết nối") - đã thêm `allOfGroups: [['thang truoc','thang nay']]` để khớp local đúng như tài liệu mô tả từ đầu. |
| "Tiền xăng tháng 3" (không phải tháng này/tháng trước) | ✅ | ⚡ Local | `expense.summary` | Trả lời THẬT là chưa hỗ trợ tra 1 tháng cụ thể xa hơn quá khứ (backend chỉ có this_month/last_month/all_time, không có API theo tháng bất kỳ) - KHÔNG ngầm định về tháng này như trước. |
| "Tổng tiền bảo dưỡng tháng trước?" | ✅ | ⚡ Local | `maintenance.expenseSummary` | **Thêm 2026-07-27** - phát hiện thiếu lúc user test thật (không tool nào trả lời được, grounding validator đúng đắn chặn số LLM tự bịa nhưng vẫn không giúp ích gì). Route mới `GET vehicles/{id}/cost-summary` tái dùng `CostSummary::since()`. Trả cả `service` (bảo dưỡng) lẫn `fuel` (xăng) trong 30 ngày để so sánh. |
| "Tổng chi phí xe tôi từ trước tới giờ (xăng + bảo dưỡng, TRỌN ĐỜI)?" | ✅ | ⚡ Local | `vehicle.getLifetimeCost` | **Thêm 2026-07-28** - backend thêm nhánh `?scope=lifetime` vào route `cost-summary` sẵn có, gọi `CostSummary::lifetime()` (đã chạy production ở 3 nơi khác, không phải logic mới chưa kiểm chứng). Khác với "30 ngày gần đây" (`maintenance.expenseSummary`) - đây là TOÀN BỘ lịch sử, kèm chi phí trung bình mỗi km. |
| "Bao giờ tôi phải đổ xăng tiếp?" / "Còn bao xa thì hết xăng?" | ✅ | ⚡ Local | `fuel.predictNextRefuel` | **Thêm 2026-07-28** - `/dashboard` đã trả sẵn field `prediction` (`FuelCalculator::predictNextRefuel`, EWMA trên lịch sử đổ) nhưng trước đây không tool nào lấy field này. Cần >= 2 lần đổ có ghi ODO mới dự đoán được, nếu chưa đủ trả "unavailable" (không suy diễn khi thiếu dữ liệu). |

## Bảo dưỡng & giấy tờ

| Câu hỏi ví dụ | Đã xử lý | Xử lý qua | Tool | Ghi chú |
|---|---|---|---|---|
| "Xe tôi có gì sắp đến hạn không?" | ✅ | ⚡ Local | `maintenance.getUpcoming` | Gộp cả bảo dưỡng lẫn giấy tờ. |
| "Bảo hiểm xe tôi còn hạn không?" | ✅ | ⚡ Local | `maintenance.getUpcoming` | Bảo hiểm chỉ là 1 loại nhắc nhở (`loai=bao_hiem`) trong cùng danh sách trên, không phải tool riêng. |
| "Đăng kiểm xe tôi khi nào tới hạn?" | ✅ | ⚡ Local | `maintenance.getUpcoming` | Tương tự (`loai=dang_kiem`). |
| "Đăng kiểm của tôi đến hạn khi nào?" (thứ tự "đến hạn" trước "khi nào") | ✅ | ⚡ Local | `maintenance.getUpcoming` | **Sửa 2026-07-28** - bug thật từ ảnh chụp user gửi: câu này KHÔNG khớp mẫu cũ (chỉ có "khi nào đến hạn", không có chiều đảo) nên rơi về LLM, đúng lúc backend lỗi nên user thấy "mất kết nối". Đổi sang `allOfGroups` (không quan tâm thứ tự). |
| "Ghi công-tơ-mét 5588" (Ý ĐỊNH GHI, không phải hỏi) | ✅ | 🧠 LLM | `odometer.create` | **Sửa 2026-07-28 - BUG NGHIÊM TRỌNG** - trước đây rule đọc `vehicle.getCurrentODO` (chỉ cần chứa "công tơ mét") khớp NHẦM câu này, trả lời như đang HỎI số hiện tại, KHÔNG hề ghi gì - user tưởng đã ghi xong (ảnh chụp cho thấy lặp lại y hệt với số khác, vẫn báo số cũ). Đã thêm guard chặn MỌI câu có động từ "ghi"/"cập nhật"/"vừa đổ" khỏi toàn bộ local matcher, buộc luôn qua LLM (nơi có tool ghi thật + xác nhận). |

## Vị trí & tiện ích gần đây

| Câu hỏi ví dụ | Đã xử lý | Xử lý qua | Tool | Ghi chú |
|---|---|---|---|---|
| "Tìm cây xăng gần đây" | 🟡 | ⚡ Local | `fuel.findNearbyStations` | Cần quyền vị trí (đã có sẵn permission, không cần xin thêm) + tính năng Premium (`gas_finder`). Toạ độ GPS không bao giờ gửi cho LLM — chỉ danh sách trạm mới vào tool_result. |
| "Tìm trạm sạc gần đây" (xe điện) | 🟡 | ⚡ Local | `ev.findNearbyChargingStations` | **Thêm 2026-07-28** - mirror đúng `fuel.findNearbyStations` (route backend `nearby-charging` + hàm client `refuelsApi.nearbyCharging` đã có sẵn từ trước, chỉ chưa được bọc tool). Cùng điều kiện: cần quyền vị trí + Premium (`gas_finder`). |
| "Tìm garage/tiệm sửa xe gần đây" | ❌ | — | — | **Đã rà soát kỹ 2026-07-28, xác nhận KHÔNG thể làm như đã tưởng**: `services/garages` (`ServiceLogController@garages`) không hề tìm theo vị trí GPS - nó trả về danh sách gara mà CHÍNH user này đã từng dùng trước đây (`ServiceLog.noi_lam`, để gợi ý chọn nhanh khi ghi bảo dưỡng mới), không phải "gara gần vị trí hiện tại". Xây tool "tìm gara gần đây" thật cần tích hợp bên thứ ba (vd Google Places) - việc mới, không phải mở rộng nhỏ, chưa làm. |

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

- **21 tool đã xây** (19 tool đọc + 2 tool ghi `odometer.create`/`fuel.create`, Phase 2) — phủ gần
  như toàn bộ câu hỏi "hỏi đáp thường ngày" đã ghi nhận qua test thật, trừ "tìm garage gần đây"
  (cần tích hợp bên thứ ba, việc mới chứ không phải mở rộng nhỏ), cộng 2 hành động ghi dữ liệu cơ
  bản nhất (ODO, đổ xăng).
- **19/19 tool ĐỌC có mẫu Local Intent Matcher** (thêm 4 tool mới 2026-07-28:
  `vehicle.getLifetimeCost`, `fuel.predictNextRefuel`, `vehicle.getFuelConsumptionHealth`,
  `ev.findNearbyChargingStations`) — phần lớn câu hỏi phổ biến giờ KHÔNG cần gọi LLM nữa. 2 tool
  GHI vẫn cố tình luôn đi qua LLM, không có mẫu Local (mục 15 `nori-agent-plan.md`: số liệu ghi
  vào là dữ liệu thật, cần LLM linh hoạt parse câu tự nhiên + có bước xác nhận UI, không tin
  tưởng regex trích số tự động ghi thẳng) - và bất kỳ câu nào có động từ "ghi"/"cập nhật"/"vừa
  đổ" đều bị chặn khỏi TOÀN BỘ local matcher ngay từ đầu, để không bị rule đọc khớp nhầm ý định
  ghi (bug thật bắt được 2026-07-28, xem mục 15 `nori-agent-plan.md`).
- **Rà soát mở rộng độ phủ 2026-07-28 (lần 1)**: thêm biến thể phrasing tự nhiên cho hầu hết tool
  đọc (vận tốc/RPM/nước làm mát/mức xăng/ắc-quy/tìm cây xăng/chi phí xăng/nhắc bảo dưỡng/quãng
  đường hôm nay/tổng số km) - verify bằng test thật (`npx tsx` gọi thẳng `matchLocalIntent()`),
  không suy đoán. 45/45 case test (cả cũ lẫn mới) pass.
- **Rà soát mở rộng độ phủ 2026-07-28 (lần 2, đóng gap từ bảng "Khoảng trống" phía trên)**: thêm
  4 tool mới đóng 3/3 câu hỏi "chưa có tool" đã ghi nhận + 1 câu "tiêu hao xăng bất thường" - tất
  cả đều wrap lại dữ liệu/endpoint ĐÃ CÓ SẴN ở backend (`CostSummary::lifetime()` đã chạy production
  3 nơi khác, field `prediction`/organ `tieu_thu` đã có sẵn trong `/dashboard`/`/health` nhưng
  trước đây bị bỏ qua, route `nearby-charging` đã có sẵn) - không phải logic mới chưa kiểm chứng.
  Verify bằng test thật qua `npx tsx` (35/35 case `matchLocalIntent`, bao gồm cả regression case cũ
  + case chặn "ghi" cạnh phrasing chi phí mới; 10/10 case `buildLocalReply` không crash), cộng
  `npx tsc --noEmit` + `php -l` sạch cho cả 2 repo.
- **Khoảng trống còn lại**: "tìm garage gần đây" theo đúng nghĩa GPS (đã xác nhận backend hiện tại
  KHÔNG hỗ trợ, chỉ có "gara đã dùng trước đây" - khác nghĩa, không nên giả làm tool mới vì sẽ trả
  lời sai ý định câu hỏi) — cần quyết định có tích hợp Google Places hay tương tự không, việc mới
  ngoài phạm vi "mở rộng nhỏ" của đợt rà soát này.
- **Mọi câu hỏi "sống" (tốc độ/vòng tua lúc đang lái)** đã xây nhưng giá trị thực tế thấp theo
  góp ý — không cần ưu tiên quảng bá trong UX chat.
