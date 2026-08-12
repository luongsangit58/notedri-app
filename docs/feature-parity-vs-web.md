# Đối chiếu tính năng: notedri-app vs notedri.com (web)

> **Mục đích:** File theo dõi/kiểm soát — liệt kê tính năng nào trên web (`notedri.com`, repo `notedri`) app đã có, đã có tương đương, hay còn thiếu.
> **Ngày khảo sát:** 2026-08-12 · **Cập nhật lần cuối:** 2026-08-12 (đã triển khai 4/6 mục ưu tiên)
> **Nguồn:** đọc trực tiếp code 2 repo (`notedri-app` + sibling repo `notedri` tại `/home/sangnl/Downloads/TMP/notedri`), không dựa vào docs cũ vì đã lệch thực tế (xem mục "Ghi chú về docs cũ" ở cuối).

## Kết luận nhanh

- App đã bao phủ phần lớn tính năng cốt lõi của web, và ở nhiều mảng (OBD2 BLE, GPS auto-track + driving score, OCR/voice input, NFC, Nori AI chat, achievements UI) **app vượt web** vì đó vốn là tính năng chỉ khả thi trên điện thoại.
- Tìm được **6 khoảng trống thật** so với web. **4/6 mục ưu tiên cao/trung bình đã triển khai** (2026-08-12) — xem chi tiết "Đã làm" trong từng mục bên dưới. Còn lại: mục 5 (phong thủy, phụ) và mục 6 (ghép nối thiết bị Nori phần cứng, cần xác nhận team trước).
- Docs trong `notedri-app/docs/` và `notedri/docs/` (project-overview.md, oto360-features-plan.md...) đã lỗi thời so với code — nhiều controller mới bên web (tra cứu phạt nguội, phong thủy, ghép nối thiết bị Nori phần cứng...) chưa được liệt kê ở đó.

---

## Khoảng trống cần theo dõi (ưu tiên cao → thấp)

- [x] **1. [Ưu tiên cao, effort thấp] Tra cứu mức phạt giao thông — chưa có trên app**
  - Web: trang công khai `/tra-cuu-muc-phat` (`Garage\TrafficFineController`), dữ liệu tĩnh biên soạn từ Nghị định 168/2024/NĐ-CP, lọc theo loại xe (ô tô/xe máy) + nhóm vi phạm + từ khoá.
  - Backend API **đã có sẵn cho mobile**: `GET /api/v1/traffic-fines` (`Api\V1\TrafficFineController`, throttle 30/1, không cần Premium).
  - App: không có màn hình nào gọi endpoint này (chuỗi "phạt nguội" trong app chỉ là 1 category chi phí ở Service Log, không liên quan).
  - **Đã làm (2026-08-12):** `src/api/trafficFines.ts` (client) + `src/screens/services/TrafficFinesScreen.tsx` (list + filter loại xe/nhóm + tìm kiếm client-side, pattern giống `DtcLookupScreen.tsx`), đăng ký route `TrafficFines` trong `AppNavigator.tsx`, entry point mới trong `ServicesScreen.tsx` (cạnh gara/đăng kiểm gần đây), i18n `traffic_fines.*`.

- [x] **2. [Ưu tiên trung bình, effort thấp] Dữ liệu gợi ý theo ngữ cảnh (SuggestionEngine) đã có trong response `/dashboard` nhưng app không hiển thị**
  - Web: dashboard hiển thị bong bóng "Nori hôm nay" với các gợi ý critical/urgent/warn từ `SuggestionEngine::forVehicle()` (`garage/_nori_today.blade.php`), có thể dismiss/resolve từng gợi ý.
  - Backend: `Api\V1\DashboardController::index()` **đã trả field `suggestions`** trong response cho mobile (dòng ~75-76), tức dữ liệu đã sẵn có qua API app đang gọi.
  - App: `src/api/dashboard.ts` và `src/screens/home/HomeScreen.tsx` không có bất kỳ tham chiếu nào tới `suggestions` — field bị bỏ qua hoàn toàn.
  - **Đã làm (2026-08-12):** `HomeScreen.tsx` đọc `dash.suggestions`, hiển thị khối "Gợi ý hôm nay" (icon/màu theo severity, chạm vào điều hướng tới Management tab tương ứng khi `covers` khớp legal/maint/consumption/odo). Không dùng `cta.url` từ backend (là link trang web, không dùng được trong app). i18n `home.suggestions_title`.

