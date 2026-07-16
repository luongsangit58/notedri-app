# Hướng dẫn test NoteDri OBD2 (cho Sang) - 14/7/2026

Tài liệu này liệt kê ĐÚNG những gì cần test TRÊN MÁY THẬT + Vgate + xe (những thứ
KHÔNG thể tự động test bằng unit test). Phần nào đã có unit test tự động thì ghi
rõ "đã tự test" để bạn KHÔNG phải test lại.

APK mới nhất: `~/Downloads/notedri-release-dtc200.apk` (rebuild sau mỗi đợt sửa).

---

## A. ĐÃ tự động test (KHÔNG cần test tay lại)

Những phần này có unit test chạy trong CI (`npm test` = 86 test app, `php artisan
test` = 794 test backend), logic thuần đã được khoá:
- Giải mã PID (RPM/tốc độ/tải/nhiệt/điện áp/VIN/DTC) từ byte thô.
- Ghép ISO-TP + chặn rớt gói (rớt frame giữa -> không phát mã sai).
- Rule engine đánh giá (5+1 rule, banding điện áp, ngưỡng theo giờ máy chạy).
- Chấm điểm lái xe (phanh gấp/tăng tốc từ dãy tốc độ).
- Giải mã VIN (năm sản xuất, vùng lắp ráp), phát hiện VIN trùng.
- VHS + SuggestionEngine tiêu thụ findings tái diễn.
- Hộ chiếu bảo dưỡng (yêu cầu/duyệt/từ chối/hết hạn/throttle) - logic backend.

=> Test tay chỉ tập trung vào 3 thứ máy tính KHÔNG mô phỏng được: **phần cứng
BLE thật, hành vi trên xe chạy thật, và luồng UI thật**.

---

## B. CẦN test tay - Kết nối & Bluetooth (ưu tiên cao - vừa sửa 14/7)

### B1. Phát hiện Bluetooth TẮT
1. TẮT Bluetooth của điện thoại.
2. Mở app -> xe -> "Kết nối OBD2".
3. **Kỳ vọng**: hiện ngay thông báo "Bluetooth đang TẮT. Hãy bật Bluetooth để
   kết nối OBD2." + nút "Mở cài đặt ứng dụng"/"Mở cài đặt Bluetooth".
   - Android ≤12: có thể hiện hộp thoại hệ thống xin bật Bluetooth hộ.
   - Android 13+: hiện nút mở cài đặt (OS không cho app tự bật).
4. **Bug cũ cần xác nhận đã hết**: trước đây báo mơ hồ, không rõ là do TẮT hay
   máy không hỗ trợ.

### B2. Từ chối quyền Bluetooth
1. Gỡ quyền Bluetooth của app (Cài đặt > Ứng dụng > NoteDri > Quyền), chọn "Hỏi
   mỗi lần" hoặc "Từ chối".
2. Mở màn kết nối -> từ chối khi hỏi quyền.
3. **Kỳ vọng**: "Chưa cấp quyền Bluetooth... Mở Cài đặt để bật quyền." + nút
   "Mở cài đặt ứng dụng" (KHÔNG phải thông báo tiếng Việt không dấu như trước).

### B3. Quét & kết nối Vgate
1. Bật Bluetooth, cắm Vgate vào xe, nổ máy.
2. Kết nối -> chọn thiết bị "IOS-Vlink".
3. **Kỳ vọng**: kết nối được, vào Dashboard, hiện số liệu sống.
4. Chạm 2 lần nhanh vào thiết bị (double-tap) -> **không được** kẹt/lẫn dữ liệu.

### B4. Rớt sóng & nối lại
1. Đang kết nối, đi ra xa xe / rút Vgate vài giây rồi cắm lại.
2. **Kỳ vọng**: hiện "Đang kết nối lại"; số liệu cũ bị **làm mờ + banner "số
   liệu tạm dừng cập nhật"** (không hiện số cũ y như đang sống); nối lại được
   thì số liệu tươi lại.
3. Bấm "Ngắt kết nối" ĐÚNG lúc đang nối lại -> **không được** tự hồi sinh kết nối.

### B5. Đổi xe giữa phiên (nếu có ≥2 xe)
1. Đang kết nối xe A, mở xe B rồi kết nối.
2. **Kỳ vọng**: thống kê/điểm của xe A không bị gán nhầm sang xe B.

### B6. Cảnh báo VIN không khớp (cắm Vgate sang XE KHÁC) - vừa thêm 14/7
1. Kết nối bản ghi "Xe A" với xe A thật (để app đọc & nhớ VIN xe A).
2. Ngắt, rồi cắm Vgate sang **xe B thật** nhưng vẫn mở màn OBD của **bản ghi Xe A**, kết nối.
3. **Kỳ vọng**: hiện banner cam "VIN không khớp với Xe A - nếu đang cắm sang xe
   khác, dữ liệu sẽ ghi nhầm... hãy ngắt và mở đúng xe". App tự dò lại capability
   cho xe B (không dùng whitelist PID cũ của xe A).
4. **Cách đúng**: tạo bản ghi riêng cho xe B rồi kết nối dưới bản ghi đó -> không
   có cảnh báo, mọi dữ liệu gán đúng xe B.
   (Lưu ý: chỉ cảnh báo với xe HỖ TRỢ đọc VIN. Xe không trả VIN thì không cảnh báo được.)

