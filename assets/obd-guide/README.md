# Hình minh hoạ hướng dẫn kết nối OBD2

Đặt 4 file PNG vào đây (tỉ lệ ~16:10, vd 1200×750px):

- `step-find-port.png` — Bước 1: tìm cổng OBD2
- `step-plug-adapter.png` — Bước 2: cắm adapter
- `step-start-engine.png` — Bước 3: nổ máy / bật contact
- `step-scan-connect.png` — Bước 4: bật Bluetooth & quét

Prompt sinh hình cho ChatGPT: `_bmad-output/CHATGPT-PROMPT-OBD-GUIDE-IMAGES-2026-07-14.md`

Có file rồi thì bỏ comment `require(...)` tương ứng trong
`src/components/ObdConnectionGuide.tsx` (map `GUIDE_IMAGES`).
