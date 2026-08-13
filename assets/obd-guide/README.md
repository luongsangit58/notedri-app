# Hình minh hoạ hướng dẫn kết nối OBD2

Mỗi bước dùng 1 ảnh riêng (tỉ lệ 16:10), require trực tiếp trong
`src/components/ObdConnectionGuide.tsx` — không còn dùng ảnh gộp 2×2.

- `step-1.png` .. `step-4.png` — luồng ghép nối BLE.
- `classic-step-1.png` .. `classic-step-4.png` — luồng ghép nối Bluetooth Classic
  (khác BLE từ bước 2: phải ghép qua Cài đặt Bluetooth hệ thống với mã PIN).
  Bước 1 giống hệt BLE nên có bộ ảnh riêng của Classic để khớp đúng phong cách
  minh hoạ (mỗi ảnh có 1 khung tròn xanh + số thứ tự trắng ở góc trên-trái).
