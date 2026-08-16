# NoteDri vs KONNWEI KW905/MAXOBD & MAXOBD Pro 2026 — So sánh tính năng (xe xăng/dầu)

Đối chiếu tính năng OBD2 của NoteDri với 2 sản phẩm KONNWEI (KW905 chạy app
MAXOBD, và MAXOBD Pro 2026 — bản "full-system" cao cấp hơn), để trả lời: còn
thiếu gì, và MAXOBD Pro có nên là hướng đi tiếp theo không. **Phạm vi: xe
xăng/dầu (ICE) — xe điện đã bàn riêng ở [obd-supported-devices.md](obd-supported-devices.md).**

## Giới hạn của báo cáo

Không xem/nghe được nội dung 2 video MP4 người dùng cung cấp cục bộ (không có
công cụ xử lý audio/video). Dữ liệu dùng để viết báo cáo này:

1. Danh sách 11 tính năng người dùng gõ lại từ mô tả video KW905 trên YouTube.
2. Ảnh chụp màn hình app MAXOBD (đã phân tích trong hội thoại trước đó) — xe
   Mercedes-Benz SUV, hiện menu: Diagnostic trouble codes, Obd Data Stream, I/M
   Readiness, Evap System (mode $08), Battery Detection, Freeze Frame, Deep
   Security Scan, Vehicle-Specific Data Stream, OBD Diagnostic Report, O2
   Sensor Test, On-Board Monitoring, Dashboard. Có nút "ECU ($58)" — gợi ý mở
   khoá trả phí theo xe/ECU. Caption: "Can detect 40+ car models".
3. Nghiên cứu web (Amazon, Alibaba, konnwei.com, manuals.plus) về KW906/MAXOBD/
   MAXOBD Pro — xem chi tiết nguồn ở cuối file.

## Phần 1 — 11 tính năng KW905 (theo mô tả video) vs NoteDri

| # | Tính năng (từ mô tả video) | Mode/PID OBD-II | NoteDri | Trạng thái |
|---|---|---|---|---|
| 1 | Check your car engine faults | Mode 03 | `parseDtcCodes` (`obdParser.ts`) | ✅ Đã có |
| 2 | Read live data stream | Mode 01 | `obdLiveMonitor.ts`, `readSnapshot()` | ✅ Đã có |
| 3 | Battery detection | `ATRV` (đọc trực tiếp, không qua ECU) | `readBatteryVoltageDirect()` (`ObdReader.ts`) | ✅ Vừa thêm (16/8) |
| 4 | Read freeze frame data | Mode 02 | `readFreezeFrame()` | ✅ Đã có |
| 5 | O2 sensor test | Mode 05 | — | ❌ Chưa có (quyết định hoãn — xem Phần 3) |
| 6 | Dashboard | UI | `OBDDashboardScreen.tsx` (nhiều layout, có Analog) | ✅ Đã có |
| 7 | DTC lookup | Tra cứu mô tả mã lỗi | `dtcOfflineDictionary.ts` | ✅ Đã có |
| 8 | Read VIN | Mode 09 | `readCurrentVin()` (`capabilityService.ts`) | ✅ Đã có |
| 9 | I/M readiness | Mode 01 PID 01 | `readReadinessStatus()` | ✅ Đã có |
| 10 | EVAP system test | Mode 08 (bidirectional control) | — | ❌ Chưa có (quyết định hoãn — xem Phần 3) |
| 11 | On-board monitoring | = #2, đặt tên khác | `obdLiveMonitor.ts` | ✅ Đã có |

**Kết quả: 9/11 đã có (bao gồm Battery Detection vừa bổ sung hôm nay). 2 mục
còn thiếu là quyết định có chủ đích, không phải khoảng trống bỏ sót** — xem lý
do ở Phần 3.

## Phần 2 — MAXOBD Pro 2026: có gì khác KW906/MAXOBD thường?

Từ ảnh chụp màn hình + nghiên cứu web, MAXOBD Pro mở rộng theo 3 hướng mà
KW906/MAXOBD thường không có:

