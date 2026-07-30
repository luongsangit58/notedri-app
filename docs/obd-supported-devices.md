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
| Transport trong log | BLE | BLE | BLE | **Classic (SPP)** — device line ghi `(classic)`, không phải BLE dù tên file "Vgate-BLE" |
| Transport xác nhận thêm qua thực tế dùng (ngoài log, 2026-07-30) | — | **Đã kết nối được cả BLE lẫn Classic** | **BLE kết nối được; Classic CHƯA kết nối được** — nhập PIN `0000` và `1234` đều báo sai, chưa xác định đúng PIN | — |
| ELM327 firmware báo qua `ATI` | v1.5 | v1.5 | v1.5 | v2.3 |
| GATT profile | 4 service, 2 characteristic (`fff0`/`fff1` notify, `fff0`/`fff2` writeNoResp) | Giống hệt KW906 (cùng model) | **8 service, 12 characteristic** (thêm Device Info `1804`, Battery `180f`, 2 custom service `ae30`/`ae3a`) — phức tạp hơn hẳn | N/A (Classic không có GATT) |
| Mode 09 VIN (`0902`) | ✅ đọc đúng VIN | ✅ đọc đúng VIN | ❌ `NO DATA` | ✅ đọc đúng VIN |
| Mode 03/07 (DTC hiện tại/pending) | `4300`/`4700` (không lỗi) | `4300`/`4700` | `4300`/`4700` | `4300`/`4700` |
| Mode 0A (permanent DTC) | `NO DATA` | `NO DATA` | `NO DATA` | `NO DATA` |
| → Duy nhất khác biệt lỗi giữa các thiết bị | — | — | **VIN không đọc được** | — |
| Median round-trip/lệnh (lúc đang poll, loại trừ khoảng nghỉ màn khoá) | ~91ms | ~91ms | **~150ms** | ~55ms |
| Tốc độ poll RPM thực tế | ~76 lần/phút | ~83 lần/phút | ~60 lần/phút | ~93 lần/phút |
| Khoảng nghỉ dài bất thường trong log (screen-lock, không phải lỗi kết nối) | không có | 2 lần (~17 phút, ~10.5 phút) | không có | 1 lần (~14.8 phút) |

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
  "transport": ["ble"],
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