- [x] **3. [Ưu tiên trung bình, effort thấp] "Nhìn lại năm" (Year Review) chưa có nút chia sẻ**
  - Web: route đặt tên rõ là "Nhìn lại năm - **thẻ tổng kết chia sẻ được**" (`routes/garage.php` dòng 333, `reports/recap.blade.php`).
  - App: `src/screens/reports/YearReviewScreen.tsx` không import/dùng `Share` ở đâu cả — chỉ hiển thị tĩnh, không có cách nào chia sẻ ra ngoài.
  - **Đã làm (2026-08-12):** thêm `handleShare()` dùng `Share.share()` (React Native), dựng text tóm tắt từ các field đã có (km/tiền xăng/bảo dưỡng/trạm quen), nút "Chia sẻ" mới trong `YearReviewScreen.tsx`. Không có public link riêng (khác dossier) — chỉ chia sẻ text, đủ để đóng gap so với web.

- [x] **4. [Ưu tiên thấp, effort thấp] Endpoint "hôm qua xe thế nào" đã có ở backend nhưng chưa được app dùng ở đâu**
  - Web: có hẳn 1 trang riêng `/yesterday` (`DayRecapController`) — tổng kết hoạt động ngày hôm qua/hôm trước kèm điều hướng tiến/lùi theo ngày và các tip không khẩn (info/good) tách ra khỏi bong bóng dashboard.
  - Backend cho mobile: `GET /api/v1/vehicles/{id}/day-summary?at=YYYY-MM-DD` đã có sẵn, comment trong code ghi rõ mục đích là "đóng câu hỏi kiểu 'hôm qua xe tôi thế nào' từ Nori Agent".
  - App: **không tool nào trong `src/agent/tools/*.ts` gọi endpoint này**, và cũng không có màn hình riêng tương đương trang `/yesterday`. Nếu user hỏi Nori "hôm qua xe sao rồi", agent phải chắp vá từ các tool lẻ khác (`vehicle.getTripToday`, `expense.summary`...) thay vì dùng endpoint đã được thiết kế riêng cho việc này.
  - **Đã làm (2026-08-12):** thêm `vehiclesApi.daySummary()`, `NoteDriApi.getDaySummary(vehicleId, day)` và tool `vehicle.getDaySummary` (`day: 'today'|'yesterday'`, enum để LLM không tự bịa ngày) trong `businessTools.ts`. Màn hình riêng kiểu trang `/yesterday` của web **chưa làm** — Nori chat giờ trả lời được câu hỏi này qua tool, coi là đủ cho bước 1.

- [ ] **5. [Ưu tiên thấp, tính năng phụ] "Màu xe phong thủy" — chưa có trên app**
  - Web: trang công khai `/mau-xe-phong-thuy` (`PhongThuyController` + `PhongThuyService`) — nhập năm sinh → suy Mệnh Ngũ Hành → gợi ý màu hợp/kỵ. Chính team tự ghi nhận đây là "tính năng phụ, cho vui" (`docs/oto360-features-plan.md` mục 7), không lưu DB, tính toán tĩnh.
  - App: chưa có.
  - Đề xuất: làm khi rảnh, có thể gắn vào bước nhập màu xe ở `AddVehicleScreen`. Không cấp bách.

- [ ] **6. [Cần xác nhận với team trước khi coi là gap] Ghép nối thiết bị phần cứng Nori (ESP32-S3) — chưa có UI trên app**
  - Web: flow đầy đủ — tạo phiên ghép nối (`/devices/pairing-sessions`), trang "Thiết bị của tôi" xem/đổi xe/gỡ thiết bị đã pair, xem log thiết bị, ghép nối ngay trong trang sửa xe.
  - App: `src/screens/profile/DevicesScreen.tsx` chỉ quản lý **phiên đăng nhập** (login sessions), hoàn toàn khác với thiết bị phần cứng Nori nói trên. Không có UI nào cho việc pair phần cứng này.
  - Ghi chú: theo lộ trình Nori AI companion (xem memory `project_nori_ai_companion_roadmap`), thiết bị phần cứng ESP32-S3/KW905 là Stage 2/3 — có thể chủ đích ban đầu là thiết bị tự pair qua QR/code không cần mở app. **Nên hỏi team xác nhận** trước khi coi đây là việc cần làm, vì có thể web đã đủ dùng làm kênh quản lý duy nhất.

---

## Đã kiểm tra kỹ — KHÔNG phải gap (nhìn tưởng thiếu nhưng thực ra đã có ở app)