### 2.1 Full-system — quét nhiều ECU, không chỉ Engine

Menu quảng cáo: Engine, Airbag/SRS, Transmission, ABS, SAS, Điều hoà, Center
Lock, Audio, Đèn, ESP, Treo. NoteDri hiện **chỉ đọc 1 ECU (Engine)** qua PID
mode 01 chuẩn (broadcast, không cần địa chỉ ECU cụ thể).

**Rào cản kỹ thuật thật sự** (không phải chỉ thêm PID):

- Mode 01 là PID **chuẩn, broadcast** — mọi xe OBD-II compliant trả lời giống
  nhau. Nhưng ABS/SRS/Transmission/AC... là **module riêng, địa chỉ ECU khác
  nhau theo từng hãng xe** — cần gửi `ATSH<header>` để chọn đúng ECU đích trước
  khi hỏi, và mỗi hãng dùng 1 tập địa chỉ + định dạng DTC khác nhau (không có
  chuẩn công khai thống nhất như mode 01).
- Đây chính là lý do MAXOBD thu phí riêng qua nút "ECU ($58)" trong ảnh chụp
  màn hình — dữ liệu ánh xạ hãng+đời xe → địa chỉ ECU là tài sản họ phải mua/
  tự dò, không có sẵn miễn phí.

### 2.2 Vehicle-Specific Data Stream (PID mở rộng riêng hãng)

Đọc thêm thông số ngoài chuẩn OBD-II (mode 21/22 UDS) — cùng rào cản dữ liệu
như 2.1, và cùng nằm sau paywall "$58" của MAXOBD.

**Cập nhật 2026-08-16 — tra thêm trang App Store/Google Play chính thức của app
MAXOBD** (không chỉ dựa vào ảnh chụp màn hình): mô tả app liệt kê rõ các hãng xe
được hỗ trợ chẩn đoán sâu (mở rộng ngoài mode 01 chuẩn) là **Subaru,
Mercedes-Benz, GM, Suzuki, Hyundai, KIA, Mazda, Mitsubishi** — xác nhận đúng
hướng "vehicle-specific per hãng" đã phân tích ở trên, và **không có VinFast**
trong danh sách này (khớp với phần đã bàn về VF6 ở
[obd-supported-devices.md](obd-supported-devices.md)). Mô tả app cũng không đề
cập gì tới hỗ trợ xe điện/hybrid ở bất kỳ đâu trong 4 nguồn đã tra (App Store,
2 trang mirror Google Play) — cùng kết luận với phần nghiên cứu KONNWEI trước
đó, không phải trùng hợp.

### 2.3 Deep Security Scan

Tên chưa rõ nghĩa kỹ thuật cụ thể (không có mô tả chi tiết trong nguồn tìm
được) — khả năng cao là quét thêm module bảo mật/immobilizer, cùng nhóm rào
cản "cần địa chỉ ECU riêng hãng" như 2.1.

### 2.4 "Can detect 40+ car models" (Auto-VIN)

Đọc VIN rồi tra bảng hãng/đời xe để hiển thị đúng tên xe + nạp đúng bộ PID mở
rộng tương ứng. NoteDri đã đọc VIN (mode 09) — phần thiếu là **bảng tra
VIN → hãng/đời xe → bộ PID mở rộng**, không phải thiếu khả năng đọc VIN.

## Phần 3 — MAXOBD Pro có nên là bước đi tiếp theo?

### Kết luận ngắn: **Có, về hướng sản phẩm — nhưng KHÔNG nên làm full cùng lúc**

**Vì sao đáng làm**: full-system (đặc biệt ABS/SRS) là hướng mở rộng giá trị
thật — người dùng phổ thông quan tâm đèn túi khí/ABS sáng không kém đèn Check
Engine, và đây là điểm khác biệt rõ với các app OBD2 miễn phí chỉ đọc Engine.

**Vì sao không nên làm full ngay**:

