# OBD session fixtures

Log thô lệnh/response ELM327 thu từ xe thật - nguồn dữ liệu để phát triển parser,
capability profile và test hồi quy mà không cần ngồi trên xe.

## Cách thu

1. Cài APK bản mới, ra xe, cắm Vgate, nổ máy (hoặc bật contact).
2. App > Kết nối OBD2 > chọn "IOS-Vlink" > vào Dashboard.
3. Chạm "Xuất log phiên (gỡ lỗi)" > gửi JSON cho chính mình (Zalo/email/Drive).
4. Lưu file vào thư mục này, đặt tên: `vgate-<xe>-<yyyymmdd>.json`
   (ví dụ: `vgate-honda-city-20260713.json`).

## Định dạng

```json
{
  "exported_at": "2026-07-13T...",
  "device": "IOS-Vlink",
  "entries": [
    { "t": 1752..., "cmd": "#device", "res": "IOS-Vlink D2:E0:..." },
    { "t": 1752..., "cmd": "#services", "res": "0000fff0-...,e7810a71-..." },
    { "t": 1752..., "cmd": "ATZ", "res": "ELM327 v2.2" },
    { "t": 1752..., "cmd": "010C", "res": "41 0C 0B B8" }
  ]
}
```

Entry có `cmd` bắt đầu bằng `#` là ghi chú sự kiện (thiết bị, UUID service phát hiện được),
không phải lệnh gửi xuống adapter. `<<TIMEOUT>>` / `<<WRITE_ERROR: ...>>` đánh dấu lệnh lỗi.

## Dùng để làm gì tiếp

- Unit test cho `ObdReader.ts` (parse RPM/speed/coolant/DTC từ response nguyên văn).
- Capability profile: bitmask 0100/0120/0140/0160 cho biết xe hỗ trợ PID nào.
- Emulator ELM327 phát lại phiên này để test luồng DTC (xe khoẻ không có mã lỗi thật).
