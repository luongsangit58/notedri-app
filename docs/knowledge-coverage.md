# Knowledge — hiện trạng & độ phủ

> **Mục đích:** File theo dõi/kiểm soát — "Knowledge" (từ điển DTC + rule chẩn đoán sống) đang có gì, phủ tới đâu, còn thiếu gì, và cách mở rộng đúng hướng. Cập nhật lại số liệu mỗi khi 2 file dữ liệu nguồn thay đổi.
> **Ngày khảo sát:** 2026-08-12 · **Cập nhật lần cuối:** 2026-08-12 (chủ động mở rộng P2xxx, xem mục "Đợt mở rộng" bên dưới)
> **Bối cảnh:** xem thêm [feature-parity-vs-web.md](feature-parity-vs-web.md) (mục "Rà soát v6 Knowledge Generation Pipeline") — tài liệu tầm nhìn ban đầu `OBD2/*.md` đã bị xoá vì lỗi thời, thay bằng kiến trúc đơn giản hơn nhiều đang mô tả ở đây.

## Tóm tắt nhanh

Knowledge hiện có 2 phần, hoàn toàn tách biệt, phục vụ 2 mục đích khác nhau:

| | Từ điển DTC | Rule Engine sống |
|---|---|---|
| File nguồn | `notedri/resources/data/dtc_dictionary.json` | `notedri/resources/data/diagnostic_rules.json` |
| Dùng khi nào | Tra tay 1 mã lỗi (DtcLookupScreen, web `/tra-cuu-ma-loi`), hoặc mã DTC app đọc được từ xe | Đang kết nối OBD2 sống, so sánh liên tục rpm/tốc độ/nhiệt độ/điện áp... với ngưỡng |
| Số lượng hiện tại | **323 mã** | **7 rule** |
| Đồng bộ xuống app | `npm run sync:dtc` → `src/data/dtcDictionary.json` | `npm run sync:rules` → `src/data/diagnosticRules.json` |
| Ai chạy | `DtcDictionary.php` (backend), FE tra qua `/dtc-codes/{code}` | `diagnosticEngine.ts` (app, hàm thuần), backend chỉ phân phối JSON |

---

## 1. Từ điển DTC — độ phủ chi tiết

### Theo tiền tố

| Tiền tố | Ý nghĩa | Số mã | Đọc được qua ELM327 phổ thông? |
|---|---|---|---|
| P0xxx | Powertrain, mã chuẩn SAE dùng chung mọi hãng | **258** | Có — đây là nhóm chính app thực sự đọc qua Mode 03/07/0A |
| P1xxx | Powertrain, mã riêng từng hãng | **1** | Có (nếu hãng khai báo), nhưng mỗi hãng định nghĩa khác nhau — khó tổng quát hoá cho app đa hãng |
| P2xxx | Powertrain, mã SAE bổ sung (đời xe mới hơn) | **50** | Có — vừa mở rộng 12/8 (xem mục "Đợt mở rộng" dưới đây) |
| P3xxx | Powertrain, mã riêng hãng/hybrid | **0** | Có (nếu hãng khai báo) |
| C (Chassis - ABS/treo) | | **4** | **Phần lớn KHÔNG** — cần thiết bị hỗ trợ riêng module ABS từng hãng, đầu đọc ELM327 phổ thông (Vgate) không đọc được |
| B (Body - túi khí/điện thân xe) | | **1** | **Phần lớn KHÔNG** — cần scanner hỗ trợ hệ túi khí (SRS) riêng, tương tự C-code |
| U (Network - CAN bus) | | **9** | Có — lỗi giao tiếp module thường lộ qua chẩn đoán chung |

**Theo severity:** warn 191 · critical 94 · info 38.

### Nhận định

- **Không "thiếu sót"** — mã Chassis/Body gần như trống là do **giới hạn phần cứng thật** (ELM327/Vgate app đang dùng không đọc được nhóm này trên phần lớn xe), không phải bỏ quên. Biên mục thêm mã B/C bây giờ sẽ ít giá trị vì app chưa đọc được để mà tra.
- P2xxx đã tăng từ 12 lên 50 mã (mục "Đợt mở rộng" bên dưới) — vẫn còn dư địa (CSDL SAE generic mở có ~3500 mã P2xxx kể cả biến thể bank 2/xi-lanh riêng lẻ ít gặp trên xe phổ thông VN — không cần phủ hết, chỉ ưu tiên mã có khả năng gặp thật).
- P1xxx/P3xxx gần trống là hợp lý — mã riêng hãng, effort cao/giá trị thấp cho app đa hãng, không nên ưu tiên.