| Tính năng | Bằng chứng đã có trong app |
|---|---|
| So sánh mức tiêu hao với cộng đồng (community benchmark) | `ReportsScreen.tsx` dòng ~777, gọi field `benchmark` từ API, hiển thị đủ 3 ô so sánh |
| Dự báo lịch bảo dưỡng sắp tới (maintenance forecast) | Có trong `ReportsScreen.tsx` (cùng nhóm dữ liệu report) |
| Sổ tay điện tử (dossier) + link chia sẻ công khai cho việc sang tên | `DossierScreen.tsx` — gọi `POST /vehicles/{id}/share-token`, có `Share.share()` |
| Dùng thử Premium 30 ngày | `PremiumScreen.tsx` — có `on_trial`, `trial_days`, nút `requestTrial()` |
| Tìm gara/cây xăng/trạm sạc/trung tâm đăng kiểm gần đây | `NearbyGaragesScreen.tsx`, `NearbyStationsScreen.tsx`, `src/api/nearby.ts` — đủ cả 4 loại, UI tốt hơn bản web |
| Chuyển nhượng xe (sang tên VIN) | `VehicleTransferRequestsScreen.tsx` + `src/api/vehicleTransfer.ts` |
| Nori AI chat agent | `NoriChatScreen.tsx` + toàn bộ `src/agent/**`, đã nối `/api/v1/ai/nori/chat` |

---

## Tính năng App có mà web không có (chiều ngược lại — để đủ bức tranh, không phải action item)

Đây là các tính năng **chỉ khả thi trên phần cứng di động**, đúng định hướng sản phẩm (app là "phần mở rộng phần cứng" của web), không phải việc web thiếu:

- Kết nối OBD2 qua Bluetooth (BLE ELM327/Vgate), dashboard PID sống, NFC tap-to-connect
- GPS trip tự động bắt đầu/dừng + tính driving score
- OCR đọc số công-tơ-mét/hóa đơn xăng, nhập liệu bằng giọng nói
- Widget thời tiết trên Home
- Push notification, quản lý phiên đăng nhập nhiều thiết bị

## Chủ đích không làm trên app (không phải gap)

- **Admin panel** — công cụ nội bộ, đúng là chỉ cần trên web.
- **Blog, sitemap, trang chủ marketing** — nội dung SEO/marketing, không cần trong app.
- **Trang giá xăng dầu công khai không cần đăng nhập** (`/gia-xang-dau-hom-nay`) — app đã có `FuelPricesScreen` tương đương (yêu cầu đăng nhập là hợp lý vì app vốn đã gate sau auth).

---

## Đề xuất thứ tự xử lý (nếu quyết định làm)

1. ~~Hiển thị `suggestions` có sẵn trong response `/dashboard` lên `HomeScreen` (mục 2)~~ — **xong 2026-08-12**.
2. ~~Nối tool `vehicle.getDaySummary` vào Nori Agent (mục 4)~~ — **xong 2026-08-12**.
3. ~~Thêm màn hình Tra cứu mức phạt giao thông (mục 1)~~ — **xong 2026-08-12**.
4. ~~Thêm nút Share cho Year Review (mục 3)~~ — **xong 2026-08-12**.
5. Xác nhận với team về ghép nối thiết bị Nori ESP32 (mục 6) trước khi lên kế hoạch.
6. Màu xe phong thủy (mục 5) — làm xen kẽ khi rảnh.

**Còn lại chưa làm:** trang riêng kiểu "Hôm qua" (`/yesterday` bên web) — mục 4 mới chỉ nối được qua Nori chat (tool), chưa có màn hình dashboard riêng; coi là đủ cho bước 1, làm màn hình sau nếu cần.

---

## Ghi chú về docs cũ

Trong lúc khảo sát, phát hiện các tài liệu sau đã lỗi thời so với code thực tế của repo `notedri` (web):

- `notedri/docs/project-overview.md` không liệt kê: tra cứu phạt nguội, phong thủy, trang "Hôm qua" (day recap), ghép nối thiết bị Nori phần cứng, `WeatherApiController`.
- `notedri/docs/oto360-features-plan.md` (2026-08-03) đề xuất tra cứu phạt nguội + phong thủy là "chưa làm" — nhưng code hiện tại **đã triển khai cả hai** ở web (`TrafficFineController`, `PhongThuyController`), chỉ là chưa đồng bộ sang app.

Nên cân nhắc chạy lại skill cập nhật docs cho repo `notedri` (không phải phạm vi file này) để tránh lệch tiếp trong tương lai.
