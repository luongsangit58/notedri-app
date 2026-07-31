# OBD2 Supported Devices — Connectivity & Reliability Data

Dữ liệu khách quan rút ra từ log phiên thật (app debug export, xem
[`obd-fixtures/README.md`](../obd-fixtures/README.md) cho định dạng) để BE dùng làm
căn cứ dựng trang **supported-devices** (so sánh kết nối, đánh giá độ ổn định) thay
vì liệt kê cảm tính. Cả 4 log đều chạy trên **cùng một xe** (VIN
`MRHGK5830JT0400005` khi đọc được) nên số liệu so sánh được trực tiếp với nhau,
không lệch do khác xe.

Nguồn: `obd-fixtures/notedri-obd-session-{KONNWEI-KW906,KONNWEI-KW902,OBDII,Vgate-BLE}.json`.

## Bảng so sánh

| | KONNWEI KW906 | KONNWEI KW902 | OBDII (giá rẻ) | Vgate ("Android-Vlink") |
|---|---|---|---|---|
| Transport trong log | BLE (log #1, 2026-07-30) **+ Classic/SPP (log #2, 2026-07-31 — mới, xem mục riêng dưới)** | BLE | BLE | **Classic (SPP)** — device line ghi `(classic)`, không phải BLE dù tên file "Vgate-BLE" |
| Transport xác nhận thêm qua thực tế dùng (ngoài log, 2026-07-30) | **Log #2 (2026-07-31) chính là bằng chứng Classic hoạt động** — không cần suy đoán như KW902 | **Đã kết nối được cả BLE lẫn Classic** | **BLE kết nối được; Classic CHƯA kết nối được** — nhập PIN `0000` và `1234` đều báo sai, chưa xác định đúng PIN | — |
| ELM327 firmware báo qua `ATI` | v1.5 (cả 2 log) | v1.5 | v1.5 | v2.3 |
| GATT profile | 4 service, 2 characteristic (`fff0`/`fff1` notify, `fff0`/`fff2` writeNoResp) — chỉ áp dụng cho log BLE #1 | Giống hệt KW906 (cùng model) | **8 service, 12 characteristic** (thêm Device Info `1804`, Battery `180f`, 2 custom service `ae30`/`ae3a`) — phức tạp hơn hẳn | N/A (Classic không có GATT) |
| Mode 09 VIN (`0902`) | ✅ đọc đúng VIN (cả 2 log, cùng VIN) | ✅ đọc đúng VIN | ❌ `NO DATA` | ✅ đọc đúng VIN |
| Mode 03/07 (DTC hiện tại/pending) | `4300`/`4700` (không lỗi, cả 2 log) | `4300`/`4700` | `4300`/`4700` | `4300`/`4700` |
| Mode 0A (permanent DTC) | `NO DATA` (cả 2 log) | `NO DATA` | `NO DATA` | `NO DATA` |
| → Duy nhất khác biệt lỗi giữa các thiết bị | — | — | **VIN không đọc được** | — |
| Median round-trip/lệnh (lúc đang poll, loại trừ khoảng nghỉ màn khoá) | ~91ms (log #1, BLE) / **~100ms (log #2, Classic — gần như ngang BLE, không có chi phí SPP đáng kể)** | ~91ms | **~150ms** | ~55ms |
| Tốc độ poll RPM thực tế | ~76 lần/phút (BLE) / ~81 lần/phút (Classic, log #2) | ~83 lần/phút | ~60 lần/phút | ~93 lần/phút |
| Khoảng nghỉ dài bất thường trong log (screen-lock, không phải lỗi kết nối) | không có (log #1) / không có (log #2, nhưng log #2 chỉ dài ~3.4 phút nên ít cơ hội gặp) | 2 lần (~17 phút, ~10.5 phút) | không có | 1 lần (~14.8 phút) |

## Cập nhật 2026-07-31 — KW906 xác nhận Classic (SPP) qua log thật

File `notedri-obd-session-KONNWEI-KW906.json` đã được thay bằng log mới hơn
(`exported_at: 2026-07-31T01:20:23.999Z`, chưa commit vào lúc viết mục này).
Log cũ commit trong `35dc916` (`exported_at: 2026-07-30T13:17:43.786Z`) ghi
device line `KONNWEI 12:34:15:0C:19:93` (BLE). Log mới ghi
`KONNWEI 12:34:15:0C:19:93 (classic)` — **cùng một thiết bị vật lý (cùng MAC),
nhưng lần này kết nối qua Bluetooth Classic (SPP)** thay vì BLE. Điều này khớp
với tính năng mới thêm ở `ad08235` (Thêm kết nối Bluetooth Classic (SPP) song
song BLE cho OBD2).

So sánh 2 log của cùng KW906:

| | Log #1 — BLE (2026-07-30) | Log #2 — Classic/SPP (2026-07-31) |
|---|---|---|
| Thời lượng phiên | ~34s (219 entries) | ~3.4 phút (1000 entries) |
| ELM327 (`ATI`) | v1.5 | v1.5 |
| VIN (`0902`) | ✅ `MRHGK5830JT040005` | ✅ `MRHGK5830JT040005` (giống, cùng xe) |
| DTC 03/07/0A | `4300`/`4700`/`NO DATA` | `4300`/`4700`/`NO DATA` (giống) |
| Lỗi giao thức (TIMEOUT/WRITE_ERROR) | không có | không có |
| Median latency/lệnh trong 1 chu kỳ poll | ~91ms | ~100ms |
| Khoảng nghỉ lớn nhất giữa 2 lệnh | — | ~895ms — nhưng đây là khoảng nghỉ **giữa 2 chu kỳ poll** (`0111` cuối chu kỳ → `010C` đầu chu kỳ sau), tức là do lịch polling của app chủ động chờ, không phải do Classic chậm. Trong 1 chu kỳ (`010C`→`010D`→`0111`) độ trễ vẫn ~100ms như BLE. |

**Kết luận:** KW906 hoạt động tốt trên cả 2 transport, không có sự đánh đổi độ
trễ đáng kể khi dùng Classic (SPP) so với BLE (~100ms vs ~91ms, chênh lệch nằm
trong nhiễu đo). Đây là log thật đầu tiên xác nhận Classic hoạt động ổn định
trên KONNWEI KW906 (trước đó phần "Transport xác nhận thêm qua thực tế" chỉ có
dữ liệu này cho KW902). Lưu ý phiên log #2 ngắn (~3.4 phút) nên **chưa kiểm
chứng được độ ổn định dài hạn** (khoảng nghỉ do khoá màn hình, rớt kết nối nền)
như log #1 của KW902/OBDII/Vgate — nên khuyến nghị thu thêm 1 log Classic dài
hơn (>10 phút, có khoá màn hình) cho KW906 trước khi khẳng định chắc trên trang
supported-devices.

Có một file log rời chưa liên quan trực tiếp tới KW906
(`obd-fixtures/obd-session-log/notedri-obd-session.json`, chưa track trong git,
device `Android-Vlink ... (classic)`, 2026-07-27) — đây là log Vgate/Android-Vlink
Classic từ lúc phát triển tính năng SPP, không phải KW906, không đưa vào bảng
so sánh trên nhưng có thể xoá hoặc giữ làm tư liệu tham khảo thêm cho Vgate Classic.

## Diễn giải

- **Không có thiết bị nào lỗi giao thức PID sống** (RPM `010C`, tốc độ `010D`, ga
  `0111`, load động cơ `0104`, coolant... đều đọc đúng, không `TIMEOUT`/`WRITE_ERROR`).
  `NO DATA` ở mode `0A` (permanent DTC) xuất hiện **ở cả 4 log** vì xe không có DTC
  lưu — đây là phản hồi của xe, không phải lỗi thiết bị, **không được tính là điểm
  trừ** khi so sánh.
- **OBDII (giá rẻ) là thiết bị duy nhất không đọc được VIN** (mode 09) dù cùng
  chạy trên xe mà 3 thiết bị kia đọc VIN thành công. Nhiều khả năng chip ELM327
  clone rẻ tiền không xử lý đúng phản hồi multi-frame ISO-TP (VIN trả về 3 frame
  nối tiếp `0:...1:...2:...`, khác PID sống chỉ 1 frame). Hệ quả trong app: prefill
  VIN khi "Thêm xe từ OBD" và cache capability theo VIN
  (`src/services/obd/capabilityService.ts`) sẽ không hoạt động cho thiết bị này —
  không hỏng chức năng chính, chỉ mất 1 tiện ích phụ.
- **OBDII cũng chậm hơn ~65% mỗi lệnh** so với 2 KONNWEI (median 150ms vs 91ms),
  khớp với GATT profile phức tạp hơn nhiều (12 characteristic vs 2) — có thể do
  module BLE giá rẻ xử lý notify chậm hơn. Tốc độ dashboard cập nhật vẫn đủ dùng
  (~1 lần/giây), không đến mức "giật/lag" cảm nhận được.
- **Vgate trong log này chạy Classic (SPP), không phải BLE** — đừng dùng file này
  làm bằng chứng "Vgate luôn BLE"; trên Android, Vgate/"Android-Vlink" thường
  ghép Classic (khuyến nghị chính hãng cho Android), còn BLE ("IOS-Vlink") chỉ
  bắt buộc trên iOS vì Apple không cho SPP. Nếu trang supported-devices liệt kê
  transport theo thiết bị, cần ghi rõ **theo platform** (iOS: BLE, Android: có
  thể Classic hoặc BLE tuỳ chế độ), không gán 1 transport cố định cho cả thiết bị.
- **2 KONNWEI (KW902, KW906) cho số liệu gần như giống hệt nhau** (cùng GATT
  profile, cùng firmware ELM327 v1.5, cùng latency ~91ms, VIN đọc được, không lỗi
  nào khác nhau) — hợp lý vì cùng model, khác biệt duy nhất là các khoảng nghỉ dài
  do khoá màn hình (không liên quan chất lượng adapter, xem
  `docs/index.md` → services-guide cho cơ chế keep-alive nền).

## Ghép nối Bluetooth Classic (PIN) — lưu ý riêng, KHÔNG có trong log

Log JSON chỉ ghi lại giao tiếp **sau khi** hệ điều hành đã ghép nối (pairing)
xong — bước nhập PIN xảy ra ở tầng OS (Cài đặt Bluetooth Android), trước khi app
mở kết nối SPP, nên **không thể xác nhận PIN đúng của một thiết bị cụ thể chỉ từ
log này**.

Trong code, PIN mặc định app dùng khi ghép Classic là `1234`, áp dụng cho
Vgate/"Android-Vlink" (`src/services/obd/BleService.ts:982`, comment dòng
973-977) — không có gì đảm bảo module OBDII giá rẻ dùng cùng PIN; mỗi chip SPP
clone có thể đặt PIN riêng (`0000`, `1234`, `1111`, `6789`, hoặc "Just Works"
không cần PIN). Vì OBDII **đã kết nối và stream dữ liệu ổn định qua BLE** theo
log ở trên, không bắt buộc phải ép nó ghép Classic — Classic chỉ cần thiết cho
"đầu Android ô tô có chip/ROM không quét/kết nối BLE được" (comment
`BleService.ts:973-975`).

**Việc cần làm nếu muốn xác định đúng PIN Classic của OBDII:** thử lần lượt
`0000`/`1234`/`1111`/`6789` qua màn hình ghép Bluetooth hệ thống, hoặc tra theo
tem/nhãn dán trên thiết bị/tài liệu đi kèm — không có cách nào suy ra từ log
JSON app hiện có.

**Cập nhật thực tế (2026-07-30, ngoài log):** KONNWEI KW902 đã xác nhận ghép
được **cả BLE lẫn Classic**. OBDII (giá rẻ) mới xác nhận **BLE**; Classic vẫn
CHƯA ghép được — đã thử PIN `0000` và `1234`, cả 2 đều bị hệ thống báo sai. Vì
vậy trang supported-devices nên đánh dấu OBDII là "BLE: hỗ trợ / Classic: đang
xác minh PIN" thay vì khẳng định hỗ trợ cả 2 transport như KW902.

## Cho trang supported-devices (gợi ý cấu trúc dữ liệu)

```
{
  "device": "KONNWEI KW906",
  "transport": ["ble", "classic"],
  "transport_classic_evidence": "confirmed via real session log 2026-07-31, same physical device (MAC 12:34:15:0C:19:93), no protocol errors — but session short (~3.4min), long-term stability not yet verified",
  "elm_firmware": "v1.5",
  "vin_read_mode09": true,
  "live_pid_reliability": "no errors beyond vehicle-level NO DATA (mode 0A)",
  "avg_command_latency_ms": 91
},
{
  "device": "KONNWEI KW902",
  "transport": ["ble", "classic"],
  "elm_firmware": "v1.5",
  "vin_read_mode09": true,
  "live_pid_reliability": "no errors beyond vehicle-level NO DATA (mode 0A)",
  "avg_command_latency_ms": 91
},
{
  "device": "OBDII (generic/cheap)",
  "transport": ["ble"],
  "transport_classic_status": "unconfirmed — pairing PIN 0000 and 1234 both rejected by OS as of 2026-07-30",
  "elm_firmware": "v1.5",
  "vin_read_mode09": false,
  "live_pid_reliability": "no errors beyond vehicle-level NO DATA (mode 0A)",
  "avg_command_latency_ms": 150,
  "known_limitation": "VIN (mode 09) returns NO DATA — likely multi-frame ISO-TP handling issue in clone chip"
},
{
  "device": "Vgate iCar Pro (Android-Vlink)",
  "transport": ["classic_spp_android", "ble_ios"],
  "elm_firmware": "v2.3",
  "vin_read_mode09": true,
  "live_pid_reliability": "no errors beyond vehicle-level NO DATA (mode 0A)",
  "avg_command_latency_ms": 55,
  "note": "pairing PIN for Classic (Android) is device/OS-level, defaults to 1234 for Android-Vlink"
}
```

Số liệu latency/tốc độ poll phụ thuộc điều kiện đo (khoảng cách, nhiễu BLE xung
quanh) — nên nêu trên trang là "đo được trong 1 lần test", không cam kết tuyệt
đối, và cập nhật lại nếu có log mới với điều kiện đo tốt hơn (nhiều lần lặp).