### Lịch sử tăng trưởng (bằng chứng đã tăng dần có chủ đích, không phải làm dở)

| Ngày | Số mã | Nhóm thêm |
|---|---|---|
| 29/6 | khởi tạo | — |
| — | 32→71 | + `can_drive` (đi tiếp được không), endpoint tra tay Free |
| — | 74→136 | Kim phun, mobin, hộp số, EVAP, ABS sau, CAN bus |
| — | 200 | (chưa rõ nhóm cụ thể trong log) |
| 14/7 | 200→285 | VVT (P0010-23), sấy O2 (P0030-37), MAF/MAP (P0103-09), bướm ga/chân ga (P0220-34, P2122-38), turbo, EVAP (P0454), van/áp suất hộp số (P0746-966) |
| 12/8 | 285→323 | **Chủ động research (không đợi misses)** — 38 mã P2xxx: IMRC (P2004/06/15), mạch VVT (P2088-91), bướm ga + chân ga D/E/F (P2100-134), hỗn hợp nhiên liệu ngoài không tải (P2177-188), cảm biến oxy kẹt (P2195/96/270/71), turbo (P2262/63), EVAP (P2401/02/419), sạc/nguồn ECU (P2500-08), làm mát hiệu năng chung (P2181). Nguồn tên mã: đối chiếu CSDL SAE J2012 generic mở (`github.com/Wal33D/dtc-database`) |

### Đợt mở rộng 12/8 — vì sao chủ động thay vì chờ misses

Bản rà soát đầu (mục này, trước 12/8) khuyến nghị "đợi dữ liệu misses thật trước khi mở rộng" — khuyến nghị đó **áp dụng SAI cho từ điển DTC**. Ý nghĩa mỗi mã DTC là định nghĩa chuẩn SAE J2012 **công khai, cố định** — khác hẳn ngưỡng vật lý trong `diagnostic_rules.json` (cần xe thật để hiệu chỉnh). Nghĩa là từ điển DTC **research trước được, không cần chờ ai tra mã đó trước**. Bài học: chỉ mục 2 (Rule Engine) mới thực sự cần dữ liệu thật để hiệu chỉnh ngưỡng — từ điển DTC nên tiếp tục mở rộng chủ động theo lịch, không đợi thụ động.

---

## 2. Rule Engine sống — độ phủ theo hệ

Tầm nhìn ban đầu (`OBD2/NoteDri_Technical_Bible_v7/v8`, đã xoá vì lỗi thời) đặt ra 7 "hệ sức khoẻ": Engine, Cooling, Fuel, Electrical, Ignition, Emissions, Transmission. Thực tế hiện có:

| Hệ | Rule hiện có | Trạng thái |
|---|---|---|
| Electrical (sạc điện) | `charging-voltage-low`, `charging-voltage-critical-low`, `charging-voltage-high` | Có, khá đủ (2 chiều thấp/cao) |
| Cooling (làm mát) | `engine-overheat`, `thermostat-stuck-open-suspect` | Có |
| Engine (chung) | `high-idle-warm` | Có 1, mỏng |
| Lubrication (dầu máy) | `engine-oil-overheat-suspect` (mới thêm 12/8) | Có 1, beta, nguồn tham khảo yếu hơn các rule khác (xem `source` trong JSON) |
| Fuel, Ignition, Emissions, Transmission | **0 rule** | Chưa có |

Tất cả 7 rule đều đánh dấu `"beta": true` — **chưa rule nào được hiệu chỉnh bằng dữ liệu chạy thật quy mô lớn** (chỉ dựa tài liệu công khai + 1 xe test tích hợp, xem `diagnosticEngine.ts` docblock: *"Xe Sang = bài test tích hợp, không phải nguồn tri thức"*).