1. **Chi phí dữ liệu, không phải chi phí code.** Rào cản không nằm ở viết
   thêm hàm `readXxx()` như các PID mode 01 mở rộng đã làm — mà ở việc **có
   được bảng địa chỉ ECU + định dạng DTC riêng từng hãng xe**, thứ MAXOBD phải
   thu phí mới có. Không có nguồn dữ liệu này thì code viết ra cũng không chạy
   được trên xe thật.
2. **"40+ car models" là phạm vi lớn** — không nên nhắm toàn bộ ngay. Nên chọn
   trước 3-5 hãng phổ biến ở VN (Toyota, Honda, Kia/Hyundai, Mazda, Ford) thay
   vì cố phủ rộng như MAXOBD.
3. **Ưu tiên ABS/SRS trước Transmission/AC/Audio/Đèn/Treo** — nhóm đầu liên
   quan an toàn, nhóm sau giá trị thấp hơn nhiều so với công sức bỏ ra.

### Về 2 tính năng còn thiếu trong Phần 1 (mode 05, mode 08)

Không xếp chung với "full-system" ở trên vì đây vẫn là **mode chuẩn OBD-II**
(không cần địa chỉ ECU riêng hãng như ABS/SRS) — lý do hoãn khác nhau, đã
quyết định trong hội thoại trước:

- **O2 Sensor Test (mode 05)**: khả thi kỹ thuật (chỉ đọc, không rủi ro), nhưng
  dữ liệu mang tính kỹ thuật viên (test ID + min/max/value theo chuẩn SAE),
  giá trị với người dùng cuối thấp hơn so với các mục đã làm. Có thể làm sau
  nếu có yêu cầu cụ thể.
- **EVAP System Test (mode 08)**: khác hẳn mọi mode khác — đây là **bidirectional
  control**, tức là **chủ động ra lệnh cho ECU thực hiện hành động thật trên
  xe** (ép chạy leak test), không chỉ đọc. Rủi ro an toàn/pháp lý nếu làm sai
  quy trình theo từng xe — cần thiết kế riêng (xác nhận rõ ràng, cảnh báo, quy
  trình đúng theo từng hãng) trước khi cân nhắc, không phải việc "thêm 1 PID".

### Đề xuất thứ tự nếu quyết định theo đuổi full-system

1. Xác nhận có nguồn dữ liệu địa chỉ ECU (mua, tự dò trên xe thật, hoặc tài
   liệu mở) cho 3-5 hãng ưu tiên — làm trước khi viết code, vì đây là rủi ro
   lớn nhất của cả hướng đi này.
2. Bắt đầu bằng đọc DTC (mode 03 tương đương qua UDS) của ABS/SRS — cùng dạng
   "chỉ đọc" như đã quen, rủi ro thấp nhất trong nhóm full-system.
3. Chỉ tính tới live data stream / actuation cho từng module sau khi bước 2 ổn
   định trên xe thật của 3-5 hãng đã chọn.

## Nguồn tham khảo

- Ảnh chụp màn hình app MAXOBD do người dùng cung cấp (phân tích trong hội thoại, 2026-08-16)
- [Amazon — KONNWEI KW906](https://www.amazon.com/KONNWEI-KW906-Scanner-Bluetooth-Diagnostic/dp/B0GXDQ6FYL) — "not suitable for heavy truck/diesel vehicle/electric vehicle/hybrid vehicle applications"
- [Alibaba — KONNWEI MAXOBD Pro](https://www.alibaba.com/product-detail/KONNWEI-MAXOBD-Pro-Car-OBD2-Diagnostic_1601585662185.html) — full-system: Engine, Airbag, Transmission, ABS, SAS, AC, Center Lock, Audio, Headlights, ESP, Suspension
- [KONNWEI MAXOBD Full-System User Manual](https://manuals.plus/ae/1005009582277803)
- [konnwei.com — sản phẩm KW350](https://www.konnwei.com/product/425.html) — ví dụ dòng full-system riêng cho VAG (VW/Audi/Skoda/Seat), 101 hệ thống ECU, UDS/TP-CAN
