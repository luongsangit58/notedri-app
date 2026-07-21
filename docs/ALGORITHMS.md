# Thuật toán đang triển khai — NoteDri App (Mobile)

Liệt kê **mọi** thuật toán/công thức thực sự tồn tại trong code tại thời điểm rà soát — không suy diễn, không làm tròn số cho đẹp. Mỗi mục có: mục đích, công thức/logic nguyên văn, vị trí `file:dòng` để tự đối chiếu, và lưu ý nếu tác giả code tự đánh dấu là beta/chưa hiệu chỉnh/có giới hạn biết trước.

Không đưa vào: CRUD thuần, gọi API, UI/style, các phép so sánh ngưỡng đơn giản không có công thức đứng sau (vd tiến trình progress-bar tuyến tính, các khoá dedup "đã tồn tại thì bỏ qua").

Tài liệu song hành: [`notedri/docs/ALGORITHMS.md`](../../notedri/docs/ALGORITHMS.md) (backend web). Xem **[Luồng dữ liệu liên-repo](#luồng-dữ-liệu-liên-repo)** ở cuối file — phần dễ nhầm nhất là "ai tính, ai chỉ đọc lại".

_Rà soát: 2026-07-21._

---

## Mục lục

- [A. OBD2 — giải mã & đọc dữ liệu thời gian thực](#a-obd2--giải-mã--đọc-dữ-liệu-thời-gian-thực)
- [B. OBD2 — độ tin cậy kết nối & lịch polling](#b-obd2--độ-tin-cậy-kết-nối--lịch-polling)
- [C. OBD2 — trạng thái phiên & chẩn đoán](#c-obd2--trạng-thái-phiên--chẩn-đoán)
- [D. Hiển thị đồng hồ live (gauge)](#d-hiển-thị-đồng-hồ-live-gauge)
- [E. Điểm lái xe (Driving Score)](#e-điểm-lái-xe-driving-score)
- [F. GPS & Chuyến đi](#f-gps--chuyến-đi)
- [G. VIN](#g-vin)
- [H. OCR (đọc ảnh)](#h-ocr-đọc-ảnh)
- [I. Trend / tổng hợp phiên](#i-trend--tổng-hợp-phiên)
- [Luồng dữ liệu liên-repo](#luồng-dữ-liệu-liên-repo)

---

## A. OBD2 — giải mã & đọc dữ liệu thời gian thực

### A1. Trích payload từ response ELM327 thô
**Mục đích:** tách byte dữ liệu thật ra khỏi output nối tiếp lộn xộn của ELM327 (echo lệnh, `"SEARCHING..."`, nhiều dòng ngăn bởi `\r`).
**Logic:** tìm dòng hex thuần chứa chuỗi `"<mode+0x40><PID>"` (vd mode `01` PID `0C` → tìm `"410C"`), lấy phần hex sau đó làm payload.
**Vị trí:** [`src/services/obd/obdParser.ts:18-43`](../src/services/obd/obdParser.ts#L18-L43) (`extractPayload`)

### A2. Ghép khung ISO-TP nhiều frame
**Mục đích:** ghép lại response bị BLE chia thành nhiều gói (`"0:...\r1:...\r2:..."`) thành 1 chuỗi hex, dùng cho VIN (17 byte) và DTC nhiều mã.
**Logic:** yêu cầu index frame **liên tục từ 0** (`frames[i][0] !== i` → trả `null` toàn bộ) — rớt/trùng 1 frame giữa sẽ huỷ cả kết quả thay vì âm thầm trả chuỗi sai. Byte-header độ dài (nếu có) chỉ dùng để **cắt** đệm dư, không dùng để reject.
**Vị trí:** [`src/services/obd/obdParser.ts:69-105`](../src/services/obd/obdParser.ts#L69-L105) (`assembleIsoTpFrames`)
**Lưu ý:** giới hạn cố ý — index là 1 ký tự hex nên >15 frame sẽ lặp số; chấp nhận vì VIN/DTC luôn ngắn hơn.

### A3. Giải mã VIN từ response mode 09/02
**Logic:** bỏ `"4902"` + 1 byte số-bản-ghi, phần còn lại là ASCII (byte `0x00` = padding, bỏ qua), validate `/^[A-HJ-NPR-Z0-9]{17}$/`.
**Vị trí:** [`src/services/obd/obdParser.ts:124-143`](../src/services/obd/obdParser.ts#L124-L143) (`parseVin`)

### A4. Giải mã mã lỗi DTC (mode 03/07/0A)
**Logic:** mỗi mã = 2 byte liên tiếp, không có byte đếm ở giữa:
```
typeChar = ['P','C','B','U'][(byte1 >> 6) & 0x03]
digit1   = (byte1 >> 4) & 0x03
digit2   =  byte1 & 0x0f
digit3   = (byte2 >> 4) & 0x0f
digit4   =  byte2 & 0x0f
→ mã = `${typeChar}${digit1}${hex(digit2)}${hex(digit3)}${hex(digit4)}`
```
**Vị trí:** [`src/services/obd/obdParser.ts:154-185`](../src/services/obd/obdParser.ts#L154-L185) (`parseDtcCodes`)
**Lưu ý:** cấu trúc payload theo chuẩn SAE J1979, đã xác nhận với xe thật cho mode `03`. Mode `07`/`0A` dùng chung cấu trúc theo lý thuyết chuẩn nhưng **chưa có mẫu thật để kiểm lại**.

### A5. Giải mã bitmap "PID hỗ trợ"
**Logic:** 4 byte MSB-first, bit thứ `i` (0..31) bật → PID `basePid + i + 1` được hỗ trợ:
```
byte = bytes[floor(i/8)];  bit = 7 - (i%8);  bật nếu (byte >> bit) & 1
```
**Vị trí:** [`src/services/obd/obdParser.ts:191-205`](../src/services/obd/obdParser.ts#L191-L205) (`parseSupportedPids`)

### A6. Ngưỡng hợp lý vật lý (chặn byte rác)
**Mục đích:** loại giá trị giải mã ra ngoài dải vật lý khả dĩ (byte rác do rớt/lệch gói BLE) thay vì hiển thị số sai.

| PID | Tín hiệu | Dải hợp lệ |
|---|---|---|
| `04` | Engine load % | 0 – 100 |
| `05` | Coolant °C | -40 – 150 |
| `06` | Fuel trim % | -100 – 100 |
| `0B` | Intake MAP kPa | 0 – 255 *(no-op, xem lưu ý)* |
| `0C` | RPM | 0 – 8000 |
| `0D` | Speed km/h | 0 – 255 *(no-op, xem lưu ý)* |
| `0F` | Intake air °C | -40 – 150 |
| `11` | Throttle % | 0 – 100 |
| `2F` | Fuel level % | 0 – 100 |
| `42` | Voltage V | 0 – 30 |
| `46` | Ambient air °C | -40 – 100 |
| `5C` | Oil temp °C | -40 – 150 |
| `5E` | Fuel rate L/h | 0 – 3276.75 |

**Vị trí:** [`src/services/obd/obdParser.ts:212-244`](../src/services/obd/obdParser.ts#L212-L244) (`PID_PLAUSIBLE_RANGE`, `isPlausibleValue`)
**Lưu ý:** PID `0B`/`0D` dùng đúng dải byte thô 0-255 vì đây là PID 1-byte không hệ số — check này **được xác nhận là no-op** cho riêng 2 PID này (không bắt được byte rác), giữ lại vì có tác dụng khi kết hợp check khác. PID chưa khai báo trong bảng mặc định coi là hợp lệ (không chặn oan PID mới).

### A7. Công thức chuyển đổi PID → đơn vị vật lý (SAE J1979)

| PID | Tín hiệu | Công thức |
|---|---|---|
| `04` | Engine load % | `round(x[0]*100/255)` |
| `05` | Coolant °C | `x[0] - 40` |
| `06` | Fuel trim % | `round((x[0]-128)*100/128 * 10)/10` |
| `0C` | RPM | `(x[0]*256 + x[1]) / 4` |
| `0D` | Speed km/h | `x[0]` |
| `11` | Throttle % | `round(x[0]*100/255)` |
| `2F` | Fuel level % | `round(x[0]*100/255)` |
| `42` | Voltage V | `round((x[0]*256+x[1])/1000 * 100)/100` |
| `5E` | Fuel rate L/h | `round((x[0]*256+x[1])/20 * 10)/10` |

**Vị trí:** [`src/services/obd/obdParser.ts:258-272`](../src/services/obd/obdParser.ts#L258-L272) (`PID_REGISTRY`)
**Lưu ý — trùng lặp đã biết:** cùng công thức được lặp lại thủ công trong [`src/services/obd/ObdReader.ts:112-201`](../src/services/obd/ObdReader.ts#L112-L201) (`readRpm`, `readVoltage`, …) — 2 nơi độc lập, không phải 1 nơi gọi nơi kia. Không phải lỗi (2 file phục vụ 2 lớp gọi khác nhau) nhưng là điểm cần sửa cả 2 nơi nếu công thức PID nào đổi.

---

## B. OBD2 — độ tin cậy kết nối & lịch polling

### B1. Lịch polling đa tầng (fast/medium/slow)
**Mục đích:** đọc RPM/tốc độ (cần mượt) thường xuyên hơn nhiên liệu/nhiệt độ dầu (đổi chậm), không chồng lệnh BLE.
**Logic:** `DEFAULT_TIER_INTERVAL_MS = { fast: 500, medium: 3000, slow: 45000 }`, tick nội bộ `250ms`; bỏ nhịp nếu task tầng đó đang `inFlight`; khi link quality `'poor'`, **toàn bộ tầng fast bị tạm dừng**, tầng medium/slow vẫn chạy.
**Vị trí:** [`src/services/obd/obdPollingScheduler.ts:27-81`](../src/services/obd/obdPollingScheduler.ts#L27-L81)

### B2. Phân loại chất lượng liên kết BLE
**Logic:** cửa sổ trượt 60s, tối đa 100 mẫu gần nhất:
```
failRate = số_lệnh_lỗi / tổng_lệnh (trong 60s gần nhất)
failRate > 0.4  → 'poor'
failRate > 0.15 → 'fair'
else            → 'good'   (< 4 mẫu → 'unknown')
```
**Vị trí:** [`src/services/obd/BleService.ts:136-154`](../src/services/obd/BleService.ts#L136-L154) (`recordLinkResult`, `getLinkQuality`)
**Dùng để:** cấp dữ liệu cho B1 quyết định tạm dừng tầng fast.

### B3. Kết nối với MTU fallback
**Logic:** thử connect với `requestMTU: 512` (tránh phân mảnh response OBD) trong 12s (connect chủ động) / 8s (mỗi lần reconnect); thất bại → hủy, thử lại 1 lần **không** yêu cầu MTU (mặc định 23 byte, chạy được trên mọi chip).
**Vị trí:** [`src/services/obd/BleService.ts:796`](../src/services/obd/BleService.ts#L796) (`connectWithMtuFallback`)
**Lưu ý:** đây là giảm nhẹ, không phải fix triệt để — chip BLE lỗi thật vẫn có thể không kết nối được ở MTU nào.

### B4. Backoff kết nối lại khi rớt BLE ngoài ý muốn
**Logic:** 3 lần thử với độ trễ cố định tăng dần `[1000ms, 3000ms, 6000ms]`, dừng ngay nếu user chủ động bấm "Ngắt kết nối" trong lúc chờ.
**Vị trí:** [`src/services/obd/BleService.ts:33,312-340`](../src/services/obd/BleService.ts#L33) (`RECONNECT_DELAYS_MS`, `attemptReconnect`)

### B5. Cache khả năng PID theo VIN (TTL 30 ngày)
**Mục đích:** tránh dò lại toàn bộ PID hỗ trợ mỗi lần kết nối — dò 1 lần, cache theo VIN xe.
**Logic:** duyệt từng trang bitmap PID (`0x00, 0x20, 0x40, ... ≤ 0xA0`), dừng khi trang không báo "còn trang tiếp"; **phân biệt** dừng sạch (hết PID) với lỗi BLE giữa trang (`incomplete`) để không cache nhầm 1 trang lỗi thành "toàn bộ PID xe hỗ trợ". TTL `30 * 24 * 60 * 60 * 1000` ms.
**Vị trí:** [`src/services/obd/capabilityService.ts`](../src/services/obd/capabilityService.ts)

---

## C. OBD2 — trạng thái phiên & chẩn đoán

### C1. Máy trạng thái phiên xe (Session State Machine)
**Logic:** `DISCONNECTED → CONNECTING → CONNECTED → ELM_READY → {ENGINE_OFF ↔ ENGINE_IDLE ↔ DRIVING} → STOPPED → DISCONNECTED`, có bảng `VALID_TRANSITIONS`; chuyển trạng thái không hợp lệ bị **âm thầm bỏ qua** (chỉ log debug), không throw. Lịch sử giữ tối đa 200 mục.
**Vị trí:** [`src/services/obd/obdSessionStateMachine.ts`](../src/services/obd/obdSessionStateMachine.ts)

### C2. Suy luận pha vận hành mỗi vòng poll
**Logic:**
```
rpm > 0 và speed > 0  → 'driving'
rpm > 0 và speed ≤ 0  → 'idle'
rpm ≤ 0 (hoặc null)   → 'engine_off'
```
**Vị trí:** [`src/services/obd/obdLiveMonitor.ts:349-359`](../src/services/obd/obdLiveMonitor.ts#L349-L359)

### C3. Phát hiện "khoảng trống nền" (JS timer bị OS đóng băng)
**Logic:** so mốc `Date.now()` thực giữa 2 lần poll (không dựa vào `setInterval`, vì chính nó bị đóng băng); gap > `15000ms` (`BACKGROUND_GAP_THRESHOLD_MS`) → tính là 1 lần gap nền, cộng dồn số lần + tổng giây.
**Vị trí:** [`src/services/obd/obdLiveMonitor.ts`](../src/services/obd/obdLiveMonitor.ts) (constants ~L47-65, logic ~L284-295)
**Lưu ý:** ngưỡng 15s suy ra thực nghiệm từ các gap quan sát được (144s/1700s/980s khi Android đóng băng app nền).

### C4. Phát hiện "xe không phản hồi" (ECU ngủ, BLE còn sống)
**Logic:** 6 PID lõi (rpm/speed/load/coolant/throttle/voltage) đều `null` liên tiếp `≥ 3` lần poll (`VEHICLE_UNRESPONSIVE_THRESHOLD`) → báo. **Cố ý loại** `fuelLevelPct`/`oilTempC` khỏi điều kiện "tất cả null" vì nhiều xe không hỗ trợ 2 PID này nên chúng null vĩnh viễn dù xe bình thường.
**Vị trí:** [`src/services/obd/obdLiveMonitor.ts:320-340`](../src/services/obd/obdLiveMonitor.ts#L320-L340)

### C5. Rule Engine chẩn đoán (ngưỡng từ tài liệu công khai)
**Mục đích:** so tín hiệu OBD sống với ngưỡng kỹ thuật để cảnh báo sớm (sạc điện yếu/cao, quá nhiệt, van hằng nhiệt kẹt, idle nóng máy).
**Logic:** mỗi rule chỉ kích khi đủ `min_session_seconds` VÀ tất cả `conditions` (so sánh `gt/gte/lt/lte`) đều đúng.

| Rule | Điều kiện | min_session_s | Mức |
|---|---|---|---|
| `charging-voltage-low` | rpm≥400 & 12.4≤V<13.2 | 120 | warn |
| `charging-voltage-critical-low` | rpm≥400 & V<12.4 | 60 | critical |
| `charging-voltage-high` | rpm≥600 & V>15 | 60 | critical |
| `engine-overheat` | coolant≥105°C | 0 | critical |
| `thermostat-stuck-open-suspect` | rpm≥600 & coolant<70°C | 600 | warn |
| `high-idle-warm` | speed≤0 & coolant≥80°C & rpm>1200 & throttle≤20% | 180 | warn |

**Vị trí:** [`src/services/obd/diagnosticEngine.ts`](../src/services/obd/diagnosticEngine.ts) (evaluator) + [`src/data/diagnosticRules.json`](../src/data/diagnosticRules.json) (dữ liệu ngưỡng, mỗi rule có field `source` trích dẫn tài liệu công khai — SAE J537, Battery Council International, AA1Car, Bosch...)
**Lưu ý:** mọi rule đều có cờ `"beta": true` — ngưỡng lấy từ tài liệu công khai, **chưa hiệu chỉnh bằng dữ liệu chạy thật quy mô lớn** (tự nhận trong docblock: "Xe Sang = bài test tích hợp, không phải nguồn tri thức").

### C6. Tổng hợp sức khoẻ hệ thống (System Health rollup)
**Mục đích:** gộp finding của C5 thành trạng thái 4 mức cho từng hệ (engine/cooling/electrical/fuel) — **cố ý không** ra điểm số 0-100 vì chưa có dữ liệu hiệu chuẩn.
**Logic:** `SEVERITY_RANK = {critical:3, warn:2, ok:1, na:0}`; hệ có finding critical → `critical`; có warn → `warn`; có dữ liệu mà không finding → `ok`; không dữ liệu → `na`. Trạng thái tổng = rank cao nhất trong các hệ.
**Vị trí:** [`src/services/obd/systemHealth.ts:88-126`](../src/services/obd/systemHealth.ts#L88-L126)
**Lưu ý (tự nhận trong code):** "KHÔNG phải engine chấm điểm 0-100/hệ... đặt điểm bừa là tự bịa độ chính xác."

---

## D. Hiển thị đồng hồ live (gauge)

### D1. Làm mượt EWMA cho gauge
**Mục đích:** giảm giật kim đồng hồ do nhiễu lượng tử hoá BLE, **tách biệt hoàn toàn** khỏi giá trị RAW nuôi Rule Engine (C5) — làm mượt sẽ trễ pha, có thể bỏ sót đỉnh ngắn thật (vd quá nhiệt thoáng qua).
**Công thức:**
```
smoothed = α × giá_trị_mới + (1-α) × smoothed_trước     (α = 0.3)
```
Giữ nguyên giá trị cũ nếu lần đọc mới bị `null` (không kéo kim về 0 vì 1 lần đọc lỗi).
**Vị trí:** [`src/utils/ewma.ts`](../src/utils/ewma.ts) (`ewmaStep`), gọi mỗi vòng poll tại [`src/services/obd/obdLiveMonitor.ts:302-307`](../src/services/obd/obdLiveMonitor.ts#L302-L307) cho RPM/speed/load/coolant/throttle/voltage.

### D2. Ánh xạ giá trị → góc kim + animation
**Logic:** cung quét 270°, từ `-135°` đến `+135°`:
```
pct   = clamp(value, min, max) mapped to [0,1]
angle = -135 + pct × 270
```
Mỗi lần góc mục tiêu đổi, animate 300ms bằng `Animated.timing` easing `ease-out` (lớp làm mượt thứ 2, ở tầng render, độc lập với EWMA ở tầng dữ liệu).
**Vị trí:** [`src/components/obd/Dial.tsx`](../src/components/obd/Dial.tsx) (`valueToAngle`)

---

## E. Điểm lái xe (Driving Score)

### E1. Phát hiện phanh gấp / tăng tốc đột ngột
**Logic:** với 2 mẫu tốc độ liên tiếp `{ts, speedKmh}`:
```
ms2 = ((v2 - v1) / 3.6) / ((t2 - t1) / 1000)      // gia tốc, m/s²
ms2 ≤ -3.4  → harsh_brake     (HARSH_BRAKE_MS2,  ~0.35g)
ms2 ≥  2.94 → harsh_accel     (HARSH_ACCEL_MS2,  ~0.3g)
```
Bỏ qua cặp mẫu cách nhau > 10s (`MAX_GAP_SECONDS`) — coi là mất sóng/app đóng băng, không phải sự kiện lái thật.
**Vị trí:** [`src/services/drivingScore/drivingScoreEngine.ts:29-61`](../src/services/drivingScore/drivingScoreEngine.ts#L29-L61) (`detectDrivingEvents`)
**Nguồn dữ liệu:** tái dùng tốc độ ECU (PID `0D`, đã đọc mỗi 3s cho live-monitor) hoặc GPS `route_points` — không tốn thêm pin, không thêm tần suất lấy mẫu mới.

### E2. Công thức điểm 0-100
**Logic:**
```
eventsPer10Units = (harshBrakeCount + harshAccelCount) / quãng_di_chuyển × 10
score = clamp(round(100 - eventsPer10Units × 10), 0, 100)
```
`quãng_di_chuyển` = km (nguồn GPS) hoặc phút (nguồn OBD, không có quãng đường).
**Vị trí:** [`src/services/drivingScore/drivingScoreEngine.ts:88-105`](../src/services/drivingScore/drivingScoreEngine.ts#L88-L105) (`scoreFromCounts`)
**Lưu ý — tự nhận trong code:** ngưỡng 3.4/2.94 m/s² và hệ số "-10 điểm/sự-kiện-trên-10-đơn-vị" là **ước tính ban đầu, chưa hiệu chỉnh bằng dữ liệu thật**. Ngưỡng phanh/tăng tốc đặt khắt khe hơn dải ngành 0.3-0.5g vì mẫu tốc độ GPS/OBD nhiễu hơn accelerometer thật.

---

## F. GPS & Chuyến đi

### F1. Khoảng cách Haversine
```
R = 6371 km
dLat = (lat2-lat1) × π/180 ;  dLng = (lng2-lng1) × π/180
a = sin²(dLat/2) + cos(lat1×π/180)×cos(lat2×π/180)×sin²(dLng/2)
distanceKm = R × 2 × atan2(√a, √(1-a))
```
**Vị trí:** [`src/services/gps/GpsTripTracker.ts:143-151`](../src/services/gps/GpsTripTracker.ts#L143-L151) (`haversineKm`)

### F2. Máy trạng thái chuyến đi (start/stop có debounce)
**Logic:** `idle/waiting_start → active` sau khi tốc độ ≥ 5km/h (`SPEED_START_KMPH`) duy trì `12s` (`WAITING_START_MS`); `active → waiting_stop → kết thúc` sau khi tốc độ < 3km/h (`SPEED_STOP_KMPH`) duy trì `180s` (`WAITING_STOP_MS`). Tự kết thúc chống-treo sau `6h` (`MAX_TRIP_MS`); tự tắt service sau `20 phút` không hoạt động (`IDLE_SHUTDOWN_MS`).
**Vị trí:** [`src/services/gps/GpsTripTracker.ts:15-31,316-388`](../src/services/gps/GpsTripTracker.ts#L15-L31)

### F3. Lọc nhiễu & ước lượng quãng đường qua vùng mất sóng
**Logic:** ưu tiên tốc độ GPS báo thẳng (`rawSpeed × 3.6`); nếu null, suy tốc độ từ khoảng cách/thời gian **chỉ khi** đoạn đó < 0.5km. Với mỗi đoạn `seg`:
```
seg < 0.008km (8m)                          → bỏ (nhiễu GPS khi đỗ xe)
0.008km ≤ seg < 0.5km                       → cộng bình thường
seg ≥ 0.5km & gap≤600s & seg/gap ≤ 200km/h  → cộng (ước lượng qua hầm/mất sóng)
còn lại (nhảy vô lý)                         → bỏ, coi là glitch
```
**Vị trí:** [`src/services/gps/GpsTripTracker.ts:246-306`](../src/services/gps/GpsTripTracker.ts#L246-L306)
**Lưu ý:** kết quả cuối (avg/max speed) bị chặn `min(300, ...)` km/h trước khi gửi backend — 1 lần đọc GPS lỗi (vd 900km/h) không được làm cả chuyến bị backend từ chối (HTTP 422).

### F4. Downsample điểm route
**Logic:** khi buffer đạt `MAX_ROUTE_POINTS = 500`, giảm còn 1 nửa bằng cách giữ điểm chỉ số chẵn (`i % 2 === 0`).
**Vị trí:** [`src/services/gps/GpsTripTracker.ts:128-136`](../src/services/gps/GpsTripTracker.ts#L128-L136)

### F5. Khôi phục chuyến bị gián đoạn (app bị kill)
**Logic:** phân biệt theo thời gian mất tín hiệu:
- `< 15 phút` (`STALE_ACTIVE_MS`) khi đang "active": coi là còn hiệu lực, chờ tiếp.
- App bị kill, mở lại **trong `10 phút`** (`RESUME_WINDOW_MS`): hỏi user tiếp tục hay dừng.
- Mở lại **sau `10 phút`**: tự lưu và báo, không hỏi.

**Vị trí:** [`src/services/gps/GpsTripTracker.ts:613-698`](../src/services/gps/GpsTripTracker.ts#L613-L698) (`maybeAutoShutdownStale`)

---

## G. VIN

### G1. Giải mã năm sản xuất (SAE J853, ký tự VIN thứ 10)
**Vấn đề:** mã năm lặp lại theo chu kỳ 30 năm, cần đoán đúng chu kỳ.
**Logic:**
```
modernYear = tra bảng năm hiện đại (chu kỳ 2010-2039) theo ký tự VIN[9]
olderYear  = modernYear - 30
candidates = [modernYear, olderYear] lọc bỏ năm > năm hiện tại (không thể ở tương lai)
nếu có hintYear (vd từ đời xe user khai): chọn candidate gần hintYear nhất
không có hint: chọn candidate LỚN NHẤT (ưu tiên chu kỳ mới hơn)
```
**Vị trí:** [`src/services/vin/vinDecoder.ts:22-55`](../src/services/vin/vinDecoder.ts#L22-L55) (`decodeVinModelYear`)

### G2. Gợi ý khu vực lắp ráp (ký tự đầu VIN — WMI)
**Logic:** tra bảng `REGION_FIRST_CHAR` — **chỉ khai báo** các ký tự có nguồn tham khảo thống nhất; ký tự còn lại trả `null` có chủ ý.
**Vị trí:** [`src/services/vin/vinDecoder.ts:61-81`](../src/services/vin/vinDecoder.ts#L61-L81)
**Lưu ý:** luôn phải hiển thị như "tham khảo", không phải sự thật chắc chắn (ghi rõ trong docblock).

---

## H. OCR (đọc ảnh)

### H1. Trích số ODO từ ảnh
**Logic:** gộp khoảng trắng giữa các chữ số (tối đa 6 lượt), match `(?<!\d)\d{5,6}(?!\d)` (lookaround thay `\b` để bắt được `"090000km"`), chọn số **lớn nhất** trong các match; nếu không tìm thấy, thử lại sau khi đổi chữ `O`/`o` → số `0` (màn LCD hay lẫn 2 ký tự này).
**Vị trí:** [`src/components/OcrCamera.tsx:31-56`](../src/components/OcrCamera.tsx#L31-L56) (`extractOdo`)

### H2. Trích tiền & số lít từ hoá đơn đổ xăng
**Logic:** tổng tiền = số có định dạng `\d{1,3}[.,]\d{3}([.,]\d{3})?` **lớn nhất** trong ảnh và > 10.000đ; số lít = số thập phân đứng ngay trước ký tự `L`/`lít`, fallback sang số thập phân bất kỳ trong khoảng [1,100] nếu không tìm thấy keyword.
**Vị trí:** [`src/components/OcrCamera.tsx:58-84`](../src/components/OcrCamera.tsx#L58-L84) (`extractReceiptData`)

### H3. Vòng lặp tự chốt khi quét ODO trực tiếp (live camera)
**Logic:** yêu cầu đúng **2 lần đọc liên tiếp giống hệt nhau** mới tự chốt số; tốc độ lặp quét: `250ms` bình thường, `700ms` nếu máy chậm (1 vòng OCR > 1.5s); tự dừng sau `45s` (`MAX_SCAN_MS`).
**Vị trí:** [`src/components/OcrCamera.tsx:149-207`](../src/components/OcrCamera.tsx#L149-L207)

---

## I. Trend / tổng hợp phiên

### I1. Gộp phiên OBD theo ngày cho biểu đồ
**Logic:** coolant lấy **đỉnh** (`max`, không phải trung bình — "đỉnh mới là thứ đáng lo"); điện áp lấy trung bình 2 chữ số; thời gian máy chạy quy đổi ra **phút** (không phải giờ, vì phiên ngắn vài phút làm tròn theo giờ sẽ hiển thị "0h" sai). Ngày không có phiên nào → mọi chỉ số `null` (không phải `0`, để biểu đồ không hiểu nhầm "0V/0°C hôm đó").
**Vị trí:** [`src/services/obd/sessionTrend.ts:41-80`](../src/services/obd/sessionTrend.ts#L41-L80) (`groupSessionsByDay`)

---

## Luồng dữ liệu liên-repo

Điểm dễ nhầm nhất giữa 2 repo — **ai tính, ai chỉ đọc lại**:

| Dữ liệu | Tính ở đâu | Backend làm gì với nó |
|---|---|---|
| Driving Score (E1, E2) | **App**, cuối mỗi phiên OBD / mỗi chuyến GPS | Backend **không tính lại** — chỉ lưu số đã tính sẵn và chạy 1 thuật toán trend riêng (so trung bình 10 phiên gần nhất vs 10 phiên trước, xem `notedri/docs/ALGORITHMS.md` §17) |
| `summary` JSON của phiên OBD (engine_run_seconds, driving_score, harsh_*_count, findings...) | **App** (`obdLiveMonitor.ts`) | Backend chỉ **validate + clamp** biên (engine_run_seconds ≤ duration, driving_score ∈ [0,100]) rồi lưu — không đánh giá lại Rule Engine (`notedri/docs/ALGORITHMS.md` §1) |
| Rule Engine chẩn đoán (C5) | **App**, chạy on-device mỗi vòng poll | Backend chỉ đọc `summary.findings` để tính điểm phạt VHS (Pillar C4/Penalty) — không chạy lại rule |
| VIN decode (G1, G2) | **Chỉ ở App** | Backend không decode VIN — chỉ so khớp chuỗi VIN để phát hiện trùng giữa các xe |

Nói cách khác: **App tính "chuyện gì đang xảy ra với xe ngay lúc này"; Backend tính "xu hướng dài hạn + điểm tổng hợp"** dựa trên dữ liệu App đã gửi lên. Không có 2 nơi cùng tính 1 thứ theo 2 công thức khác nhau (điểm dễ gây sai lệch nếu có) — mọi chỗ "trùng tên" (EWMA xuất hiện ở cả 2 repo, ví dụ D1 ở đây và §Statistics-toolbox bên backend) là 2 cài đặt độc lập cho 2 mục đích khác nhau (mượt hiển thị real-time vs. dự đoán lịch đổ xăng), không phải cùng 1 luồng logic.