**Giới hạn kỹ thuật hiện tại của engine** (không phải thiếu rule, mà thiếu loại rule): chỉ so sánh ngưỡng cố định tại 1 thời điểm (`gt/gte/lt/lte`), **chưa hỗ trợ rule dạng xu hướng/phương sai** (vd "vòng tua không ổn định", "điện áp dao động bất thường qua nhiều phiên") — muốn thêm loại rule này cần mở rộng chính `diagnosticEngine.ts`, không chỉ thêm JSON.

---

## 3. Cách biết CHÍNH XÁC cần mở rộng gì tiếp theo — báo cáo "misses"

Mỗi lượt tra mã DTC (app hoặc web) được ghi vào bảng `dtc_lookup_stats`:
- Mã **có** trong từ điển → tính là "hit".
- Mã **chưa có** → tính là "miss".

Trang `/admin/dtc-stats` (backend) hiện sẵn bảng này, **mặc định sắp theo `misses` giảm dần** — chính là danh sách "mã user thực sự đang tra nhiều mà chưa biên mục", đúng thứ tự ưu tiên nên làm tiếp theo.

**Tình trạng hiện tại:** cơ chế đã có sẵn trong code nhưng **chưa ai xem định kỳ** — dữ liệu thật nằm trên server production, không truy cập được từ máy dev local (đã thử `php artisan tinker` ngày 12/8, DB local rỗng — 0 lượt tra).

**Việc cần làm (chưa làm):** thiết lập 1 thói quen/lịch (hàng tuần hoặc hàng tháng) mở `/admin/dtc-stats` trên production, lấy top-N mã miss cao nhất, biên mục bổ sung theo đúng pattern đã có (đủ trường + rà soát chi phí/severity/can_drive hợp lý trước khi merge).

---

## 4. Khuyến nghị

1. **Tiếp tục chủ động mở rộng từ điển DTC theo lịch** (không cần đợi misses — xem lý do ở mục "Đợt mở rộng 12/8") — còn dư địa thật trong P2xxx (mới phủ 50/~3500 mã SAE generic, dù phần lớn phần còn lại là biến thể bank2/xi-lanh riêng ít gặp trên xe phổ thông VN) và có thể xem xét P1xxx cho vài hãng phổ biến nhất ở VN (Toyota/Honda/Hyundai) nếu muốn đầu tư thêm.
2. **Không đầu tư biên mục mã Chassis(C)/Body(B)** cho tới khi app có khả năng đọc được nhóm này (cần scanner/protocol khác ELM327 phổ thông) — làm bây giờ sẽ lãng phí công sức.
3. **Rule Engine — đây mới là chỗ THỰC SỰ cần dữ liệu thật, không áp dụng cách làm giống mục 1**: chỉ dùng tín hiệu đã thu thập sẵn, bắt buộc có `source` thật, giữ `beta` tới khi có dữ liệu thật. 4 tín hiệu đang "phí" chưa dùng: `fuelRateLPerHour`, `ambientAirTempC`, `fuelLevelPct`, `engineLoadPct` (đứng riêng) — nhưng qua khảo sát 12/8 **không tìm được ngưỡng chuẩn hoá đủ tin cậy** cho các tín hiệu này (phụ thuộc quá nhiều vào dung tích máy cụ thể) nên chưa viết rule mới, tránh bịa số.
4. **Việc rẻ, giá trị cao còn lại**: thiết lập thói quen xem `/admin/dtc-stats` định kỳ (mục 3) — dùng để xác nhận/tinh chỉnh những gì đã research chủ động (mục 1), không phải điều kiện tiên quyết để bắt đầu mở rộng.

---

## Cách cập nhật tài liệu này

Chạy lại khối lệnh sau mỗi khi `dtc_dictionary.json` hoặc `diagnostic_rules.json` (backend) thay đổi, rồi cập nhật số liệu ở trên:

```bash
cd notedri
python3 -c "
import json
d = json.load(open('resources/data/dtc_dictionary.json'))
from collections import Counter
print('Tổng:', len(d))
print('Theo tiền tố:', dict(Counter(c['code'][0] for c in d)))
print('Theo severity:', dict(Counter(c.get('severity') for c in d)))
"
python3 -c "
import json
d = json.load(open('resources/data/diagnostic_rules.json'))
print('Số rule:', len(d['rules']), '| version:', d['version'])
"
```