---

## C. CẦN test tay - Dữ liệu trên xe chạy thật (cần lái)

### C1. Xuất log phiên (QUAN TRỌNG - nuôi fixture)
- Sau mỗi lần chạy có gì lạ, bấm "Xuất log phiên" -> gửi cho mình (Zalo/email)
  -> mình thả vào `obd-fixtures/`. Đây là cách hiệu chỉnh các ngưỡng CHƯA có dữ
  liệu thật (xem D).

### C2. Số liệu sống đúng thực tế
1. Lái xe, so số trên Dashboard với đồng hồ xe: tốc độ, RPM, nhiệt độ nước.
2. Vào "Xem tất cả thông số kỹ thuật" -> kiểm tra 13 PID (kể cả fuel trim, áp
   suất khí nạp, nhiệt độ khí nạp/môi trường, tốc độ tiêu hao xăng).
3. **Kỳ vọng**: số hợp lý, PID xe không hỗ trợ hiện "Xe không hỗ trợ".

### C3. Banner "mọi chỉ số bình thường"
- Xe khoẻ, đang kết nối -> **kỳ vọng**: hiện banner xanh "Mọi chỉ số đang trong
  giới hạn bình thường" (không để trống trơn như "app treo").

### C4. Chấm điểm lái xe (cần fixture để hiệu chỉnh - xem D)
- Lái có 1-2 lần phanh gấp + tăng tốc gấp CÓ CHỦ Ý (nơi an toàn) -> xuất log +
  cho mình biết "đoạn phút thứ mấy phanh gấp" để mình đối chiếu ngưỡng.

### C5. Daily Report
- Sau vài phiên, mở "Báo cáo sức khoẻ xe" -> kiểm tra số liệu tổng hợp hợp lý.
- Free user: **kỳ vọng** thấy mục này CÓ (kèm khoá vương miện), chạm -> màn
  Premium (không còn ẩn hoàn toàn).

---

## D. CẦN dữ liệu thật để MÌNH hiệu chỉnh (bạn chỉ cần thu thập, không phán xét đúng/sai)

Các ngưỡng sau đang là "beta" (ước tính từ tài liệu, chưa hiệu chỉnh bằng xe thật).
Bạn chỉ cần **xuất log + mô tả tình huống**, mình chỉnh ngưỡng:

| Cần | Cách lấy |
|---|---|
| Mẫu mã lỗi DTC THẬT (hiện chỉ có "43 00" xe khoẻ) | Nếu xe/xe người quen có đèn Check Engine sáng -> kết nối + xuất log |
| Chuyến chạy thuần cao tốc (không dừng đèn đỏ) | Đi 1 đoạn cao tốc ≥10 phút không dừng -> xuất log |
| Khởi động nguội (đo từ lúc mới nổ máy) | Cắm Vgate + kết nối NGAY khi vừa nổ máy buổi sáng -> để chạy ~10 phút |
| Phanh gấp/tăng tốc thật (hiệu chỉnh driving score) | C4 ở trên |
| ≥2 tuần dữ liệu phiên (bật trend rules) | Cứ dùng đều, mình xem dữ liệu tích luỹ sau |

---

## E. CẦN test tay - Thêm xe & VIN (không cần Vgate)

### E1. Sắp xếp hãng phổ biến
- Thêm xe -> chọn hãng -> **kỳ vọng**: Honda/Toyota/Hyundai... (ô tô) hoặc
  Honda/Yamaha/SYM... (xe máy) lên đầu danh sách.

### E2. Gợi ý từ VIN
- Nhập VIN 17 ký tự (vd `MRHGK5830JT040005`) vào ô VIN -> **kỳ vọng**: hiện gợi
  ý "năm sản xuất" (2018 với VIN mẫu này). Vùng lắp ráp có thể trống (đúng - VIN
  mẫu bắt đầu bằng M không nằm trong danh sách tin cậy).

### E3. VIN trùng
- Thêm 2 xe cùng VIN (hoặc 2 tài khoản) -> **kỳ vọng**: cảnh báo "VIN trùng"
  (KHÔNG chặn tạo xe). Premium: có nút mời gửi yêu cầu xem lịch sử.

### E4. Hộ chiếu bảo dưỡng (Premium, cần 2 tài khoản)
1. TK A (chủ cũ) có xe VIN X + vài lần ghi bảo dưỡng.
2. TK B (chủ mới, Premium) thêm xe cùng VIN X -> gửi yêu cầu.
3. TK A -> màn "Chuyển nhượng xe" -> **kỳ vọng**: thấy yêu cầu -> Đồng ý.
4. TK B -> **kỳ vọng**: xem được lịch sử bảo dưỡng (ngày + hạng mục) - KHÔNG
   thấy chi phí/hoá đơn/vị trí/danh tính TK A.
5. TK A -> "Đánh dấu đã bán" -> xe tắt khỏi danh sách đang dùng.

---

## F. Ghi chú
- Debug feature ("Xuất log phiên", dòng "Raw: ...") CỐ Ý giữ lại trong giai đoạn
  test - sẽ ẩn khi lên bản chính thức.
- iOS: chưa build/test (hoãn có chủ ý).
- NFC chạm-để-kết-nối: cần mua thẻ NFC (~10-20k) mới test được (đã có lối vào ở
  màn chi tiết xe).
