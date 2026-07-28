# Nori Agent — Kế hoạch triển khai

> **Trạng thái tài liệu:** Bản kế hoạch (chưa có code). Mục đích: để bất kỳ ai (người hoặc AI agent) đọc vào cũng biết đang làm gì, đã quyết định gì, còn thiếu gì, và nên bắt đầu từ đâu.
>
> **Ngữ cảnh:** NoteDri hiện có 2 repo liên quan — `notedri-app` (Expo/React Native, repo này) và `notedri` (Laravel backend, sibling repo tại `c:\laragon\www\notedri`). Nori Agent cần thay đổi ở **cả hai** repo.
>
> **Nguồn:** Tài liệu này tổng hợp từ phiên brainstorm kiến trúc `_bmad-output/brainstorming/brainstorm-nori-agent-architecture-2026-07-26/brainstorm.html` (11 kỹ thuật, 85 ý tưởng, 1 tổng hợp — xem mục 14) + các quyết định phạm vi/model đã chốt qua trao đổi trực tiếp. Đọc file brainstorm gốc nếu cần chi tiết/lý do đầy đủ của từng ý tưởng; tài liệu này chỉ giữ lại phần đã quyết định hành động.

---

## 1. Tư duy nền tảng

NoteDri **không phải chatbot**. Nori là một **AI Agent** điều khiển các tính năng NoteDri thông qua Tool Calling — giống mô hình XiaoZhi nhưng chuyên biệt cho xe hơi.

Nguyên tắc bắt buộc:

- **Nori không bao giờ tự bịa dữ liệu xe.** Mọi câu trả lời phải bắt nguồn từ: BLE OBD (Vehicle Cache), NoteDri API, hoặc Knowledge Engine.
- **Grounding là hợp đồng ở tầng schema, không phải chỉ dẫn trong prompt.** Đầu ra của LLM chỉ được ở 2 dạng: (a) một `tool_call`, hoặc (b) lời văn diễn đạt lại một kết quả tool đã hoàn tất, trích dẫn `tool_result_id`. Cần một **grounding validator** ở tầng `ConversationManager`: từ chối/lọc bỏ mọi output chứa token giống-số (speed, RPM, tiền...) mà không truy được về một `tool_result_id` cụ thể. Đây là cơ chế kỹ thuật thật, không chỉ là "system prompt dặn dò".
- **LLM không chứa business logic.** LLM chỉ làm 3 việc: hiểu ý định người dùng → chọn tool đúng → diễn đạt kết quả tool thành câu tự nhiên. Business logic (tính toán, ghi dữ liệu, quy tắc chẩn đoán) luôn nằm ở backend Laravel hoặc trong code app hiện có.
- **Transcript tool là nguồn sự thật.** `ConversationManager` lưu lịch sử các lệnh gọi tool (tool_call + tool_result) làm bản ghi chính thức; lịch sử chat văn bản tự do chỉ là lớp hiển thị phái sinh.
- **Không đặt tên là "Chat" trong code.** Dùng đúng bản chất: `NoriAgent`, không phải `ChatScreen`/`ChatService`.
- **Tách lớp Platform Adapter khỏi lớp Agent.** Toàn bộ `ToolRegistry` + `ConversationManager` phải dùng lại được cho các phần cứng tương lai (màn hình ô tô, ESP32/XiaoZhi, Linux) — chỉ thay lớp giao tiếp phần cứng (mic/loa/BLE adapter), không viết lại logic agent. Chi tiết ở mục 8.
- **BLE và AI độc lập nhau.** OBD polling không được phụ thuộc vào có đang chat với Nori hay không, và ngược lại.
- **Mọi giá trị trong Vehicle Cache đều có "tuổi".** Mọi tool trả dữ liệu OBD phải gắn timestamp/staleness, để Nori nói được kiểu "đang chạy 68 km/h (2 giây trước)" thay vì trình bày dữ liệu cũ như hiện tại tuyệt đối.

---

## 2. Hiện trạng codebase (đã khảo sát — không phải giả định)

| Mảnh | Đã có? | Ở đâu | Ghi chú |
|---|---|---|---|
| Vehicle Cache (dữ liệu OBD sống, cập nhật liên tục) | ✅ Có sẵn, gần như tương đương | `src/services/obd/obdLiveMonitor.ts` (781 dòng) | Đây chính là "Vehicle Cache" mà đề xuất kiến trúc yêu cầu — **không viết lại**, chỉ bọc thêm 1 lớp đọc snapshot cho Tool Registry dùng. |
| BLE OBD2 (Vgate iCar Pro) | ✅ Có sẵn, rất đầy đủ | `src/services/obd/BleService.ts`, `ObdReader.ts`, `obdPollingScheduler.ts`, `obdKeepAliveService.ts` | Tự động kết nối khi mở app (đã làm ở commit `87df869`). Chạy trên JS thread của React Native (xem rủi ro ở mục 4). |
| Chẩn đoán DTC + Knowledge (rule engine) | ✅ Có sẵn | `src/services/obd/diagnosticEngine.ts`, `dtcOfflineDictionary.ts`, `diagnosticRulesStore.ts` | Ứng viên cho `KnowledgeClient` — nên bọc thành 1 tool (`knowledge.explainDTC(code)`), xem mục 6. |
| Offline sync queue cho ghi dữ liệu | ✅ Có sẵn, mẫu hình sẵn dùng lại | `src/services/syncQueue.ts`, `src/services/obd/ObdSessionSyncQueue.ts`, `src/services/obd/TripSyncQueue.ts`, `src/services/gps/GpsTripSyncQueue.ts` | Đây chính là mẫu hình cho `OfflineQueue` (mục 7) mà tool ghi kiểu `fuel.create()` cần ở Phase 2 — **tái dùng pattern này**, không thiết kế mới. |
| Speech-to-Text | ✅ Có sẵn, nhưng dùng cho mục đích hẹp | `src/hooks/useVoiceInput.ts` (dùng `expo-speech-recognition`) | Hiện chỉ dùng để đọc số tiền/số lít khi nhập liệu form. Chưa nối vào bất kỳ luồng hội thoại nào, chưa có bước confidence/fallback trước khi coi transcript là sạch. |
| Text-to-Speech | ❌ Chưa có | — | Chưa cài package nào (`expo-speech` chưa có trong `package.json`). |
| LLM (client hoặc backend) | ❌ Chưa có | — | Không có `ANTHROPIC_API_KEY`/OpenAI key, không có endpoint AI nào ở backend Laravel. |
| Tool Registry / Intent Manager / Conversation Manager | ❌ Chưa có | — | Cần xây từ đầu — nội dung chính của tài liệu này. |
| Mascot "Nori" hiện tại | ✅ Có, nhưng chỉ là UI thuần | `src/services/nori/nori.ts`, `noriSummary.ts`, `assets/nori/nori-icon.png` | Logic tâm trạng (mood: happy/warn/urgent) cho card sức khỏe xe ở Home — **không phải AI**, không có LLM. Giữ nguyên, KHÔNG động vào; `NoriAgent` là module mới, tách biệt. |
| REST API layer sẵn có | ✅ Rất đầy đủ | `src/api/*.ts` (vehicles, refuels, odometer, services/maintenance, reminders, timeline, dashboard...) | Đây chính là `NoteDriApi` — tool nào cần ghi/đọc dữ liệu nghiệp vụ sẽ gọi lại các hàm này, **không viết API client mới**. |
| Backend Laravel | ✅ Repo riêng `c:\laragon\www\notedri` | `routes/api.php` (prefix `v1`, `auth:sanctum`), `app/Http/Controllers/Api/V1/*` | Cần thêm route/controller mới cho AI proxy — xem mục 9. |

**Kết luận quan trọng:** phần lớn "OBD Manager" + "Vehicle Cache" trong đề xuất ban đầu **đã tồn tại và đã chạy production**. Việc cần làm KHÔNG phải là xây lại tầng OBD, mà là xây tầng Agent (Tool Registry, Conversation Manager, kết nối LLM) **bọc lên trên** hạ tầng đã có — và **gia cố** hạ tầng đó ở đúng những điểm brainstorm chỉ ra là rủi ro thật (mục 4).

---

## 3. Quyết định kiến trúc đã chốt

Các câu hỏi mở đã được thảo luận và chốt như sau (2026-07-26):

1. **Phạm vi vòng 1 (Phase 1): xây Agent core trước, chưa làm voice.**
   Lý do: STT đã có nhưng TTS và LLM đều chưa có — làm full voice pipeline ngay rủi ro cao vì nhiều mảnh ghép đồng thời. Ưu tiên: `NoriAgent` lõi (Tool Registry + Vehicle Context + Conversation Manager) chạy đúng qua giao diện **chat dạng text** trước, sau đó mới nối STT/TTS vào.

2. **LLM được gọi từ backend Laravel, không gọi thẳng từ app.**
   Lý do: giữ API key an toàn (không nhúng trong APK), tận dụng `auth:sanctum` + rate-limit sẵn có, đúng tinh thần "business logic thuộc backend". App vẫn giữ vai trò thực thi Tool (vì chỉ app mới đọc được BLE/Vehicle Cache tại chỗ) — backend chỉ đóng vai trò "bộ não ngôn ngữ" (hiểu ý định, chọn tool, viết câu trả lời), không thực thi tool.

3. **Model đề xuất: Claude Haiku 4.5 (`claude-haiku-4-5`).**
   Lý do: việc LLM phải làm ở đây chủ yếu là *điều phối* (chọn đúng tool trong danh sách có sẵn, ghép tham số, viết lại kết quả tool thành câu tiếng Việt tự nhiên) — không phải suy luận sâu. Haiku 4.5 làm tốt việc này với chi phí thấp nhất trong dòng model hiện tại ($1 / $5 mỗi triệu token input/output, so với Sonnet 5 $3/$15 hay Opus 5 $5/$25), hỗ trợ đầy đủ tool use qua Messages API. Nếu sau này có ca khó (câu hỏi mơ hồ, cần suy luận nhiều bước) có thể escalate sang Sonnet 5 cho riêng request đó — không cần thiết ở Phase 1.
   → Backend `.env` cần thêm `ANTHROPIC_API_KEY` (chưa có, cần đăng ký/lấy từ team).

---

## 4. Ràng buộc thật cần thiết kế quanh nó

Brainstorm tách rõ ràng buộc **thật** (bắt buộc thiết kế quanh nó) khỏi ràng buộc **tưởng tượng** (có thể gỡ ngay khỏi phạm vi v1). Đây là phần dễ bị bỏ sót nhất nếu chỉ tập trung vào tầng AI.

### Ràng buộc thật

| Ràng buộc | Ảnh hưởng thiết kế |
|---|---|
| **Android Doze & tối ưu pin** | Doze có thể giết poll BLE nền → bắt buộc Foreground Service đàng hoàng kèm notification bền vững, cộng WorkManager dự phòng. Đây là **MUST**, không phải nice-to-have. |
| **Độ trễ LLM khi đang lái** | Gọi cloud LLM cho mọi câu hỏi (kể cả "xe đang chạy bao nhiêu?") là độ trễ không chấp nhận được. → Route các intent tất định phổ biến (`getSpeed`, `getRPM`, `getCoolant`...) qua một matcher nhẹ **trên thiết bị** trước, chỉ gọi LLM khi không khớp mẫu rõ ràng hoặc câu hỏi phức tạp/ghép nhiều ý. |
| **Cabin ồn & STT không chính xác** | Bắt buộc bước xác nhận nhẹ (giọng nói + tín hiệu thị giác/haptic) trước khi thực thi tool mang tính phá huỷ — không bao giờ chỉ dựa vào STT cho hành động không thể hoàn tác. |
| **An toàn khi lái** | Cần một `DrivingSafetyPolicy` chính thức quyết định tool nào được mời dùng khi `speed > 0` (ví dụ: chặn `ocr.scanReceipt` khi đang lái vì cần nhìn màn hình lâu). |
| **Riêng tư vị trí** | Không gửi GPS chính xác/PII nguyên văn cho nhà cung cấp LLM bên thứ ba — chỉ gửi trường đã suy ra (vd "đang ở gần nhà"), trừ khi tool cần geocoding tường minh và người dùng đã đồng ý. |
| **Chi phí API LLM** | Ở quy mô lớn, chi phí theo lượt voice cộng dồn nhanh — cắt ngắn câu hỏi lặp lại trong một phiên ngay ở tầng `ToolRegistry` (dedupe), cân nhắc dùng model rẻ hơn chỉ để format JSON→văn nói nếu cần tối ưu thêm. |

### Ràng buộc tưởng tượng — đã loại khỏi phạm vi v1

- ~~"Wake word phải có ở v1"~~ → Push-to-talk là đủ cho v1, đủ để kiểm chứng Tool Registry/Agent core mà chưa phải giải bài toán khó nhất ngay từ đầu. Wake word xếp vào v2+.
- ~~"Phải hỗ trợ mọi mã DTC ngay lúc ra mắt"~~ → Knowledge Engine có fallback theo mức độ nghiêm trọng (severity-level) cho mã lạ, không chặn việc ra mắt.

---

## 5. Kiến trúc tổng thể (Phase 1 — text-first)

```
User gõ tin nhắn (app)
        │
        ▼
┌───────────────────────────── App (notedri-app) ─────────────────────────────┐
│  NoriAgent  — vòng lặp state machine: Listening → Understanding → Executing → Responding │
│   ├── ConversationManager   (giữ transcript tool-call, điều phối vòng lặp, grounding validator) │
│   ├── ToolRegistry          (khai báo + validate input/output tool theo schema, có version) │
│   ├── VehicleContext        (đọc snapshot từ obdLiveMonitor — KHÔNG tự poll)   │
│   ├── NoteDriApi            (bọc lại src/api/*.ts hiện có)                    │
│   └── KnowledgeClient       (bọc lại diagnosticEngine/dtcOfflineDictionary — cũng là 1 tool) │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                     │ POST /api/v1/ai/nori/chat
                                     │ { messages, tool_results? }
                                     ▼
┌───────────────────────────── Backend (notedri, Laravel) ────────────────────┐
│  AiNoriController                                                            │
│   → gọi Anthropic Messages API (model: claude-haiku-4-5, tool_use)          │
│   → KHÔNG tự thực thi tool, chỉ trả về:                                     │
│        - text trả lời (nếu đã đủ thông tin), hoặc                           │
│        - danh sách tool_calls cần app thực thi                              │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                     │ response: { reply? , tool_calls? }
                                     ▼
        App thực thi tool_calls cục bộ (đọc Vehicle Cache / gọi NoteDriApi)
        Grounding validator kiểm tra: mọi số liệu trong câu trả lời cuối phải
        trích dẫn được 1 tool_result_id — nếu không, coi là lỗi, không hiển thị.
                                     │
                                     ▼
        Gửi tool_results ngược lại backend → lặp lại đến khi có câu trả lời cuối
                                     │
                                     ▼
                     Hiển thị câu trả lời trong NoriChatScreen (text)
```

**Phản hồi hai pha (giải quyết mâu thuẫn "tức thì khi lái" vs "chính xác cần round-trip"):** với câu hỏi cần gọi tool, hiển thị ngay một câu đệm tại chỗ ("để mình kiểm tra..."), rồi thay bằng câu trả lời thật khi tool đã có kết quả — áp dụng từ Phase 1 cho UX chat text, sẽ quan trọng hơn nữa ở Phase 3 (voice).

Ở Phase sau (voice), sơ đồ mở rộng thêm 2 đầu:

```
Mic → VoiceManager (STT, dùng lại useVoiceInput, có bước confidence/fallback) → NoriAgent (như trên) → TTSManager → Speaker
```

---

## 6. Danh sách Tool (Phase 1 — chỉ đọc, chưa có tool ghi dữ liệu)

Mỗi tool trả JSON thuần, map thẳng vào service/API **đã tồn tại**. Mỗi response nên có thêm 2 trường chuẩn hoá dùng chung cho mọi tool đọc Vehicle Cache:

- `age_seconds` (hoặc `as_of` timestamp) — để Nori nói được "68 km/h, 2 giây trước" thay vì trình bày như tức thời tuyệt đối.
- Khi không đọc được dữ liệu (BLE mất kết nối), trả **trạng thái có cấu trúc** thay vì throw lỗi: `{ status: "unavailable", reason: "ble_disconnected" }` — để lớp format LLM viết được câu tự nhiên ("xe hiện không kết nối, bạn bật OBD chưa?") thay vì crash hay im lặng.

| Tool | Nguồn dữ liệu thật | File hiện có | Authority |
|---|---|---|---|
| `vehicle.getLiveData()` | Snapshot đầy đủ từ Vehicle Cache | `obdLiveMonitor.ts` | read-only |
| `vehicle.getSpeed()` | Vehicle Cache | `obdLiveMonitor.ts` | read-only |
| `vehicle.getRPM()` | Vehicle Cache | `obdLiveMonitor.ts` | read-only |
| `vehicle.getCoolant()` | Vehicle Cache | `obdLiveMonitor.ts` | read-only |
| `vehicle.getFuelLevel()` | Vehicle Cache | `obdLiveMonitor.ts` | read-only |
| `vehicle.getBatteryVoltage()` | Vehicle Cache | `obdLiveMonitor.ts` | read-only |
| `vehicle.readDTC()` | Vehicle Cache (mã lỗi thô) | `obdReaderDtcPhase2` | read-only |
| `knowledge.explainDTC(code)` | Giải nghĩa mã lỗi — coi là 1 tool riêng, KHÔNG gộp vào `readDTC()` | `dtcOfflineDictionary.ts`, `diagnosticEngine.ts` | read-only |
| `vehicle.getHealthScore()` | API backend đã có | `src/api/vehicles.ts` → `vehiclesApi.health()` | read-only |
| `vehicle.getTripToday()` | API GPS trips đã có | `src/api/gpsTrips.ts` | read-only |
| `vehicle.getCurrentODO()` | API odometer đã có | `src/api/odometer.ts` | read-only |
| `expense.summary()` | API đã có, chỉ lấy field chi phí NHIÊN LIỆU (`this_month`/`last_month`/`all_time`) | `src/api/dashboard.ts` → `dashboardApi.get()` (xác nhận 2026-07-27, xem mục 15) | read-only |
| `maintenance.getUpcoming()` | API reminders đã có | `src/api/reminders.ts` → `remindersApi.list()` | read-only |
| `insurance.getStatus()` / `inspection.getReminder()` | **Không cần tool riêng** (xác nhận 2026-07-27): `bảo hiểm`/`đăng kiểm` chỉ là 2 giá trị `loai` (`bao_hiem`, `dang_kiem`) trong CÙNG hệ thống reminders - đã trả về sẵn qua `maintenance.getUpcoming()`, lọc theo `eval.reminder.loai` | `app/Services/ReminderService.php` (backend) | read-only |
| `vehicle.getRecentIssues()` | **Thêm 2026-07-27** theo góp ý thực tế (tốc độ/vòng tua lúc đang lái ít giá trị vì đổi liên tục — user ưu tiên hỏi kiểu "tuần qua xe có vấn đề gì không"). TÁI DÙNG đúng pure function mood/top-issue/so sánh tuần của Nori mascot (`noriSummary.ts`), không tự diễn giải lại từ raw DTC events | `src/services/nori/nori.ts`, `src/services/obd/sessionTrend.ts` | read-only |
| `fuel.findNearbyStations()` | **Thêm 2026-07-27**. GPS lấy tại tool layer qua `expo-location`, KHÔNG bao giờ đưa vào nội dung gửi LLM (mục 4) | `src/api/refuels.ts` → `refuelsApi.nearbyStations()` | read-only |
| `ev.findNearbyChargingStations()` | **Thêm 2026-07-28** theo rà soát gap trong `nori-agent-qa-coverage.md` - mirror đúng `fuel.findNearbyStations()`, route backend + hàm client đã có sẵn từ trước, chỉ chưa bọc tool | `src/api/refuels.ts` → `refuelsApi.nearbyCharging()` | read-only |
| `vehicle.getLifetimeCost()` | **Thêm 2026-07-28**. Backend thêm nhánh `?scope=lifetime` cho route `cost-summary` sẵn có, gọi `CostSummary::lifetime()` (đã chạy production ở 3 nơi khác - `DossierController`, `ReportController` x2 - không phải logic mới) | `app/Http/Controllers/Api/V1/VehicleController.php` → `costSummary()` | read-only |
| `fuel.predictNextRefuel()` | **Thêm 2026-07-28**. `/dashboard` đã trả sẵn field `prediction` (`FuelCalculator::predictNextRefuel`) từ trước nhưng bị bỏ qua - chỉ thêm 1 tool đọc field này, không đổi backend | `src/api/dashboard.ts` → field `prediction` | read-only |
| `vehicle.getFuelConsumptionHealth()` | **Thêm 2026-07-28**. Trích organ `tieu_thu` (đã tính sẵn: so baseline gần đây + trần hãng công bố) từ payload `/vehicles/{id}/health` sẵn có, KHÔNG tính lại công thức | `src/api/vehicles.ts` → `vehiclesApi.health()`, organ `key:'tieu_thu'` | read-only |

> Bảng đầy đủ câu hỏi user hay hỏi ↔ mức độ xử lý (kể cả các câu CHƯA có tool): xem `docs/nori-agent-qa-coverage.md`.

**Chưa làm ở Phase 1** (để Phase 2, vì cần luồng hội thoại nhiều lượt kiểu "hỏi lại người dùng" + có `authority: mutating/destructive` → cần xác nhận + khoá thực thi, xem mục 7):

- `fuel.create()`, `fuel.getLatest()` — mutating
- `maintenance.create()` — mutating
- `vehicle.clearDTC()` — **destructive**, bắt buộc `requiresConfirmation: true`
- `ocr.scanReceipt()`, `ocr.scanOdometer()` — mutating
- `navigation.goGarage()`, `user.profile()`, `system.settings()` — read-only nhưng chưa ưu tiên

---

## 7. Module vệ tinh quanh lõi NoriAgent

Ngoài lõi (`ToolRegistry` + `ConversationManager` + `VehicleContext`), brainstorm xác định các module vệ tinh nên tách riêng thay vì nhồi vào lõi. Không phải module nào cũng làm ở Phase 1 — bảng dưới ghi rõ ưu tiên:

| Module | Vai trò | Ưu tiên |
|---|---|---|
| `SafetyPolicy` | Gác cổng duy nhất quyết định tool nào được thực thi/mời dùng theo trạng thái lái xe (`speed`, tương lai: độ ồn cabin, phân biệt hành khách/tài xế). Tách khỏi `ToolRegistry`. | Phase 1 (bản tối giản: chặn theo `speed > 0`) |
| `Observability/Telemetry` | Log mọi lệnh gọi tool, độ trễ, mọi lần LLM cố trả lời ngoài phạm vi — để kiểm toán cam kết "không bịa dữ liệu" trong production. Chỉ phơi số liệu tổng hợp an toàn về riêng tư, không phải transcript thô. | Phase 1 (log tối thiểu), đầy đủ ở Phase 2+ |
| `PermissionManager` | Toggle cấp người dùng (vd: tự động ghi vs luôn xác nhận khi log nhiên liệu) — tách khỏi `SafetyPolicy`. | Phase 2 (đi cùng tool ghi dữ liệu) |
| `PromptTemplateStore` | System prompt của LLM + template format-tool đưa ra ngoài như config có version — tinh chỉnh giọng tiếng Việt của Nori mà không cần release app. | Phase 1 nếu backend hỗ trợ dễ (config DB/env), không blocking |
| `ProactiveTriggerEngine` | Quyết định khi nào Nori lên tiếng không cần hỏi (DTC mới, cột mốc, nhắc nhở đến hạn) — tách khỏi `ConversationManager` mang tính phản ứng. Ngưỡng nên cấu hình được theo người dùng, không hardcode. | v2+ |
| `OfflineQueue` | Tool ghi (`fuel.create`) khi mất sóng được xếp hàng và thử lại — **tái dùng pattern `syncQueue.ts`/`ObdSessionSyncQueue.ts` đã có**, không thiết kế mới. | Phase 2 (đi cùng tool ghi dữ liệu) |
| `MultiVehicleContext` | Module riêng thay vì 1 cờ boolean, đón đầu tài khoản hộ gia đình/fleet. | v2+, nhưng thiết kế `VehicleContext` từ Phase 1 nên đã coi `activeVehicleId` là 1 tham số thay đổi được, không hardcode 1 xe duy nhất |
| `TestHarness`/`MockAdapter` | `NoriAgent.runWithMock(scenarioScript)` — chạy kịch bản hội thoại có sẵn không cần xe thật/BLE thật. | ✅ **Xong 2026-07-28** - `src/agent/platform/TestHarness.ts` (`runScenario`/`runScenarios`) + bộ test Jest thật `src/agent/__tests__/noriAgentHarness.test.ts` (`npm test` tự nhặt). Xem mục 15. |

---

## 8. PlatformAdapter — lợi tức gần, không chỉ đầu tư xa

Đây là phát hiện đồng quy từ nhiều kỹ thuật brainstorm độc lập (Morphological Analysis, Time Horizon Ladder, Nature's Solutions, tổng hợp cuối): ranh giới `PlatformAdapter` trả lợi tức **ngay ở Phase 1** qua mock testing và chế độ chat-văn-bản, không chỉ ở viễn cảnh ESP32/head-unit 10 năm sau — nên **xây từ đầu**, không phải "để sau khi cần đa nền tảng".

- `PlatformAdapter` là hợp đồng I/O thuần khiết, ví dụ 2 interface nhỏ:
  - `IVoiceIO { listen(): Promise<string>; speak(text: string): Promise<void> }`
  - `IVehicleIO { subscribe(cb: (snapshot) => void): Unsubscribe }`
- Adapter cho điện thoại (Phase 1–3) implement bằng `useVoiceInput`/TTS thật + `obdLiveMonitor` thật.
- `MockVehicleAdapter` implement cùng interface bằng dữ liệu giả — dùng ngay để viết `TestHarness`/CI mà không cần xe thật, và để `NoriChatScreen` (text, chưa có voice) hoạt động qua đúng 1 adapter khác (`ITextIO` thay `IVoiceIO`) dùng chung lõi.
- Tương lai (ESP32/XiaoZhi, head-unit Android, Linux) chỉ cần cài lại 2 interface này bằng C/MicroPython hoặc Kotlin — lõi `NoriAgent`/`ToolRegistry` không đổi.
- Kết quả tool nên có thêm trường `renderHint` tuỳ chọn (vd `line_chart` cho `getTripToday`, `gauge` cho `getSpeed`) để adapter có màn hình dùng được nếu muốn, bỏ qua nếu không.

---

## 9. Việc cần làm ở backend Laravel (`c:\laragon\www\notedri`)

Repo Claude Code hiện tại **không thể chỉnh sửa trực tiếp** (cần mở phiên làm việc riêng trong repo đó). Ghi lại đây để người tiếp theo biết cần làm gì:

1. Thêm `ANTHROPIC_API_KEY` vào `.env` / `.env.example` + config (`config/services.php`).
2. Cài `anthropic-ai/sdk` (PHP) qua Composer — theo skill `claude-api` (đọc `php/claude-api/README.md` khi vào phiên backend).
3. Tạo `AiNoriController` (namespace `App\Http\Controllers\Api\V1`), route mới trong `routes/api.php`, nhóm cùng `auth:sanctum`:
   ```
   Route::post('ai/nori/chat', [AiNoriController::class, 'chat'])->middleware('throttle:20,1');
   ```
4. Controller nhận `{ messages: [...], tools: [...] }` từ app, gọi Anthropic Messages API với `model: "claude-haiku-4-5"` + `tools` (định nghĩa JSON schema khớp danh sách ở mục 6), trả về `stop_reason` + `content` gần nguyên bản cho app xử lý vòng lặp tool-calling (xem `shared/tool-use-concepts.md` trong skill `claude-api` nếu cần tham khảo pattern chuẩn).
5. **Không** để backend tự thực thi tool — chỉ forward tool_use blocks về app, nhận lại tool_result từ app ở request tiếp theo.
6. Rate limit + log usage token (để theo dõi chi phí Haiku 4.5 theo user) — nền cho `Observability` ở mục 7.
7. Version cho Tool schema (`toolName@version`) — vì rủi ro gần nhất là hình dạng API backend đổi (`fuel.create`, `maintenance.create`) trước cả khi tính đến chuyện đa nền tảng. Thêm bước validate schema thời gian chạy giữa kết quả tool và lớp format-cho-LLM: báo lỗi to ở dev, xử lý êm ở production.

---

## 10. Việc cần làm ở app (`notedri-app`, repo này)

### 10.1 Cấu trúc thư mục đề xuất

```
src/
  agent/                        ← MỚI, toàn bộ logic Nori Agent nằm đây
    NoriAgent.ts                 orchestrator chính, state machine Listening→Understanding→Executing→Responding
    ConversationManager.ts       transcript tool-call, gọi API backend, vòng lặp tool-calling, grounding validator
    ToolRegistry.ts              đăng ký tool + validate input/output theo schema (có version)
    ToolExecutor.ts              tách vận chuyển tool (REST vs đọc Vehicle Cache) khỏi logic chọn tool
    tools/
      vehicleTools.ts             vehicle.getSpeed/getRPM/... (đọc VehicleContext)
      knowledgeTools.ts           knowledge.explainDTC(code) (đọc KnowledgeClient)
      businessTools.ts            expense.summary, maintenance.getUpcoming... (gọi NoteDriApi)
    safety/
      SafetyPolicy.ts             chặn/mời tool theo trạng thái lái xe (bản tối giản Phase 1: speed > 0)
    platform/
      types.ts                    IVoiceIO, IVehicleIO, ITextIO — hợp đồng PlatformAdapter (mục 8)
      MockVehicleAdapter.ts       adapter giả cho TestHarness/CI, không cần xe thật
    VehicleContext.ts            wrapper mỏng đọc snapshot từ obdLiveMonitor (KHÔNG tự poll)
    NoteDriApi.ts                wrapper gọi lại src/api/*.ts hiện có, KHÔNG viết API mới
    KnowledgeClient.ts           wrapper gọi lại diagnosticEngine/dtcOfflineDictionary
    types.ts                     NoriMessage, NoriToolCall, NoriToolResult, ...
  api/
    nori.ts                      MỚI — gọi POST /api/v1/ai/nori/chat (theo pattern axios client hiện có)
  store/
    noriAgentStore.ts             MỚI — Zustand store trạng thái hội thoại (theo pattern obdSessionStore.ts)
  screens/
    nori/
      NoriChatScreen.tsx          MỚI — màn hình chat TEXT để test Phase 1 (chưa cần voice)
```

Lưu ý đặt tên: không dùng `Chat` cho tên module lõi (`ConversationManager` chứ không phải `ChatManager`), giữ đúng tinh thần "Nori là Agent".

### 10.2 Không làm mới (tái dùng)

- Không viết lại BLE/OBD polling — `VehicleContext` chỉ đọc, không ghi.
- Không viết API client mới cho vehicles/refuels/reminders/... — `NoteDriApi` trong `agent/` chỉ là lớp mỏng gọi lại `src/api/*.ts`.
- Không đổi `src/services/nori/nori.ts` (mood logic của card Home) — đó là tính năng khác, giữ nguyên.
- Không thiết kế `OfflineQueue` mới ở Phase 2 — tái dùng pattern `syncQueue.ts`.

### 10.3 Voice (Phase 3, chưa làm ngay)

- STT: nối `useVoiceInput`/`ExpoSpeechRecognitionModule` (đã có) vào `NoriAgent.sendMessage()`, thêm bước confidence/fallback trước khi coi transcript đủ tin cậy để đi tiếp vào Understanding.
- TTS: cần thêm package (`expo-speech` là lựa chọn built-in đơn giản nhất để bắt đầu — cần đánh giá chất lượng giọng tiếng Việt trước khi quyết định có cần TTS cloud hay không).

---

## 11. Roadmap theo giai đoạn

Nhóm theo hướng đã chọn ở tổng hợp brainstorm: **Ưu tiên ngay** (rủi ro thấp nếu làm sớm, cao nếu bỏ qua) / **Xây hạ tầng trước** (build-the-seam-now-pay-later) / **Hoãn v2+**.

| Phase | Nội dung | Nhóm | Trạng thái |
|---|---|---|---|
| **0** | Tài liệu kế hoạch này | — | ✅ Xong |
| **1** | Backend: endpoint `ai/nori/chat` + Anthropic tool-use loop + grounding validator. App: `NoriAgent` lõi (state machine) + `ToolRegistry` (tool đọc dữ liệu, mục 6, có `age_seconds`/trạng thái unavailable có cấu trúc) + `SafetyPolicy` tối giản + `PlatformAdapter`/`MockVehicleAdapter` (mục 8) + `NoriChatScreen` (text) | Ưu tiên ngay + Xây hạ tầng trước | 🟨 Code xong, chưa test thật (xem mục 15) |
| **2** | Tool ghi dữ liệu qua hội thoại nhiều lượt (slot-filling tổng quát hoá theo schema, không hardcode cây hội thoại): `fuel.create()`, `maintenance.create()`, `vehicle.clearDTC()` (destructive, cần xác nhận + khoá thực thi per-resource). `OfflineQueue` tái dùng `syncQueue.ts`. `PermissionManager` cho toggle tự động ghi vs luôn xác nhận. | — | ⬜ Chưa bắt đầu |
| **3** | Voice: nối STT có sẵn vào `NoriAgent` (qua `IVoiceIO`), thêm `TTSManager`, phản hồi hai pha (câu đệm tức thì → câu trả lời thật). | — | ⬜ Chưa bắt đầu |
| **4** | Wake word, Background service bền vững (foreground service + WorkManager, cân nhắc chuyển `VehicleCache` xuống native Kotlin nếu JS-thread crash vẫn là vấn đề thực tế), `ProactiveTriggerEngine`. | v2+ (đã hoãn có chủ đích) | ⬜ Chưa bắt đầu |
| **5** | Platform Adapter đầy đủ cho phần cứng tương lai (màn hình ô tô Android, ESP32/XiaoZhi, Linux) — dùng lại interface đã định nghĩa từ Phase 1, viết thêm implementation. Hướng kiếm tiền fleet/bảo hiểm (`insurance.shareDrivingScore()`). | v2+ | ⬜ Chưa bắt đầu |

**Ghi chú rủi ro hạ tầng gần hạn (đồng quy từ 4 kỹ thuật brainstorm độc lập):** khả năng chống chịu pin/kết nối (Android Doze, BLE rớt giữa chừng, JS-thread của React Native crash/reload) là rủi ro kỹ thuật gần hạn **có thể lớn hơn cả tầng AI/LLM**. Nếu trong quá trình làm Phase 1–2 phát hiện OBD service hiện tại (chạy trên JS thread) không đủ bền khi có thêm tải từ Nori Agent, cân nhắc đẩy sớm việc chuyển `VehicleCache`/`OBDManager` xuống native Kotlin (foreground service bền vững, phơi JSON-RPC bridge cho JS) thay vì để tới Phase 4.

---

## 12. Câu hỏi còn mở / cần quyết định tiếp

- [x] ~~Xác nhận tên chính xác của endpoint backend cho `expense.summary()`, `insurance.getStatus()`, `inspection.getReminder()`~~ — Đã xong 2026-07-27, xem mục 6 + mục 15.
- [x] ~~Giải pháp TTS cho Phase 3: dùng `expo-speech` (offline, đơn giản) hay TTS cloud~~ — Đã chốt + triển khai 2026-07-27: `expo-speech` (offline, không phí, không cần mạng riêng cho TTS) - xem mục 15.
- [x] ~~Giới hạn rate-limit/chi phí Haiku 4.5 theo user~~ — Đã chốt 2026-07-27: Nori Agent là tính năng Premium (`config/plans.php` + gate cả backend lẫn app-side), cộng `throttle:20,1` ở route - xem mục 15.
- [ ] Wake word (Phase 4) dùng giải pháp nào trên Android — cần nghiên cứu riêng, chưa có hướng.
- [x] ~~Chính sách lưu trữ dữ liệu theo từng loại~~ — **Chốt 2026-07-28** (đề xuất theo yêu cầu user, dựa trên rà soát thật code hiện có, không phải chính sách mới cần xây):
  - **Audio thô**: KHÔNG lưu, không cần code gì thêm - đã đúng mặc định từ trước. App không có bất kỳ chỗ nào ghi file audio (`useVoiceInput.ts` không dùng `expo-av`/`FileSystem` để lưu) - `expo-speech-recognition` chuyển giọng nói thành chữ ngay trên hệ điều hành (Android SpeechRecognizer/Google Speech Services), app chỉ nhận lại TEXT. Quyết định: giữ nguyên, không thêm tính năng ghi âm cho bất kỳ mục đích nào (kể cả debug) trừ khi có yêu cầu rõ ràng + màn hình xin phép riêng.
  - **Transcript câu hỏi**: 2 nơi lưu, xử lý khác nhau:
    - App (`noriAgentStore`, `uiMessages`): chỉ ở RAM (zustand không có `persist` middleware) - tự mất khi tắt app, không cần thêm gì.
    - Backend (`storage/logs/nori.log`, `AiNoriController::chat()`/`feedback()`): ghi 200 ký tự đầu câu hỏi thật của user + rating/note phản hồi, kèm `request_id`. Trước đây `driver: 'single'` = **1 file, KHÔNG BAO GIỜ tự xoá** - tích luỹ vô thời hạn, rủi ro thật (không phải giả định) vì đây thực chất là log câu hỏi người dùng. **Đã sửa** (`notedri` commit tiếp theo): đổi sang `driver: 'daily'`, giữ **30 ngày** (`LOG_NORI_DAYS`, mặc định 30) - đủ dài để soát lỗi/chấm điểm QA trong giai đoạn test hiện tại, có hạn rõ ràng thay vì vô thời hạn. Có thể rút ngắn khi hết giai đoạn test nặng (mục 15 đã ghi chú "xoá channel này khi không cần debug mức này nữa").
  - **Vị trí (GPS)**: xác nhận (không phải quyết định mới) - `fuel.findNearbyStations`/`ev.findNearbyChargingStations` lấy toạ độ TẠI tool layer (`expo-location`), chỉ danh sách trạm (tên/địa chỉ) mới vào `tool_result` gửi LLM - toạ độ thô KHÔNG BAO GIỜ đi qua LLM, đúng như mục 4 đã chốt từ đầu.
- [ ] Matcher tất định trên thiết bị cho các câu hỏi phổ biến (mục 4) — cần thiết kế/luật cụ thể cho tiếng Việt (regex? danh sách mẫu câu? nhỏ hơn cả 1 model on-device?) trước khi implement Phase 1, hay chấp nhận độ trễ LLM ở Phase 1 và tối ưu sau?
- [ ] Có cần Tool SDK/manifest schema chính thức + CLI validate ngay từ Phase 1 (để mỗi tool mới không phải đụng lõi `NoriAgent`), hay để Phase 2 khi số lượng tool tăng lên mới đáng đầu tư?

---

## 13. Cho người/agent tiếp theo

Nếu bạn nhặt việc này lên: đọc mục 3 (quyết định đã chốt), mục 4 (ràng buộc thật) và mục 9–10 (việc cụ thể) trước, đừng thiết kế lại từ đầu — kiến trúc lớn đã được thảo luận và chốt qua brainstorm 11 kỹ thuật. Bắt đầu từ Phase 1: viết `AiNoriController` ở backend trước (vì app cần endpoint này để test), song song viết `PlatformAdapter`/`MockVehicleAdapter` + khung `NoriAgent`/`ToolRegistry` ở app (không phụ thuộc backend để bắt đầu, vì có thể test bằng mock).

---

## 14. Nguồn tham khảo

- `_bmad-output/brainstorming/brainstorm-nori-agent-architecture-2026-07-26/brainstorm.html` — nhật ký đầy đủ 11 kỹ thuật brainstorm (First Principles, Morphological Analysis, SCAMPER, Assumption Reversal, Time Horizon Ladder, Constraint Mapping, Lotus Blossom, Nature's Solutions, Chaos Engineering, Role Playing, TRIZ) + tổng hợp cuối. Mở bằng trình duyệt để xem đầy đủ 85 ý tưởng gốc (tài liệu này chỉ giữ phần đã quyết định hành động).
- `_bmad-output/brainstorming/brainstorm-nori-agent-architecture-2026-07-26/.memlog.md` — nhật ký phiên brainstorm dạng thô.
  **Lưu ý (2026-07-27):** 2 file này hiện KHÔNG tồn tại trong repo (đã kiểm tra `_bmad-output/brainstorming/` chỉ còn `implementation-artifacts`) — nguồn brainstorm gốc coi như đã mất, tài liệu này (đã giữ lại phần quyết định hành động) là nguồn duy nhất còn lại.

---

## 15. Nhật ký triển khai (2026-07-27)

Phase 1 đã viết xong CODE cho cả 2 repo, **chưa chạy thử thật** (chưa có `ANTHROPIC_API_KEY`). Người/agent tiếp theo nhặt việc: đọc mục này trước khi sửa lại từ đầu.

**Backend (`notedri`)** — đi theo convention raw HTTP (`Http::` facade) như `GeminiClient`/`GroqClient` sẵn có, **không cài `anthropic-ai/sdk`** như mục 9.2 gợi ý ban đầu (lệch có chủ đích khỏi bản kế hoạch gốc để khớp 100% pattern LLM integration đã có trong repo — xem `app/Services/Blog/GeminiClient.php`):
- `config/services.php` + `.env`/`.env.example`: entry `anthropic` (api_key/model/base_url).
- `app/Services/Ai/AnthropicNoriService.php`: gọi thẳng `POST {base_url}/messages`, system prompt hardcode (chưa tách PromptTemplateStore), log usage tối thiểu qua `Log::info('nori.chat.usage', ...)`.
- `app/Http/Controllers/Api/V1/AiNoriController.php` + route `POST v1/ai/nori/chat` (`throttle:20,1`, trong group `auth:sanctum`).
- Đã `php -l` sạch cả 4 file.

**App (`notedri-app`)** — toàn bộ `src/agent/` theo đúng cấu trúc mục 10.1, cộng `src/api/nori.ts`, `src/store/noriAgentStore.ts`, `src/screens/nori/NoriChatScreen.tsx`. `npx tsc --noEmit` sạch toàn repo (không riêng file mới).
- `VehicleContext.ts` implement `IVehicleIO` bằng cách LẮNG NGHE `obdLiveMonitor.onSnapshot/onSlowSnapshot` (obdLiveMonitor không có getter đồng bộ, chỉ event listener) — không tự start/stop poll.
- `ConversationManager.ts` có grounding validator THẬT (không chỉ prompt): regex bắt token giống-số trong câu trả lời cuối, đối chiếu với nội dung mọi `tool_result` đã thực thi trong lượt đó — không khớp thì chặn, trả câu an toàn + `console.warn`.
- `NoteDriApi.getExpenseSummary`/`getRecentTrips`/`getServiceHistory` còn đánh dấu TODO ngay trong code — endpoint chính xác chưa xác nhận (đúng câu hỏi mở mục 12), tạm dùng `dashboardApi.get()`/`gpsTripsApi.trips()` nguyên trạng.
- **Chưa đăng ký `NoriChatScreen` vào `AppNavigator.tsx`** — cố ý bỏ qua để không đụng vào cấu trúc stack/tab điều hướng phức tạp sẵn có mà chưa xác nhận; cần thêm 1 dòng `<Stack.Screen name="NoriChat" component={NoriChatScreen} />` ở stack phù hợp (vd `ProfileStack` hoặc màn riêng mở từ Home) trước khi test qua UI thật.

**Việc còn lại trước khi test end-to-end được**:
1. ~~Lấy `ANTHROPIC_API_KEY`~~ — KHÔNG BẮT BUỘC nữa để test lần đầu, xem "Multi-provider" bên dưới (Groq/Gemini free tier, đã có key sẵn trong repo).
2. Đăng ký `NoriChatScreen` vào 1 navigator.
3. Test qua UI thật với xe/BLE thật, hoặc chạy `npm test` (bộ test `TestHarness` tự động, xem mục 15 - 2026-07-28).

**Cập nhật 2026-07-27 (rà lại các endpoint từng đánh dấu TODO trong `NoteDriApi.ts`, đối chiếu trực tiếp code backend):**
- `expense.summary` → xác nhận `/dashboard` (`DashboardController@index`) KHÔNG có endpoint chi phí riêng, chỉ lấy đúng 3 field `this_month`/`last_month`/`all_time` (từ `FuelCalculator::fuelSummary`) thay vì trả nguyên payload trang chủ (tránh rò dữ liệu không liên quan + tốn token). Đây là chi phí **NHIÊN LIỆU**, không gồm bảo dưỡng (chi phí bảo dưỡng gộp nằm ở `CostSummary::lifetime()`, hiện chỉ lộ qua `ReportController@show` theo năm, Premium-gated — không phù hợp làm tool đọc nhanh, để nguyên chưa dùng). Đã đổi tên hàm `NoteDriApi.getExpenseSummary` → `getFuelExpenseSummary` và sửa description tool để LLM không hiểu nhầm là tổng chi phí xe.
- `vehicle.getTripToday` → xác nhận `/gps/trips` (`GpsTripController@index`) không có filter "hôm nay" phía server (chỉ phân trang 20 bản ghi mới nhất). Tự lọc theo ngày ở tầng `NoteDriApi.getTodayTrips()` (so `started_at` với ngày hôm nay), trả về đã tổng hợp sẵn (`trips_count`/`total_km`/`total_driving_seconds`) thay vì đẩy nguyên payload phân trang cho LLM tự đoán ngày.
- `insurance.getStatus()` / `inspection.getReminder()` → xác nhận KHÔNG cần tool riêng: `bao_hiem`/`dang_kiem` chỉ là 2 giá trị `loai` trong CÙNG hệ thống reminders (`app/Services/ReminderService.php`), đã trả về sẵn qua `maintenance.getUpcoming()` — lọc theo `eval.reminder.loai` là đủ.
- Xoá `NoteDriApi.getServiceHistory()` (dead code - viết ra nhưng chưa từng được tool nào gọi tới).
- `npx tsc --noEmit` vẫn sạch sau các thay đổi này.

**Cập nhật 2026-07-27 (multi-provider để TEST MIỄN PHÍ trước khi trả phí Anthropic):**

Backend giờ đổi được "bộ não ngôn ngữ" qua `NORI_LLM_PROVIDER` (`.env`, để trống = Anthropic như cũ) mà **KHÔNG đụng gì tới app/AiNoriController phía ngoài** - app luôn nói chuyện theo đúng 1 shape (Anthropic Messages API), 2 provider còn lại tự dịch 2 chiều bên trong:
- `app/Services/Ai/NoriLlmClient.php` (interface chung) + `NoriSystemPrompt.php` (system prompt dùng chung, tách khỏi `AnthropicNoriService` để không lệch giọng giữa các provider).
- `app/Services/Ai/GroqNoriService.php` — dịch sang OpenAI-compatible chat completions (Groq free tier 1.000 req/ngày, không cần thẻ, dùng chung `GROQ_API_KEY` đã có cho blog). Điểm dễ sai đã xử lý: OpenAI/Groq bắt MỖI tool_result là 1 message `role:"tool"` riêng (Anthropic gộp chung vào 1 message user), khớp qua `tool_call_id`.
- `app/Services/Ai/GeminiNoriService.php` — dịch sang Gemini `generateContent` function calling (dùng chung `GEMINI_API_KEY` đã có cho blog). Điểm dễ sai đã xử lý: role `"model"` thay vì `"assistant"`; Gemini không trả id ổn định cho lệnh gọi tool nên tự sinh id và LƯU LẠI trong content block để lượt sau dựng lại map id→tên hàm cho `functionResponse`; `functionResponse.response` phải là object dữ liệu thật (đã decode lại JSON string của tool_result), không phải chuỗi JSON bọc trong 1 field.
- `AiNoriController` chọn client qua `resolveClient()` (match theo `config('services.nori.provider')`) + log usage tập trung 1 chỗ cho cả 3 provider (tách khỏi từng `NoriLlmClient` để không lặp code).
- `config/services.php` (`nori.provider`) + `.env`/`.env.example` (`NORI_LLM_PROVIDER=`).

**Bug nghiêm trọng bắt được lúc review (đã fix, KHÔNG chỉ ảnh hưởng Groq/Gemini mà cả Anthropic thật):** PHP không phân biệt được JSON object rỗng `{}` với mảng rỗng `[]` sau `json_decode($x, true)` - cả hai đều ra `[]`. 11/12 tool hiện tại không có tham số (`input_schema.properties: {}`), và khi hội thoại nhiều lượt echo lại 1 `tool_use.input: {}` đã gọi trước đó, dữ liệu này bị decode thành `[]` ngay từ `$request->validate()`. Nếu forward thẳng, `Http::post()` re-encode lại thành JSON **array** `[]` thay vì **object** `{}` - JSON Schema bắt buộc `properties`/`input` phải là object, nên khả năng cao MỌI lượt gọi tool không tham số (gần như mọi hội thoại thực tế) sẽ bị Anthropic/Groq/Gemini từ chối request (400). Đã fix bằng `AiNoriController::normalizeToolSchemas()`/`normalizeMessages()` - ép các vị trí này về `stdClass` khi rỗng, TRƯỚC KHI forward tới bất kỳ provider nào (áp dụng chung cho cả 3, không riêng Groq/Gemini). Đã verify lại toàn bộ 3 đường dịch (Groq/Gemini/normalize) qua script PHP mô phỏng dữ liệu thật (Reflection gọi trực tiếp các hàm private) - output JSON đúng `{}` ở mọi vị trí sau fix.

Đã verify: `php -l` sạch toàn bộ file mới/sửa; bootstrap Laravel thật + gọi `AiNoriController::chat()` trực tiếp (không qua HTTP/auth) cho cả 4 case (`anthropic`/`groq`/`gemini`/giá trị lạ) - đều trả JSON 502 gọn gàng khi thiếu key tương ứng, không có exception nào lọt ra ngoài; giá trị lạ rơi đúng về nhánh mặc định Anthropic.

**Cách test miễn phí ngay**: set `NORI_LLM_PROVIDER=groq` (hoặc `gemini`) trong `.env` backend - không cần `ANTHROPIC_API_KEY`, dùng luôn `GROQ_API_KEY`/`GEMINI_API_KEY` đã có sẵn cho blog. Việc còn lại để test qua UI thật vẫn là bước 2-3 ở trên (đăng ký `NoriChatScreen` vào navigator).

**Cập nhật 2026-07-27 (fix 2 lỗ hổng xử lý lỗi + log chẩn đoán riêng cho giai đoạn test):**

- **App**: `ConversationManager.sendMessage()` trước đây KHÔNG bắt lỗi quanh lệnh gọi `noriApi.chat()` - nếu backend trả lỗi (502, mất mạng, timeout...), lỗi sẽ ném xuyên qua `NoriAgent.sendMessage()` (chỉ có `finally`, không `catch`) và `noriAgentStore.sendMessage()` (không có `catch` nào) thành unhandled rejection - user thấy tin nhắn mình gửi đi mà KHÔNG BAO GIỜ có phản hồi, kể cả báo lỗi ("thinking" tự tắt nhưng im lặng hoàn toàn). Đã thêm `try/catch` quanh lệnh gọi, trả câu tiếng Việt báo lỗi mạng thay vì để rơi tự do - đúng nguyên tắc "NoriAgent.sendMessage() luôn resolve, không bao giờ reject" (giống cách lỗi tool đã được xử lý).
- **Backend**: nhánh `catch (\RuntimeException $e)` trước đây chỉ trả JSON cho app, **không hề ghi log** - không có cách nào tra lại sau này provider nào lỗi/lỗi gì nếu không đứng cạnh xem trực tiếp. Đã thêm kênh log RIÊNG `'nori'` (`config/logging.php` → `storage/logs/nori.log`, tách khỏi `laravel.log` để dễ trích xuất) ghi đủ 3 giai đoạn mỗi lượt chat, nối bằng `request_id` (UUID):
  - `request`: provider, số message, số tool, preview tin nhắn user gần nhất.
  - `response` (thành công): `stop_reason`, usage tokens, **tool nào được gọi** + preview text trả lời - để soát "LLM có gọi đúng tool không" mà không cần đọc lại nguyên payload.
  - `error`: message lỗi đầy đủ từ provider.
  - **Cách xem/trích xuất khi có sự cố**: `tail -f storage/logs/nori.log` khi đang test, hoặc `cat storage/logs/nori.log` để copy nguyên đoạn log đưa cho dev/AI xem. File này **KHÔNG** được commit (đã có trong `storage/logs/.gitignore`).
  - Đây là log CHẨN ĐOÁN TẠM THỜI cho giai đoạn test Phase 1 (đúng như đã bàn - xoá được cùng lúc dọn `AiNoriController` khi không còn cần soi chi tiết mức này, không phải hạ tầng Observability lâu dài của mục 7).

**Cập nhật 2026-07-27 (matcher tất định trên thiết bị - đóng câu hỏi mở mục 4/12 - và hệ thống chấm điểm câu trả lời):**

- **`src/agent/LocalIntentMatcher.ts` + `LocalReplyTemplates.ts`** — 14/15 tool giờ có mẫu câu hỏi khớp được TRÊN THIẾT BỊ, trả lời thẳng từ tool_result qua template, **không gọi LLM**. Chỉ `vehicle.getLiveData` chưa có mẫu (câu hỏi "xem hết thông số" ít cố định phrasing). Nguyên tắc: ưu tiên độ chính xác hơn độ phủ — không khớp thì rơi về LLM bình thường, không vỡ gì. Bảng đầy đủ tool nào qua Local/LLM: xem `docs/nori-agent-qa-coverage.md`.
- Test bằng cách **CHẠY THẬT** matcher (viết script độc lập chạy qua `npx tsx`, không chỉ đọc code/tsc) với 14 câu hỏi mẫu gồm cả case dễ gây nhầm ("tốc độ tối đa xe này theo hãng" không được nhầm với "tốc độ hiện tại") — bắt được 3 bug thật: (1) `normalize()` chưa đồng nhất dấu gạch nối nên "công-tơ-mét" không khớp "cong to met", (2) mẫu "sức khoẻ xe" quá cứng khi câu thật là "xe tôi sức khoẻ thế nào" (xe đứng xa "sức khoẻ"), (3) mẫu liền mạch cho `getTripToday` bị trượt khi câu chêm chủ ngữ ("hôm nay TÔI chạy ĐƯỢC bao km") — thêm cơ chế `allOfGroups` (đủ từ khoá, không cần liền kề/đúng thứ tự) để xử lý case này thay vì liệt kê thêm biến thể câu chữ dễ vỡ. Sau fix: 14/14 case test pass.
- **Chấm điểm câu trả lời**: nhấn giữ bọt chat của Nori trong app → Đúng/Một phần đúng/Sai + ghi chú tuỳ chọn → `POST /api/v1/ai/nori/feedback` (mới) ghi vào CÙNG kênh log `nori`, cùng `request_id` với request/response gốc (giờ được trả về trong response cho app, trước đây chỉ dùng nội bộ để nối log) — `grep request_id storage/logs/nori.log` ra trọn 1 case kèm đánh giá thật, không cần bảng DB/migration.
- Đã verify toàn bộ qua Groq thật (chat → request_id → feedback → nối đúng trong log), `tsc --noEmit` sạch (trừ 1 lỗi fixture OBD không liên quan, xem ghi chú dưới), `php -l` sạch.
- **Ghi chú không liên quan Nori**: phát hiện `obd-fixtures/vgate-honda-city-*.json` bị xoá khỏi ổ đĩa (không phải do làm việc trên Nori) - có thể do giải nén file zip "Notedri Bluetooth" đè lên. Không đụng vào, chỉ ghi lại để người tiếp theo biết đây là việc khác, không phải Nori Agent làm hỏng.

**Cập nhật 2026-07-27 (4 vấn đề phát hiện từ build app + test thật trên thiết bị, kèm ảnh chụp màn hình + log production thật):**

- **Bug grounding validator (nghiêm trọng, đã fix)**: chỉ soát tool_result "trong lượt này" - câu hỏi nối tiếp tham chiếu tool_result CŨ ("P0120 có lái tiếp được không" ngay sau khi đã hỏi "P0120 là gì") bị chặn nhầm dù LLM trả lời đúng dựa trên ngữ cảnh đã có, không hề bịa số. `applyGroundingValidator()` giờ quét TOÀN BỘ lịch sử hội thoại (`getAllToolResultContents()`), không chỉ lượt hiện tại. Verify bằng test thuật toán độc lập (2 case: tham chiếu cũ phải qua, bịa số mới phải bị chặn) - cả 2 pass.
- **Bug Groq `tool_use_failed` (log production thật)**: model đôi khi viết lệnh gọi tool dưới dạng text thô thay vì đúng field, Groq trả 400 thay vì cố parse - trước đây bị báo nhầm thành "mất mạng". Đã thêm retry 3 lần trong `GroqNoriService` khi gặp đúng `error.code=tool_use_failed`.
- **Bug bàn phím che input (Android)**: `NoriChatScreen` dùng `behavior=undefined` cho Android (đúng cho form cuộn được ở nơi khác trong app, nhưng SAI cho màn này vì thanh nhập bị ghim cố định ngoài ScrollView) - đổi thành `'height'`, khớp đúng pattern modal đã dùng trong CHÍNH file này.
- **Thiếu câu hỏi mẫu**: thêm 4 chip câu hỏi gợi ý ngay dưới lời chào (ẩn đi sau khi user bắt đầu hỏi).
- **Thiếu tool "tổng tiền bảo dưỡng"**: thêm `maintenance.expenseSummary` + route backend `GET vehicles/{id}/cost-summary` (tái dùng `CostSummary::since()`) - xem mục 6, `docs/nori-agent-qa-coverage.md`.
- **Câu hỏi giọng nói (Phase 3)**: user chọn làm STT+TTS đầy đủ ngay - ĐÃ TRIỂN KHAI cùng ngày (xem bên dưới).

**Cập nhật 2026-07-27 (Phase 3 voice - STT+TTS, sớm hơn dự kiến theo yêu cầu user):**

- Tái dùng NGUYÊN `useVoiceInput` (STT, sẵn có cho nhập ODO/số tiền) - chỉ đổi sang dùng tham số `raw` (transcript gốc) thay vì `parsed` (parser số riêng cho form nhập liệu). Không viết STT wrapper mới.
- Cài mới `expo-speech` (TTS) - **native dependency mới, BẮT BUỘC rebuild app, không chỉ reload JS** (khác các thay đổi JS thuần trước đó trong phiên này).
- `NoriChatScreen`: nút mic (bấm nói, bấm lại để dừng sớm), chỉ tự đọc to trả lời nếu lượt hỏi vừa rồi là giọng nói (gõ chữ thì im lặng), bấm mic lúc Nori đang nói sẽ ngắt lời trước khi nghe (không nghe-nói cùng lúc được).
- **Cố tình CHƯA làm**: "phản hồi hai pha" (câu đệm trước khi tool chạy xong, mục 5 kế hoạch) - đọc thẳng câu trả lời cuối, có thể có độ trễ trước khi Nori bắt đầu nói nếu câu hỏi cần gọi tool. Wake word ("Hey Nori") vẫn để Phase 4 như đã chốt, chưa đụng tới.
- Chưa test thật trên thiết bị (cần rebuild trước).

**Cập nhật 2026-07-27 (Phase 2 — CHỈ 2 tool ghi dữ liệu theo đúng phạm vi user chốt: "phase 2 tạm thời xử lý cho Nori thực hiện ghi ODO và ghi đổ xăng thôi"):**

Cố tình CHƯA làm các mục Phase 2 khác trong plan gốc (`maintenance.create`, `vehicle.clearDTC` - destructive, `ocr.scanReceipt`/`ocr.scanOdometer`) - không tự mở rộng phạm vi.

- **`ToolDefinition` (types.ts)** thêm `confirmationSummary?(input)` - sinh câu tóm tắt tiếng Việt hiển thị ở hộp xác nhận, chỉ cần khi `requiresConfirmation=true`.
- **`ToolExecutor`** giờ nhận thêm `confirmAction?: (toolName, summary) => Promise<boolean>`. Trước khi `execute()` 1 tool có `requiresConfirmation=true`, gọi `confirmAction` và CHỈ chạy tiếp nếu trả về `true`. Không trả `approved` (từ chối, hoặc `confirmAction` chưa được wire) → trả `{status:'cancelled', reason:'user_declined'}` (KHÔNG phải lỗi - LLM tự nói lại là chưa ghi). **Mặc định an toàn**: nếu không có `confirmAction` nào được truyền vào, tool mutating tự động bị từ chối - không bao giờ âm thầm ghi dữ liệu khi chưa có UI xác nhận.
- **`src/agent/tools/writeTools.ts`** (mới) - `odometer.create` (`POST /vehicles/{id}/odometer`) và `fuel.create` (`POST /refuels`), cả 2 `authority:'mutating'`, `requiresConfirmation:true`. Field shape đối chiếu TRỰC TIẾP validation rules thật của `OdometerController::store()`/`RefuelController::validateData()` (không đoán):
  - `odometer.create`: chỉ `odometer` bắt buộc (`ngay`/`ghi_chu` tuỳ chọn, `ngay` mặc định hôm nay phía backend).
  - `fuel.create`: **bắt được bug thật lúc test** - ban đầu tưởng chỉ cần 1 trong 2 số (`so_lit`/`tong_tien`), nhưng `RefuelController::validateData()` thật ra bắt buộc **>= 2 trong 3** (`so_lit`/`gia_lit`/`tong_tien`) - thiếu sẽ 422 "Cần nhập ít nhất 2 trong 3...". Đã sửa lại validate ở tool (kiểm tra ĐỦ 2 trong 3 TRƯỚC khi hỏi xác nhận, tránh hiện hộp xác nhận cho 1 lần ghi chắc chắn fail) + sửa description tool để LLM biết hỏi thêm số thứ 2 nếu user mới cho 1 số.
  - Lỗi 422 có `message` cụ thể từ backend (vd ODO nhỏ hơn mốc đã biết, xe điện không ghi đổ xăng...) được bắt lại thành `{status:'rejected', reason:<message thật>}` - LLM nói lại ĐÚNG lý do cho user thay vì "có lỗi xảy ra" chung chung (theo đúng pattern `err?.response?.data?.message` dùng khắp app).
- **`NoteDriApi`** thêm `createOdometerReading()`/`createRefuel()` - gọi lại `odometerApi.create()`/`refuelsApi.create()` có sẵn, `vehicle_id` của refuel gắn từ `ToolContext`, KHÔNG để LLM tự chọn xe.
- **`SafetyPolicy.BLOCKED_WHILE_DRIVING`** thêm `odometer.create`/`fuel.create` - cả 2 cần nhìn màn hình xác nhận trước khi ghi, cùng lý do đã ghi chú sẵn cho OCR ở đây từ Phase 1.
- **`NoriAgent`** constructor thêm tham số `confirmAction` (tuỳ chọn), truyền xuống `ToolExecutor`.
- **`noriAgentStore`** thêm state `pendingConfirmation`/action `resolveConfirmation()` - `confirmAction` tạo 1 `Promise` mới mỗi lần gọi, resolver giữ ở biến module-scope (không phải zustand state, vì hàm không nên đi qua `set()`), `resolveConfirmation(approved)` gọi resolver rồi dọn state.
- **`NoriChatScreen.tsx`** thêm Modal xác nhận (giống pattern Modal chấm điểm sẵn có trong file) hiện `pendingConfirmation.summary` + 2 nút Đồng ý/Huỷ.
- **`NoriSystemPrompt.php`** thêm đoạn hướng dẫn riêng cho 2 tool ghi: chỉ gọi khi đã có số cụ thể (không tự đoán số), không cần hỏi lại "bạn có chắc" bằng lời (app tự hiện hộp xác nhận), diễn giải đúng `reason` khi tool trả `rejected`/`cancelled`.
- **Cố tình CHƯA làm**: chưa thêm mẫu `LocalIntentMatcher` cho 2 tool này - khác các tool ĐỌC, số liệu ghi vào là dữ liệu thật của xe nên để LLM parse câu tự nhiên (linh hoạt hơn regex) rồi có bước xác nhận UI, thay vì tin tưởng matcher tất định trích số từ câu tự do.
- **Verify thật đã làm** (không chỉ đọc code): dựng `php artisan serve` local + tạo user/xe/token thật qua tinker, `curl` trực tiếp `POST /vehicles/{id}/odometer` và `POST /refuels` với đúng field shape tool sẽ gửi - xác nhận ghi thành công, xác nhận lỗi 422 thật (ODO lùi ngày cũ, xe điện đổ xăng, chỉ 1-trong-3 số xăng) đều có `message` cụ thể tận dụng được. Test thuật toán độc lập (`npx tsx`, không import được `ToolExecutor.ts` thật vì kéo theo `react-native` qua `NoteDriApi`) cho cổng xác nhận: từ chối → không execute + trả `cancelled`; đồng ý → execute; KHÔNG có `confirmAction` → mặc định từ chối (an toàn); tool đọc (`requiresConfirmation=false`) → chạy thẳng không hỏi. Dữ liệu test đã dọn sạch khỏi DB sau khi xong. `npx tsc --noEmit` sạch (trừ lỗi fixture OBD không liên quan đã ghi chú ở mục trên), `php -l` sạch.
- **Bug thật thứ 2 bắt được ngay sau lượt review lại** (trước khi commit): tool description ban đầu viết "`ngay` bỏ trống = mặc định hôm nay" cho CẢ 2 tool - đúng với `odometer.create` (`OdometerController::store()` tự `$data['ngay'] ?? now()->toDateString()`), nhưng **SAI** với `fuel.create` - `RefuelController::validateData()` khai `'ngay' => ['required', ...]`, không có nhánh mặc định nào. Test lại bằng `curl` bỏ hẳn field `ngay` xác nhận đúng lỗi `422 "The ngay field is required."` mọi lần. Vì description cũ bảo LLM có thể bỏ trống, LLM sẽ thường xuyên bỏ trống → mọi lần ghi đổ xăng không kèm ngày cụ thể sẽ FAIL. Fix: `fuel.create` giờ tự điền `dayjs().format('YYYY-MM-DD')` (đúng convention `AddRefuelScreen.tsx`/`AddOdometerScreen.tsx` đang dùng) ở tầng tool khi LLM không cung cấp `ngay`, không dựa vào backend tự lo như odometer. Re-test qua `curl` với ngày tự điền → thành công. `npx tsc --noEmit` sạch lại sau fix.

**Cập nhật 2026-07-27 (4 vấn đề từ build APK + test thật trên thiết bị, ảnh chụp màn hình thật):**

1. **Icon Nori nổi toàn cục đè lên NoriChatScreen (nhìn "xấu"/như lỗi trong ảnh chụp)**: root cause thật KHÔNG phải lỗi CSS của khối chip gợi ý (dù vẫn áp thêm 1 lớp phòng thủ, xem mục 2) - mà là `NoriFloatingButton` (mount 1 lần ở `App.tsx`, sống qua mọi màn hình) không hề biết để tự ẩn khi user ĐANG Ở NGAY TRONG `NoriChatScreen`, nên icon nổi (glow + avatar) đè lên chính giao diện Nori Agent, trông như 1 icon rác/lỗi. Đây cũng CHÍNH LÀ câu hỏi user đã hỏi trước đó ("tại sao không tích hợp vào linh vật Nori") mà trước giờ chưa làm: bấm icon nổi trước đây mở `NoriPopover` (bong bóng TĨNH, chỉ đọc mood/tuần/phiên lái - hoàn toàn tách biệt, không liên quan gì Nori Agent). Đã sửa dứt điểm cả 2 vấn đề cùng lúc:
   - `NoriFloatingButton.tsx`: bấm icon giờ `navigation.navigate('NoriChat')` thẳng vào Nori Agent thật, KHÔNG còn mở `NoriPopover` nữa.
   - Ẩn hẳn icon nổi khi route hiện tại là `'NoriChat'` (dùng `useNavigationState` + hàm đệ quy `getActiveRouteName` lấy đúng route TRONG CÙNG đang active, kể cả qua nhiều lớp navigator lồng nhau - pattern chuẩn theo tài liệu React Navigation).
   - Xoá hẳn `NoriPopover.tsx` (không còn nơi nào import) - đúng yêu cầu "bỏ logic Nori cũ đi, thay bằng Nori Agent vào".
   - Verify: `npx tsc --noEmit` sạch. Chưa test lại trên thiết bị thật (cần build APK mới).
2. **Lớp phòng thủ CSS cho khối chip gợi ý** (dù bug #1 mới là nguyên nhân chính khiến ảnh "trông xấu"): `ScrollView` ngang bọc các chip thiếu `alignItems` trên `contentContainerStyle` - mặc định flexbox `alignItems:'stretch'` khiến MỌI chip bị kéo cao bằng chiều cao khả dụng của ScrollView thay vì cao vừa đúng chữ bên trong (lỗi RN kinh điển với ScrollView ngang). Thêm `alignItems:'flex-start'` + `style={{flexGrow:0, flexShrink:0}}` trên ScrollView, và `style={{flex:1}}` cho `FlatList` (danh sách tin nhắn) - đúng chuẩn, không phụ thuộc bug #1 có xảy ra hay không.
3. **Giọng nói bị tách rời từng cụm từ thành nhiều tin nhắn** (ảnh chụp: "tiền" / "tiền xăng" / "tiền xăng tháng" / "tiền xăng tháng 6" hiện thành NHIỀU bọt chat rời rạc) - root cause: `useSpeechRecognitionEvent('result', ...)` trong `useVoiceInput.ts` gọi callback (gửi tin nhắn) NGAY mỗi lần có sự kiện 'result', dù đã đặt `interimResults:false` - thiết bị Android vẫn có thể bắn NHIỀU 'result' trong CÙNG 1 phiên nghe khi câu dài có khoảng dừng giữa các từ. Đã sửa: chỉ LƯU transcript mới nhất mỗi lần 'result', và CHỈ gọi callback 1 LẦN DUY NHẤT khi phiên nghe thật sự kết thúc (`'end'`) - hook dùng chung cho cả nhập ODO/refuel bằng giọng ở nơi khác trong app nên fix này áp dụng lợi cho MỌI nơi dùng `useVoiceInput`, không riêng Nori.
4. **Bug dữ liệu thật đi kèm bug #3**: hỏi "tiền xăng tháng 6" nhưng trả lời "tháng này" (sai) - 2 nguyên nhân cộng dồn: (a) bug #3 khiến câu hỏi bị cắt cụt thành nhiều lượt trước khi câu đầy đủ được gửi, (b) **bug thật độc lập trong `LocalReplyTemplates.ts`**: case `expense.summary` LUÔN đọc `result.this_month`, bỏ qua hẳn `result.last_month` dù dữ liệu đã có sẵn trong tool_result - tài liệu QA coverage trước đó từng ghi nhầm là code đã "trả cả this_month/last_month/all_time cùng lúc", thực tế KHÔNG đúng. Đã thêm `resolveRequestedMonth(userText)` (tái dùng `normalize()` export từ `LocalIntentMatcher.ts`) nhận diện "tháng này"/"tháng trước"/số tháng cụ thể (so với tháng thật hôm nay+tháng trước qua `new Date()`) → trả đúng `this_month`/`last_month`/cả 2 (câu hỏi so sánh)/hoặc thẳng thắn báo "chưa hỗ trợ" nếu hỏi 1 tháng xa hơn (backend chỉ có this_month/last_month/all_time, không có API cho tháng bất kỳ). Verify thật: test 6 case qua `npx tsx` import thẳng `LocalReplyTemplates.ts` (module không phụ thuộc react-native nên import trực tiếp được, không cần viết lại thuật toán) - cả 6 case pass.
5. **"Ghi ô đô" bị nghe nhầm thành "đi ô tô" hay từ khác** - đây là lỗi ở TẦNG ENGINE NHẬN DIỆN GIỌNG NÓI (STT của thiết bị/expo-speech-recognition), app KHÔNG kiểm soát được từ điển nhận diện của engine đó, nên KHÔNG THỂ sửa tận gốc ở code. Đã giảm nhẹ bằng 2 hướng:
   - Thêm chip gợi ý "Ghi công-tơ-mét xe tôi" (hiện ngay khi mở màn hình) - DẠY user nói/gõ đúng cụm "công-tơ-mét" (thuật ngữ app đã dùng nhất quán ở `AddOdometerScreen`) thay vì từ vay mượn "ODO" dễ bị nghe nhầm hơn nhiều.
   - `NoriSystemPrompt.php` thêm hướng dẫn: (a) "ODO"/"công-tơ-mét"/"số km"/"đồng hồ km" là đồng nghĩa; (b) nếu câu hỏi có vẻ lộn xộn/không chắc ý định, PHẢI hỏi lại xác nhận thay vì đoán bừa hay im lặng.
   - **Test thật qua Groq cho thấy hướng dẫn (b) KHÔNG được tuân theo chắc chắn**: thử câu mô phỏng "đi ô tô 15000" - Groq (model nhỏ/free tier) vẫn tự tin gọi thẳng `odometer.create({odometer:15000})` thay vì hỏi lại xác nhận. Đây là **giảm nhẹ một phần, KHÔNG PHẢI fix triệt để** - model nhỏ không tuân theo hướng dẫn tinh tế này 100% các lần, và bản thân câu "đi ô tô 15000" cũng không hoàn toàn vô lý để suy luận ra ý ghi ODO. Cần theo dõi thêm qua feedback rating thật trên thiết bị; nếu vẫn thường xuyên sai, cân nhắc chuyển provider mặc định sang Anthropic (tuân theo instruction tốt hơn) cho riêng bước phân loại ý định, hoặc thêm bước xác nhận Ở TẦNG APP (không chỉ dựa vào LLM tự hỏi lại) trước khi hiện Modal xác nhận ghi.
- Đã dọn dữ liệu test khỏi DB, `npx tsc --noEmit` + `php -l` sạch cho toàn bộ thay đổi trên.

**Cập nhật 2026-07-27 (rà soát độ sẵn sàng hỏi-đáp thường ngày + đánh giá Groq/Gemini + fix bàn phím "triệt để hơn", theo yêu cầu user):**

**A. Khoảng trống Q&A tìm được qua rà soát code thật (không phải suy đoán) - CHƯA làm, chỉ ghi nhận:**
1. "Xe tôi có ăn xăng nhiều hơn bình thường không?" - test thật qua Groq cho kết quả xấu (LLM tự bịa tên tool `fuel.read` không tồn tại vì không có tool nào trả lời được). Dữ liệu THẬT ĐÃ CÓ SẴN ở backend (`FuelCalculator::consumptionHealth()` - đã tính vào health score qua `VehicleHealthScore.php`) nhưng KHÔNG có tool nào lộ ra con số cụ thể (L/100km hiện tại, baseline, % chênh lệch) - chỉ ẩn trong health score tổng, không trả lời được câu hỏi CỤ THỂ về xăng.
2. "Khi nào tôi cần đổ xăng tiếp?" - `FuelCalculator::predictNextRefuel()` đã tính sẵn và ĐÃ CÓ TRONG response `/dashboard` (field `prediction`) - `NoteDriApi.getFuelExpenseSummary()` đã gọi đúng endpoint này rồi nhưng code hiện tại CHỈ lấy `this_month/last_month/all_time`, bỏ qua `prediction` - việc thêm tool này rất nhỏ (dữ liệu đã có sẵn trong response đang gọi).
3. "Lần bảo dưỡng gần nhất của tôi là khi nào?" (lịch sử bảo dưỡng, khác `maintenance.getUpcoming` chỉ có SẮP TỚI) - `ServiceLogController::index()` đã tồn tại sẵn, chưa có tool nào wrap.
- Cả 3 đều là bổ sung NHỎ (dữ liệu/endpoint đã có sẵn, không cần code backend mới) nhưng CHƯA làm - chờ user xác nhận có muốn làm tiếp không (nằm ngoài phạm vi Phase 1/2 đã chốt trước đó).

**B. Đánh giá Groq/Gemini cho dùng thật (không chỉ test nhanh)** - user hỏi vì CŨNG đang dùng 2 provider này tạo blog hàng ngày:
- **Phát hiện quan trọng nhất**: `services.groq.*`/`services.gemini.*` trong `config/services.php` là CÙNG 1 bộ config (model/api_key) cho CẢ Nori LẪN blog generator (`app/Services/Blog/GroqClient.php`/`GeminiClient.php`) - dùng CHUNG quota, KHÔNG tách riêng. Nếu Nori có nhiều user chat cùng lúc job blog chạy, sẽ TRANH quota với nhau.
- **Bằng chứng thật đã gặp**: lúc test Phase 2 (nhiều lượt curl liên tiếp trong ~1 phút), Groq trả lỗi thật `429 rate_limit_exceeded` - "Limit 12000, Used 11419... tokens per minute" - free tier Groq (model `llama-3.3-70b-versatile`) giới hạn 12.000 TPM, RẤT DỄ chạm nếu nhiều user chat cùng lúc (mỗi lượt tool-calling tốn ~1.500 token do phải gửi kèm toàn bộ tool schemas).
- Groq KHÔNG tuân theo chắc chắn hướng dẫn tinh tế trong system prompt (xem mục A.5 phần trước - test "hỏi lại khi không chắc" không ăn) - phù hợp cho câu hỏi đơn giản, RỦI RO hơn cho tình huống cần suy luận cẩn thận (đặc biệt các tool GHI dữ liệu).
- Gemini (`gemini-2.5-flash`) CHƯA test được thật lúc viết báo cáo đầu (thiếu `GEMINI_API_KEY` ở `.env` local) - user cung cấp key ngay sau đó, test thật liền phát hiện **2 BUG NGHIÊM TRỌNG CHƯA TỪNG BỊ PHÁT HIỆN** (đường Gemini chưa bao giờ THỰC SỰ chạy được tool-calling từ lúc viết code tới giờ, chỉ mới code-review):
  1. **`GeminiNoriService.php` gửi thẳng `input_schema` (shape Anthropic) cho Gemini** - Gemini function-calling chỉ hỗ trợ 1 tập con OpenAPI Schema, KHÔNG có khoá `additionalProperties` (MỌI tool của Nori đều có khoá này) → Gemini trả 400 "Unknown name additionalProperties... Cannot find field" cho MỌI lượt chat có gửi kèm tools (tức là MỌI lượt chat, luôn luôn). Fix: thêm `sanitizeSchemaForGemini()` đệ quy xoá khoá này trước khi map thành `parameters`, chỉ áp dụng riêng cho Gemini (Anthropic/Groq vẫn nhận `input_schema` gốc, họ hỗ trợ khoá này bình thường).
  2. **Sau khi fix bug 1, lộ ra bug thứ 2 nặng hơn**: content block cho `functionCall` trong `GeminiNoriService::chat()` THIẾU HẲN khoá `type` (chỉ có `id`/`name`/`input`, không có `'type' => 'tool_use'`) - trong khi `ConversationManager.ts` (app) lọc tool_use bằng đúng `b.type === 'tool_use'`. Hậu quả: `stop_reason` trả đúng là `'tool_use'` nhưng app KHÔNG BAO GIỜ nhận ra có tool nào được gọi → vòng lặp tool-calling chạy tới hết `MAX_TOOL_LOOP_ITERATIONS` (6 lượt gọi API) rồi rơi vào câu "xử lý quá nhiều bước" - **tốn gấp 6 lần quota** (Gemini free tier CHỈ 20 request/ngày, DÙNG CHUNG với blog) mà KHÔNG BAO GIỜ trả lời được câu hỏi cần tool nào. Fix: thêm `'type' => 'tool_use'` vào content block đó.
  - **Verify thật** (tiết kiệm quota - chỉ 3 request cho toàn bộ quá trình fix+verify, còn dư quota cho blog hôm nay): request 1 xác nhận đúng lỗi 400 additionalProperties; request 2 (sau fix 1) lộ đúng bug thiếu `type`; request 3 (sau cả 2 fix) chạy đúng trọn vẹn - Gemini gọi `odometer.create`, nhận tool_result, trả lời tự nhiên "Đã ghi nhận số công-tơ-mét 21.500 km." `php -l` sạch.
  - **Ý nghĩa quan trọng**: TRƯỚC lần test này, Gemini chưa bao giờ được xác nhận hoạt động thật với tool-calling - tài liệu trước đó (mục 15, đợt multi-provider) chỉ verify được "trả lỗi 502 gọn gàng khi thiếu key", KHÔNG verify được đường tool-calling thật sự chạy đúng. Đây là bài học: "code đã viết + đã review" KHÔNG đồng nghĩa "đã hoạt động" - đặc biệt với tích hợp bên thứ 3 có shape dữ liệu khác biệt (Gemini khác Anthropic/Groq nhiều nhất trong 3 provider).
- **Khuyến nghị cập nhật sau khi có bằng chứng thật**: Gemini giờ ĐÃ chạy được tool-calling đúng (sau 2 fix trên). Nhưng quota 20 request/ngày (dùng chung với blog - xem comment trong `.env`: "Groq DỰ PHÒNG khi Gemini hết quota 20 req/ngày") quá thấp để làm provider MẶC ĐỊNH cho Nori production - dùng Gemini cho Nori sẽ cạnh tranh trực tiếp với quota ít ỏi của blog. Groq (1.000 req/ngày, xem comment `.env`) rộng rãi hơn nhiều nhưng vẫn CHUNG quota TPM với blog khi Gemini fallback sang Groq. Vẫn giữ khuyến nghị: production user thật nên dùng `NORI_LLM_PROVIDER=anthropic` (tách quota hoàn toàn khỏi blog), Groq/Gemini chỉ hợp cho test miễn phí giai đoạn này.

**C. Bàn phím che input - rà soát sâu hơn ("height" trước đó chưa triệt để)**: phát hiện `android/app/src/main/AndroidManifest.xml` ĐÃ khai `android:windowSoftInputMode="adjustResize"` từ trước - nghĩa là HỆ ĐIỀU HÀNH ĐÃ TỰ co cửa sổ app khi bàn phím mở. Dùng `KeyboardAvoidingView behavior="height"` ĐỒNG THỜI với `adjustResize` là tổ hợp hay gây lỗi theo tài liệu RN/Android (JS tự tính lại height dựa theo sự kiện bàn phím, CHỒNG lên phần OS đã tự co - dễ ra co 2 lần/giật hình tuỳ loại bàn phím) - có thể đây là lý do fix trước chưa "triệt để". Đã đổi:
- `NoriChatScreen.tsx`: Android giờ `behavior={undefined}` (để OS tự lo qua `adjustResize`, không chồng JS lên) - kết hợp với `FlatList style={{flex:1}}` đã fix ở đợt trước (mục 2) để danh sách tin nhắn tự co đúng theo cửa sổ co lại, đẩy thanh nhập lên sát bàn phím tự nhiên. iOS giữ nguyên `padding` (không có cơ chế tương đương `adjustResize`).
- `app.json`: thêm `android.softwareKeyboardLayoutMode: "resize"` (trước đây KHÔNG khai ở đây, chỉ có sẵn trong file native đã generate) - để lần `expo prebuild` sau này không bị mất cấu hình này (native folder có thể bị ghi đè từ config gốc).
- **Đây là suy luận đúng theo tài liệu RN/Android, KHÔNG tự kiểm chứng được bằng mắt** (môi trường này không có thiết bị/simulator) - cần user build lại và test thật trên máy để xác nhận đã hết hẳn. Nếu vẫn còn vấn đề sau lần test này, phương án dự phòng mạnh hơn là thư viện `react-native-keyboard-controller` (tài liệu Expo phiên bản hiện tại của app khuyến nghị dùng cho đúng use-case này) - nhưng đó là dependency native mới, cần rebuild, nên chưa tự ý thêm mà chờ xác nhận nếu cách trên chưa đủ.

**Cập nhật 2026-07-27 (chuyển đổi tự động Groq<->Gemini khi hết quota, theo yêu cầu user: "linh hoạt chuyển đổi... vì có thể sẽ hết tier"):**

- **`app/Services/Ai/NoriRateLimitedException.php`** (mới) - exception riêng cho lỗi 429, mang theo tên provider. Tách khỏi `RuntimeException` chung (sai cấu hình/bug thật) vì CHỈ 429 mới đáng tự chuyển provider - lỗi khác đổi provider không giải quyết được gì, chỉ che giấu vấn đề thật.
- **`GroqNoriService`/`GeminiNoriService`**: khi response `status() === 429`, ném `NoriRateLimitedException` (kèm tên provider) thay vì `RuntimeException` chung như trước.
- **`AiNoriController::chat()`**: thêm `catch (NoriRateLimitedException $e)` (PHẢI đứng TRƯỚC catch `\RuntimeException` chung vì kế thừa từ nó - PHP khớp catch theo thứ tự khai báo) - tự gọi `fallbackProvider()` (groq↔gemini, KHÔNG rơi xuống anthropic vì đó là trả phí, không tự động chuyển sang) và thử lại NGAY TRONG CÙNG 1 request, hoàn toàn trong suốt với app (app không cần biết đã đổi provider). Nếu CẢ 2 đều hết quota, trả 502 với thông báo rõ "cả 2 đều lỗi" thay vì chỉ báo lỗi provider đầu tiên (dễ gây hiểu lầm provider dự phòng cũng available mà không thử).
- **Verify thật KHÔNG tốn quota** (dùng `Http::fake()` bootstrap Laravel thật, gọi thẳng `AiNoriController::chat()` - không qua mạng thật, không đụng tới 20 req/ngày ít ỏi của Gemini):
  1. Groq fake 429, Gemini fake thành công → response 200 đúng nội dung Gemini trả (xác nhận qua cả `sanitizeSchemaForGemini`/field `type` đã fix ở trên).
  2. CẢ 2 fake 429 → response 502 với message "Cả groq lẫn gemini đều đang lỗi/hết quota...".
  3. Groq fake lỗi 500 (KHÔNG phải 429) → xác nhận Gemini KHÔNG bị gọi (dùng `Http::recorded()` liệt kê đúng danh sách request đã gửi) - lỗi thật không nên tự động che bằng cách đổi provider.
  - Cả 3 case đúng như thiết kế. `php -l` sạch toàn bộ file mới/sửa.

**Cập nhật 2026-07-27 (Nori Agent chính thức là tính năng Premium - quyết định của user):**

- **`config/plans.php`**: thêm `'nori_agent'` vào `premium_features` (cùng danh sách với `email_reminders`/`gas_finder`/`export`).
- **`AiNoriController::chat()`**: chặn NGAY ĐẦU HÀM (trước cả `$request->validate()`, đỡ tốn công xử lý/không gọi LLM cho user Free) bằng `$request->user()->canUse('nori_agent')` - trả đúng shape response `403 + premium_required:true` đã dùng cho `gas_finder`/`export` (xem `RefuelController::nearbyStations()`), KHÔNG bịa shape lỗi riêng.
- **Lỗ hổng thật phát hiện lúc làm** (không phải suy đoán): `LocalIntentMatcher` trả lời THẲNG app-side, KHÔNG đi qua `/ai/nori/chat` - nếu chỉ chặn ở backend, user Free vẫn "lách" được vào 14/15 tool đọc miễn phí qua các câu hỏi khớp mẫu local (vd "xe tôi sức khoẻ thế nào" vẫn trả lời được dù chưa Premium). Đã chặn THÊM ở `noriAgentStore.sendMessage()` (app-side, đọc `useAuthStore().user?.is_premium`) TRƯỚC khi gọi `agent.sendMessage()` - chắn cả 2 đường (local lẫn LLM) cho user Free.
- **`ConversationManager.ts`**: catch block quanh `noriApi.chat()` giờ nhận diện riêng `403 + premium_required` (khác lỗi mạng chung) - trả đúng câu "Nori hiện là tính năng Premium..." thay vì báo nhầm "mất mạng, kiểm tra lại" cho user Free lỡ gọi được tới LLM path (vd nếu app-side gate ở trên bị bỏ qua vì lý do gì đó - phòng thủ 2 lớp).
- **Verify thật**: dựng `php artisan serve` local, tạo user Free (mặc định `plan` không set = `'free'` qua `User::planName()`) → gọi `/ai/nori/chat` → đúng 403 `premium_required:true`. Set `$user->plan = 'premium'; $user->save()` (lưu ý: `plan` KHÔNG nằm trong `$fillable` của `User` - `update(['plan'=>...])` bị bỏ qua ÂM THẦM, phải gán trực tiếp `$user->plan = ...` mới có tác dụng - bug thật gặp lúc test, không phải chủ đích thiết kế) → cùng user gọi lại → 200, Groq trả lời bình thường. Dọn dữ liệu test xong. `php -l`/`npx tsc --noEmit` sạch.
- **Cố tình CHƯA làm**: không ẩn icon nổi/menu Profile khỏi user Free (vẫn thấy được, mở được màn hình, chỉ chặn lúc GỬI tin nhắn) - theo đúng convention sẵn có trong app (`ExportDataScreen.tsx`: để user thử, báo 403 kèm gợi ý nâng cấp, không ẩn hẳn entry point). Không tự thêm nút "Nâng cấp ngay" bấm được trong bọt chat (chỉ có text) - nếu cần CTA bấm được thì đây là việc mở rộng UI riêng, chưa làm.

**Cập nhật 2026-07-27 (bấm icon Nori nổi giờ mở popup hỏi-đáp nhanh TẠI CHỖ thay vì chuyển hẳn sang NoriChatScreen - góp ý user: "đã triển khai giọng nói rồi thì cứ ở nguyên màn hình đâu cần qua page chat"):**

- **`src/agent/useInitNoriAgent.ts`** (mới) - tách logic khởi tạo NoriAgent (resolve `activeVehicleId` ưu tiên OBD session → xe đang chọn → xe mặc định, y hệt logic cũ trong `NoriChatScreen.tsx`) thành 1 hook dùng chung, vì giờ có 2 nơi cần gọi `init()` (trang đầy đủ VÀ popup mới). `init()` tự no-op nếu agent đã tồn tại nên gọi từ cả 2 nơi an toàn - dùng CHUNG 1 `useNoriAgentStore`, hội thoại bắt đầu ở popup rồi mở rộng sang trang đầy đủ (hoặc ngược lại) vẫn liền mạch vì là cùng 1 transcript thật.
- **`src/components/nori/NoriQuickPopover.tsx`** (mới) - popup nổi ngay tại màn hình hiện tại (không điều hướng đi đâu): mở ra tự động BẤM MIC LUÔN (đúng mental-model "trợ lý giọng nói" - bấm phát là nói được ngay, không cần thêm 1 lượt bấm mic nữa), chỉ hiện tin nhắn CUỐI CÙNG (không phải cả lịch sử - popup nhỏ, xem lại nhiều lượt/chấm điểm/gõ câu hỏi mẫu vẫn cần trang đầy đủ), LUÔN đọc to câu trả lời (TTS) bất kể gõ hay nói - khác `NoriChatScreen` (nơi gõ chữ phổ biến ngang giọng nói nên chỉ đọc to khi hỏi bằng giọng). Có nút "Mở rộng" (icon expand) điều hướng sang `NoriChatScreen` khi cần gõ chữ/xem lịch sử/chấm điểm.
  - **Xác nhận ghi dữ liệu (Phase 2) KHÔNG vẽ trong popup**: nếu `pendingConfirmation` khác null trong lúc popup đang mở, tự động đóng popup + điều hướng sang `NoriChatScreen` (đã có sẵn Modal xác nhận rõ ràng) - tránh bấm nhầm Đồng ý/Huỷ ghi dữ liệu thật trong 1 popup nhỏ, dễ thao tác lệch.
  - Đóng popup lúc đang nghe dở thì dừng STT ngay (`stopListening()`), không để phiên nghe treo lơ lửng sau khi UI đã biến mất.
- **`NoriFloatingButton.tsx`**: bấm icon giờ mở `NoriQuickPopover` (state `showPopup`) thay vì `navigation.navigate('NoriChat')` như bản trước đó cùng ngày. Ẩn icon nổi khi popup đang mở (thêm điều kiện `!showPopup`, cùng lý do đã ẩn khi đang ở `NoriChatScreen`) - không hiện icon đè lên popup của chính nó.
- **`NoriChatScreen.tsx`**: đổi sang dùng `useInitNoriAgent()` dùng chung thay vì lặp lại logic khởi tạo tại chỗ - hành vi y hệt cũ, chỉ gọn code.
- **Cố tình CHƯA làm / chưa verify được**: đây là thay đổi UI/hook thuần RN (Modal, PanResponder, Animated, lifecycle hooks) - KHÔNG có cách nào test tự động qua `npx tsx` như các module logic thuần (khác `LocalReplyTemplates.ts`) vì phụ thuộc trực tiếp `react-native`/`expo-speech`/`expo-speech-recognition`. Chỉ verify được bằng `npx tsc --noEmit` (sạch) + đọc lại code cẩn thận - **cần user build lại và test thật trên thiết bị** để xác nhận trải nghiệm popup mượt, không bị lỗi lifecycle (vd 2 nơi cùng gọi `useInitNoriAgent()` có tranh chấp gì không, TTS/STT có chồng lẫn không giữa popup và trang đầy đủ nếu chuyển qua lại nhanh).

**Rà soát thêm theo yêu cầu user ("xử lý đảm bảo không bug tiềm ẩn hoặc code ảnh hưởng tới chức năng khác") - 2 vấn đề thật tìm được, cả 2 đã sửa:**

1. **User Free bị xin quyền micro TRƯỚC KHI biết cần Premium** - `NoriQuickPopover` mở ra tự động bấm mic ngay, nhưng gate Premium thật (`noriAgentStore.sendMessage()`) chỉ chặn lúc GỬI tin nhắn - nghĩa là user Free vẫn bị xin quyền micro + nói xong xuôi mới biết cần nâng cấp (trải nghiệm ngược, xin quyền micro xâm phạm hơn nhiều so với 1 lời từ chối API thường). Đã sửa: `NoriQuickPopover` tự kiểm tra `useAuthStore().user?.is_premium` TRƯỚC khi tự động nghe/cho bấm mic - user Free mở popup thấy ngay thông báo cần Premium (đọc to luôn, đúng tinh thần "popup luôn đọc to"), mic bị vô hiệu hoá, KHÔNG xin quyền. Gõ chữ vẫn hoạt động bình thường (rơi vào đúng gate ở `sendMessage()`, giống `NoriChatScreen`) - chỉ mic là có xin quyền mới cần chặn sớm.
2. **Bug ảnh hưởng tính năng KHÁC (nhập ODO/đổ xăng bằng giọng nói)**: `NoriQuickPopover` giờ giữ 1 instance `useVoiceInput()` sống XUYÊN SUỐT phiên app (mount ngay khi có `token`+`vehicleId`, không riêng lúc mở popup) - phát hiện lúc rà soát: sự kiện native của `expo-speech-recognition` (`useSpeechRecognitionEvent`) là TOÀN CỤC (1 module singleton, mọi instance JS đang mount đều nhận được MỌI sự kiện, không chỉ instance đã gọi `start()`). Handler `'end'` trong `useVoiceInput.ts` đã có sẵn guard `if (s !== 'listening') return s` để chỉ phản ứng đúng phiên nghe CỦA CHÍNH NÓ - nhưng handler `'error'` thì KHÔNG có guard này. Hậu quả: 1 lỗi giọng nói HOÀN TOÀN KHÔNG LIÊN QUAN (vd "không nghe thấy gì" lúc user nhập ODO thủ công ở `AddOdometerScreen`) sẽ làm MỌI instance `useVoiceInput()` đang mount - kể cả instance của `NoriQuickPopover` đang ẩn - cũng bị đẩy sang status `'error'`, khiến lần sau mở popup Nori sẽ KHÔNG tự nghe được nữa (điều kiện tự nghe yêu cầu status `'idle'`) kèm hiện nhầm thông báo lỗi của màn hình khác. Bug này vốn đã LATENT sẵn trong `useVoiceInput.ts` từ trước (2 màn hình cùng dùng voice input đồng thời mount trong stack điều hướng đã có thể gặp), nhưng việc thêm 1 instance sống MÃI MÃI xuyên suốt app khiến nó gần như CHẮC CHẮN xảy ra. Đã sửa tận gốc trong `useVoiceInput.ts` (không phải vá riêng ở Nori) - thêm đúng guard `s !== 'listening'` cho handler `'error'`, giống hệt `'end'` đã có - lợi ích áp dụng cho MỌI nơi dùng hook này (`VoiceButton.tsx` dùng ở `AddOdometerScreen`/`AddRefuelScreen`, `NoriChatScreen`, `NoriQuickPopover`), không chỉ Nori.
- Cả 2 fix verify bằng `npx tsc --noEmit` (sạch) + đọc lại code đối chiếu logic guard đã có sẵn ở `'end'` handler (đã tin cậy từ trước) - KHÔNG viết được test tự động do phụ thuộc trực tiếp native module, cần test thật trên thiết bị để xác nhận (đặc biệt case 2: thử gây lỗi giọng nói ở màn nhập ODO, sau đó mở popup Nori xem còn tự nghe được không).

**Cập nhật 2026-07-28 (rà soát ảnh chụp hội thoại thật `obd-fixtures/Notedri-Bluetooth/` + mở rộng độ phủ Local + điều tra bug giọng nói trên box Android ô tô, theo yêu cầu user):**

**A. Bug NGHIÊM TRỌNG bắt được qua ảnh chụp thật - "ghi công tơ mét 5588" bị hiểu thành câu HỎI:**
User gửi ảnh chụp Messenger cho thấy: "ghi công tơ mét 5588" và (lần 2) "ghi công tơ mét 55883 km" đều bị trả lời "Số công-tơ-mét gần nhất: 55555 km" - y hệt như đang HỎI số hiện tại, không hề ghi gì, số không đổi cả 2 lần. Root cause: rule đọc `vehicle.getCurrentODO` trong `LocalIntentMatcher.ts` chỉ kiểm tra câu có chứa cụm "công tơ mét" - hoàn toàn không phân biệt được ý ĐỌC và ý GHI, nên chặn đứng NGAY TỪ ĐẦU, không bao giờ tới được LLM/`odometer.create`. User hoàn toàn không biết dữ liệu chưa được ghi. Đã sửa bằng 1 guard chung ở đầu `matchLocalIntent()`: bất kỳ câu nào chứa động từ GHI ("ghi"/"cập nhật"/"vừa đổ") đều trả `null` NGAY, bắt buộc đi qua LLM (nơi có tool ghi thật + xác nhận UI) - áp dụng cho MỌI rule đọc tương lai có thể vô tình đụng từ khoá tương tự, không chỉ vá riêng rule ODO.

**B. Mở rộng độ phủ Local theo yêu cầu user ("câu nào xử lý được local thì xử lý ngay thay vì LLM")** - rà lại TOÀN BỘ ví dụ trong `docs/nori-agent-qa-coverage.md` bằng 1 script test thật (`npx tsx`, gọi thẳng `matchLocalIntent()`), phát hiện thêm 4 câu bị trượt local do cùng 1 lỗi gốc: rule dùng chuỗi liền mạch cứng nhắc, trong khi câu tiếng Việt thật hay chêm từ ở giữa hoặc đảo thứ tự cụm:
1. "đăng kiểm CỦA TÔI ĐẾN HẠN khi nào" (thứ tự đảo so với "khi nào đến hạn") - `maintenance.getUpcoming` - **bắt được TRỰC TIẾP từ ảnh chụp user gửi**, đúng lúc rơi vào LLM thì backend lỗi nên user thấy "mất kết nối".
2. "tháng trước so với tháng này thế nào" (không nhắc "tiền"/"xăng" trực tiếp) - `expense.summary` - **cũng bắt được TRỰC TIẾP từ ảnh chụp** - tài liệu QA coverage trước đó ghi NHẦM là câu này đã khớp Local (chỉ verify được phần template, chưa verify matcher thật, xem mục dưới).
3. "Vòng tua MÁY hiện tại" (chêm "máy" giữa "vòng tua" và "hiện tại") - `vehicle.getRPM`.
4. "Xe TÔI dạo này ổn không" (chủ ngữ chêm đầu câu, không liền "dạo này") - `vehicle.getRecentIssues`.
- Cả 4 đều sửa bằng kỹ thuật `allOfGroups` đã có sẵn trong file (chỉ cần đủ từ khoá xuất hiện, không quan tâm thứ tự/khoảng cách) - đúng pattern đã dùng cho `vehicle.getTripToday` trước đây.
- **Bài học rút ra**: lần trước (2026-07-27) tôi verify "tháng trước so với tháng này" bằng cách gọi THẲNG `buildLocalReply()` (bỏ qua `matchLocalIntent()`), nên không phát hiện ra matcher thật KHÔNG route được câu này - ghi nhầm vào tài liệu là "đã khớp Local". Từ nay verify Local phải luôn qua ĐÚNG `matchLocalIntent()` như user gõ, không test tắt qua hàm nội bộ.
- **Verify thật**: viết lại toàn bộ ~21 câu ví dụ trong `qa-coverage.md` thành 1 bộ test chạy qua `npx tsx` gọi thẳng `matchLocalIntent()` thật (không phải suy đoán) - 21/21 pass sau khi sửa (trước khi sửa: 2 fail phát hiện thêm ở mục B.3/B.4, cộng 3 bug xác nhận qua ảnh chụp ở mục A/B.1/B.2). `npx tsc --noEmit` sạch.

**C. Nghi vấn "toàn báo không kết nối" - có thể do PRODUCTION CHƯA DEPLOY các fix gần đây:**
Ảnh chụp cho thấy rất nhiều câu hỏi khác nhau (đăng kiểm, đảo lốp, so sánh tháng) đều nhận CÙNG 1 câu trả lời "Mình đang không kết nối được với máy chủ, bạn kiểm tra mạng rồi thử lại giúp mình nhé." - đây là câu báo lỗi CHUNG của `ConversationManager.ts` cho MỌI lỗi backend (502/timeout/rate-limit...), không phân biệt nguyên nhân. Nhiều khả năng đây là hậu quả của việc Groq (provider hiện tại của Nori theo `NORI_LLM_PROVIDER=groq` trên prod) bị rate-limit (đã xác nhận THẬT sự xảy ra lúc test Phase 2 - free tier chỉ 12.000 token/phút) - **và cơ chế tự chuyển sang Gemini khi Groq hết quota (`notedri@9d854b4`, thêm 2026-07-27) CÓ THỂ CHƯA ĐƯỢC DEPLOY LÊN PRODUCTION** (chỉ mới push lên git, chưa chắc đã `git pull` + restart trên server prod). Tương tự 2 bug Gemini tool-calling (`notedri@1d7b262`) và Premium gate (`notedri@043eca0`) đều có thể chưa lên prod. **Cần user xác nhận: (1) code backend mới nhất đã được deploy lên production chưa (git pull + php artisan config:clear/cache trên server), (2) production `.env` có cả `GEMINI_API_KEY` lẫn `GROQ_API_KEY` không (để cơ chế tự chuyển đổi thật sự có tác dụng).** Đây là việc CHỈ user tự làm được (không có quyền truy cập server production trong môi trường này).

**D. Điều tra "không bắt được giọng nói trên box Android ô tô, trong khi Kiki vẫn ra lệnh được":**
- **Nguyên nhân khả dĩ nhất (không tự kiểm chứng được, không có thiết bị thật)**: `expo-speech-recognition` dùng API `SpeechRecognizer` CHUẨN của Android, cần 1 dịch vụ nhận diện giọng nói hệ thống đã đăng ký (thường là "Google Speech Services"/Google app, đi kèm Google Mobile Services - GMS). Nhiều box Android ô tô (đặc biệt ROM tự chế/không GMS đầy đủ) KHÔNG có dịch vụ này. Kiki hoạt động được vì dùng ENGINE GIỌNG NÓI RIÊNG của hãng (tích hợp trực tiếp vào ROM/app Kiki, không qua API chuẩn Android) - 2 cơ chế HOÀN TOÀN KHÁC NHAU, Kiki chạy được KHÔNG chứng minh được app này cũng chạy được.
- Trước khi có preflight check, nếu thiết bị thiếu dịch vụ này, `start()` vẫn được gọi nhưng KHÔNG BAO GIỜ bắn sự kiện 'result' - trải nghiệm giống hệt "bấm mic, im lặng, không bắt được gì" user mô tả (may mắn đã có sẵn `MAX_LISTEN_MS`/lưới an toàn từ đợt trước nên ít nhất không treo "Đang nghe..." vĩnh viễn, nhưng vẫn không nói được).
- **Đã sửa**: `useVoiceInput.ts` giờ gọi `ExpoSpeechRecognitionModule.isRecognitionAvailable()` (kiểm tra ĐỒNG BỘ, có sẵn trong thư viện) NGAY ĐẦU `listen()`, TRƯỚC CẢ khi xin quyền micro - nếu thiết bị không hỗ trợ, báo lỗi CHÍNH XÁC ngay lập tức ("Thiết bị này không hỗ trợ nhận diện giọng nói...") thay vì treo/im lặng. Cũng tách riêng mã lỗi `service-not-allowed` (trước đây gộp chung với "cần cấp quyền micro" - SAI bản chất, dịch vụ không tồn tại thì cấp quyền lại cũng vô ích) và thêm `language-not-supported` (thiết bị có dịch vụ nhưng không hỗ trợ tiếng Việt) - cả 2 dùng key i18n mới `voice.error_not_available`/`voice.error_language_not_supported` (đã thêm cả `vi.ts`/`en.ts`).
- **CHƯA xác nhận được đây có phải nguyên nhân DUY NHẤT hay không** - cần user test lại trên chính box Android ô tô đó và xem thông báo lỗi MỚI hiện ra là gì: nếu hiện đúng "thiết bị này không hỗ trợ nhận diện giọng nói" → xác nhận đúng là giới hạn phần cứng/ROM, không phải bug code (không có cách khắc phục ở tầng app, trừ khi tích hợp thêm 1 SDK nhận diện giọng nói khác không phụ thuộc Android SpeechRecognizer chuẩn - việc lớn, chưa làm). Nếu vẫn im lặng hoàn toàn không hiện lỗi gì → có bug khác chưa lộ ra, cần log/thông tin cụ thể hơn từ thiết bị đó.

**Cập nhật 2026-07-28 (bàn phím VẪN che input sau fix "dựa vào adjustResize" - user test thật xác nhận chưa triệt để, chuyển hẳn sang thư viện chuyên dụng):**

- Fix trước (dựa hoàn toàn vào `android:windowSoftInputMode="adjustResize"` + bỏ hẳn `KeyboardAvoidingView` trên Android) **KHÔNG đủ** trên thiết bị thật của user - đúng như đã cảnh báo trước (suy luận theo tài liệu, chưa tự kiểm chứng được). Khả năng cao do edge-to-edge ngày càng phổ biến trên Android mới làm `adjustResize` không còn tự co cửa sổ đáng tin cậy như trước.
- **Đã cài `react-native-keyboard-controller`** (thư viện Expo hiện khuyến nghị đúng cho use-case này, xem `AGENTS.md`/tài liệu Expo bản app đang dùng) - **dependency NATIVE MỚI, bắt buộc rebuild app, không chỉ reload JS** (giống `expo-speech`/`expo-speech-recognition` trước đây).
  - Gặp xung đột phiên bản lúc cài (`npm install` báo lỗi peer dependency vì thư viện cần `react-native-reanimated` nhưng project CHƯA có sẵn reanimated, và `npm` tự chọn bản reanimated MỚI NHẤT không tương thích RN 0.81.5 của app) - giải quyết bằng cách cài `react-native-reanimated` TRƯỚC qua `npx expo install` (để Expo tự chọn đúng bản tương thích SDK 54), rồi mới cài `react-native-keyboard-controller` - không cần `--legacy-peer-deps` (tránh được rủi ro version mismatch ngầm).
  - Autolinking của Expo là ĐỘNG (quét `node_modules` lúc build qua gradle plugin `expo-autolinking-settings`, xem `android/settings.gradle`) - KHÔNG cần chạy `expo prebuild` để đăng ký module mới (an toàn hơn, không có rủi ro `prebuild` ghi đè các tuỳ chỉnh thủ công đã có sẵn trong `android/` như `adjustResize`).
- **`App.tsx`**: bọc toàn bộ app trong `<KeyboardProvider>` (bắt buộc, mọi component của thư viện cần context này).
- **`NoriChatScreen.tsx`**: bỏ hẳn `KeyboardAvoidingView` bọc CẢ màn hình - thay bằng `View` thường (`flex:1`, chỉ chứa FlatList + chip gợi ý) và `KeyboardStickyView` (component CHUYÊN DỤNG của thư viện cho đúng pattern "danh sách + thanh nhập ghim đáy") bọc RIÊNG khối composer + các dòng trạng thái (đang nghe/đang nói/lỗi) - `KeyboardStickyView` tự trồi lên sát mép bàn phím bằng animation native, không cần tính toán height/padding thủ công.
- **Rà soát thêm các input khác "ở sâu phía dưới" theo đúng yêu cầu user** - quét toàn bộ `KeyboardAvoidingView` trong app tìm pattern GIỐNG HỆT (`justifyContent:'flex-end'` - sheet ghim đáy, không có ScrollView bảo vệ), tìm thấy thêm 2 chỗ dùng CÙNG tổ hợp không đáng tin (`behavior='height'`/`undefined` trên Android):
  - `src/components/OcrCamera.tsx` (sheet nhập số liệu OCR hoá đơn/công-tơ-mét)
  - `src/screens/profile/ProfileScreen.tsx` (modal xác nhận xoá tài khoản)
  - Cả 2 đổi sang `KeyboardAvoidingView` CỦA THƯ VIỆN (bản "reworked", khác bản gốc react-native) với `behavior="padding"` CHUNG cho cả 2 nền tảng - theo đúng ví dụ trong tài liệu thư viện, không cần phân nhánh iOS/Android như bản gốc nữa.
  - Cũng đổi luôn Modal chấm điểm câu trả lời trong CHÍNH `NoriChatScreen.tsx` (cùng pattern, trước đó dùng `behavior='height'` y hệt fix cũ chưa triệt để).
  - **Các input khác đã kiểm tra nhưng CỐ TÌNH không đổi** (rủi ro thấp hơn hẳn, khác pattern): modal sửa ghi chú hành trình (`GpsTripsScreen.tsx`), modal hoàn thành nhắc nhở (`RemindersScreen.tsx`) - cả 2 dùng `justifyContent:'center'` (nội dung CĂN GIỮA, không ghim đáy) nên tự co lại gọn trong không gian còn lại khi bàn phím mở, không có rủi ro bị đẩy khuất như sheet ghim đáy.
- **CHƯA tự kiểm chứng được bằng mắt** (môi trường này không có thiết bị/simulator) - đây là thư viện ĐƯỢC THIẾT KẾ RIÊNG cho đúng vấn đề này (không phải suy luận/vá tạm như 2 lần trước), nhưng vẫn cần user rebuild + test thật trên đúng thiết bị đã báo lỗi để xác nhận dứt điểm. `npx tsc --noEmit` sạch.

**Cập nhật 2026-07-28 (mở rộng độ phủ Local Intent Matcher lên 15/15 tool đọc, theo yêu cầu user "mở rộng bổ sung thêm để đảm bảo chất lượng"):**

- **`vehicle.getLiveData`** (tool đọc DUY NHẤT chưa từng có mẫu local) - thêm rule (`phrases`: "toàn bộ thông số"/"hết thông số xe"/"tất cả thông số xe", `allOfGroups`: ["thong so","hien tai"]) + case mới trong `LocalReplyTemplates.ts` tổng hợp cả 5 chỉ số (tốc độ/vòng tua/nước làm mát/nhiên liệu/ắc-quy) thành 1 câu, bỏ qua chỉ số nào còn `null` (chưa đọc được) thay vì hiện "null"/crash, và có câu riêng khi CHƯA đọc được chỉ số nào ("xe đã kết nối nhưng chưa đọc được thông số nào").
- **Thêm biến thể phrasing tự nhiên** cho các rule đã có (không tool nào mới, chỉ tăng ĐỘ PHỦ của tool cũ): `vehicle.getCurrentODO` ("đã đi được bao nhiêu km", "tổng số km đã đi" - phân biệt với `getTripToday` vì KHÔNG có "hôm nay"), `vehicle.readDTC` ("kiểm tra mã lỗi"), `vehicle.getSpeed` ("vận tốc hiện tại", "tốc độ xe là bao nhiêu"), `vehicle.getRPM` ("rpm bao nhiêu"), `vehicle.getCoolant` ("máy có nóng không", "nhiệt độ máy hiện tại"), `vehicle.getFuelLevel` ("bình xăng còn bao nhiêu", "xăng còn bao nhiêu phần trăm"), `vehicle.getBatteryVoltage` ("bình điện có yếu không", "ắc-quy thế nào"), `fuel.findNearbyStations` ("cây xăng/trạm xăng ở đâu"), `expense.summary` ("đổ xăng hết bao nhiêu"), `maintenance.getUpcoming` ("sắp hết hạn" - biến thể của "sắp đến hạn"), `vehicle.getTripToday` ("hôm nay quãng đường bao nhiêu").
- **Verify thật**: viết bộ test qua `npx tsx` import thẳng `matchLocalIntent()`/`buildLocalReply()` thật (không suy đoán) - 15 case mới cho các phrasing thêm ở trên PASS, cộng kiểm tra guard "ghi" vẫn chặn đúng cạnh các phrase ODO mới ("ghi lại tổng số km đã đi là 5000" → vẫn `null`, không bị rule đọc mới nuốt mất). Chạy lại TOÀN BỘ 30 case cũ (regression + bug thật trước đó) - không case nào bị lệch. Tổng **45/45 pass**. `npx tsc --noEmit` sạch.
- Đã cập nhật `docs/nori-agent-qa-coverage.md` (15/15 tool đọc, không còn 14/15).

**Cập nhật 2026-07-28 (rà soát toàn bộ code Nori của phiên này + thiết kế lại NoriQuickPopover theo phản hồi user "hộp thoại ở giữa màn... chưa đẹp... sửa cho chuyên nghiệp hơn"):**

- **Rà soát phòng thủ**: chạy lại `npx tsc --noEmit` toàn app (sạch) và `php -l` cho toàn bộ file backend đã đổi trong phiên (sạch), đọc lại toàn bộ file Nori đã sửa (`AiNoriController.php`, `GroqNoriService.php`, `GeminiNoriService.php`, `NoriRateLimitedException.php`, `noriAgentStore.ts`, `ConversationManager.ts`, `useInitNoriAgent.ts`, `NoriChatScreen.tsx`, `NoriFloatingButton.tsx`, `useVoiceInput.ts`, `VoiceWaveform.tsx`, `LocalIntentMatcher.ts`, `LocalReplyTemplates.ts`, `App.tsx`, `OcrCamera.tsx`, `ProfileScreen.tsx`) để tìm lỗi khai báo thừa, side-effect chéo tính năng, và rủi ro treo/crash app (đặc biệt: cleanup của `useSpeechRecognitionEvent`, không có timer nào bị leak, `MAX_TOOL_LOOP_ITERATIONS = 6` chặn vòng lặp vô hạn, không có `throw` nào thoát khỏi try/catch trong `ConversationManager`). **Kết quả: không phát hiện vấn đề mới** - toàn bộ thay đổi trước đó trong phiên đã được commit+push đầy đủ (`ce9c178`, `113e7cf`, `e2d0f7f`, `bf2556e`, `bfbbff2` phía app; các commit tương ứng phía backend).
- **Thiết kế lại `NoriQuickPopover`**: từ hộp thoại nổi giữa màn (fade-in, bo tròn 4 góc) sang **bottom sheet trượt lên từ đáy màn hình** (`animationType="slide"`, backdrop đậm hơn `#0007`, chỉ bo tròn 2 góc trên, có shadow hắt lên + thanh kéo (drag-handle) trang trí ở đỉnh - giống pattern bottom-sheet quen thuộc của các app native, thay vì một dialog nổi lơ lửng không rõ nguồn gốc xuất hiện từ đâu).
  - Thêm `NoriAvatar` (mascot đổi màu theo mood, tái dùng từ icon nổi) vào header thay cho chữ "Nori" đơn thuần - cần thread thêm prop `vehicleId` từ `NoriFloatingButton` xuống `NoriQuickPopover` để gọi `useNoriSummary(vehicleId)` (cùng nguồn mood mà icon nổi đã tính, đảm bảo tính nhất quán thị giác giữa icon vừa bấm và popup vừa mở).
  - Gộp 3 nút rời (input/mic/send) đang nổi riêng lẻ thành **1 khối pill bo tròn thống nhất** (`borderRadius: 26`), chuyên nghiệp hơn 3 hình vuông tách biệt.
  - Bỏ icon "expand-alt" nhỏ ở header, thay bằng link chữ full-width "Mở rộng cuộc trò chuyện →" ngay dưới composer - rõ ràng hơn về mục đích (điều hướng sang `NoriChatScreen`) so với 1 icon mơ hồ.
  - Chủ động bọc toàn bộ sheet trong `KeyboardAvoidingView` của `react-native-keyboard-controller` (`behavior="padding"`) ngay từ đầu, vì sheet có `TextInput` sát đáy - tránh lặp lại đúng class bug bàn phím che input vừa fix ở nơi khác trong phiên này.
- **Verify**: `npx tsc --noEmit` sạch; đọc lại toàn bộ file sau khi viết lại để xác nhận coherent. Đây là thay đổi thuần UI, không đổi logic gọi tool/local-matcher nên không cần cập nhật `docs/nori-agent-qa-coverage.md`. Chưa test trên thiết bị thật (môi trường này không có device/simulator) - cần user tự kiểm tra lại animation + việc bàn phím không che composer khi gõ.

**Cập nhật 2026-07-28 (rà soát toàn diện "còn thiếu gì" + đóng 4 gap không cần test head-unit ô tô, theo yêu cầu user "cái nào có thể triển khai được thì triển khai đi, đảm bảo chất lượng" khi chưa có thời gian test xe thật):**

- **Rà soát tổng thể trước khi làm**: đối chiếu lại toàn bộ mục 7 (module vệ tinh), mục 6 (danh sách tool), `nori-agent-qa-coverage.md` với code thật (không chỉ đọc doc). Xác nhận: `TestHarness` vẫn chưa có ai gọi `MockVehicleAdapter` (viết sẵn nhưng chưa dùng); chính sách lưu audio/transcript (mục 12) vẫn là câu hỏi mở CHƯA quyết dù voice đã lên production; `PermissionManager`/`PromptTemplateStore`/`OfflineQueue`/`MultiVehicleContext`/`ProactiveTriggerEngine` đều chưa làm (đúng như kế hoạch, không phải bỏ sót); production có deploy các fix Groq/Gemini/Premium hay chưa vẫn KHÔNG kiểm tra được (không có quyền truy cập server).
- **Chọn việc để làm**: loại bỏ những việc CẦN test trên head-unit ô tô thật (user chưa có thời gian) khỏi phạm vi đợt này. Còn lại 4 tool đọc mới đóng đúng "Khoảng trống lớn nhất" đã ghi trong `nori-agent-qa-coverage.md` - đều verify được bằng `tsc`/`php -l`/test thật qua `npx tsx`, không cần thiết bị:
  - **`vehicle.getLifetimeCost`** - backend thêm nhánh `?scope=lifetime` vào route `cost-summary` sẵn có (`VehicleController::costSummary`), gọi thẳng `CostSummary::lifetime()` - method này đã chạy production ở 3 nơi khác (`DossierController`, `ReportController` x2) nên rủi ro thấp, không phải logic mới chưa kiểm chứng. Chỉ thêm 1 nhánh param, không đổi hành vi mặc định.
  - **`ev.findNearbyChargingStations`** - mirror 100% `fuel.findNearbyStations` (cùng cấu trúc GPS-tại-tool-layer, cùng gate Premium `gas_finder`). Route backend (`RefuelController::nearbyCharging`) và hàm client (`refuelsApi.nearbyCharging`) đã tồn tại sẵn từ trước, chỉ chưa được bọc thành tool - không có thay đổi backend nào cho tool này.
  - **`fuel.predictNextRefuel`** - `/dashboard` đã trả sẵn field `prediction` (`FuelCalculator::predictNextRefuel`, tính EWMA trên lịch sử đổ xăng) từ trước nhưng `NoteDriApi.getFuelExpenseSummary()` đang loại bỏ field này - chỉ thêm 1 hàm mới đọc đúng field có sẵn, không đổi backend.
  - **`vehicle.getFuelConsumptionHealth`** - trích riêng organ `key:'tieu_thu'` từ payload `/vehicles/{id}/health` (`VehicleHealthService::consumptionOrgan`, đã tính sẵn so với trung vị gần đây + trần hãng công bố) thay vì bắt LLM tự mò trong object `organs` chung chung như `vehicle.getHealthScore` hiện tại.
  - **Cố tình KHÔNG làm** "tìm garage gần đây": rà soát kỹ phát hiện `ServiceLogController::garages()` KHÔNG tìm theo GPS như tưởng - nó chỉ trả gara mà CHÍNH user này từng dùng trước đây (gợi ý chọn nhanh lúc ghi bảo dưỡng), khác nghĩa hoàn toàn với "gara gần vị trí hiện tại". Không giả làm tool location-based từ dữ liệu không phải location-based (vi phạm nguyên tắc "không bịa dữ liệu" ở mục 1) - việc này cần tích hợp bên thứ ba (Google Places...), ngoài phạm vi đợt rà soát này.
- **LocalIntentMatcher.ts + LocalReplyTemplates.ts**: thêm rule + template cho cả 4 tool mới, đặt đúng thứ tự để không nhầm với rule đã có (`vehicle.getLifetimeCost` phải đứng TRƯỚC `maintenance.expenseSummary`/`expense.summary` vì cụm "từ trước tới giờ" là tín hiệu đặc trưng dễ bị 2 rule chi phí theo-kỳ hạn cướp mất nếu đứng sau; `fuel.predictNextRefuel`/`vehicle.getFuelConsumptionHealth` đứng TRƯỚC `vehicle.getFuelLevel` vì cùng nhắc "xăng" nhưng hỏi DỰ ĐOÁN/TIÊU HAO chứ không phải mức % hiện tại; `ev.findNearbyChargingStations` không đụng rule `fuel.findNearbyStations` vì từ khoá "sạc" khác hẳn "xăng"). Cũng thêm 3 message `unavailable` mới (`not_enough_refuel_history`, `not_enough_data`, `not_applicable_ev`) vào `unavailableText()`.
- **Verify thật** (không suy đoán): viết lại bộ test qua `npx tsx` gọi thẳng `matchLocalIntent()` - 18 case mới (bao gồm ép nhầm sang rule cũ để xác nhận KHÔNG bị cướp) cộng lại 17 case regression cũ (kể cả case guard "ghi" phải chặn đúng ngay cả khi câu chứa phrasing chi phí MỚI, vd "ghi lại tổng chi phí xe từ trước tới giờ là 5 triệu" vẫn phải trả `null`) - **35/35 pass**. Test riêng `buildLocalReply()` với nhiều hình dạng `result` khác nhau cho cả 4 tool (kể cả trường hợp rỗng/thiếu dữ liệu/EV) - **10/10 không crash**. `npx tsc --noEmit` (app) và `php -l` (backend, file `VehicleController.php`) đều sạch. Xác nhận `SafetyPolicy` không cần đổi (cả 4 tool mới đều `read-only`, không nằm trong `BLOCKED_WHILE_DRIVING`) và `ToolRegistry`/backend schema tự động nhận tool mới (không cần đăng ký thủ công ở nơi khác - `NoriAgent.ts` gọi `buildBusinessTools()` 1 lần, schema gửi backend sinh động từ `ToolRegistry`).
- Đã cập nhật `docs/nori-agent-qa-coverage.md` (19/19 tool đọc có mẫu Local, 21 tool tổng, đóng 3/4 gap đã ghi nhận - còn "garage gần đây" xác nhận là việc mới cần bên thứ ba, không phải mở rộng nhỏ).
- **Chưa làm trong đợt này** (đúng như đã audit, không phải quên): chính sách lưu audio/transcript, `TestHarness` thật, xác minh production đã deploy chưa - đều cần quyết định/quyền truy cập ngoài phạm vi code có thể tự làm mà không cần hỏi thêm.

**Cập nhật 2026-07-28 (viết `TestHarness` thật, đóng nốt việc còn lại từ 2 đợt rà soát trên):**

- **Phát hiện quan trọng trước khi viết**: dự án đã có sẵn Jest thật (`jest` + `jest-expo`, `npm test`, `testMatch: **/__tests__/**/*.test.ts`) với **30 file test, 254 case đang chạy** ở nơi khác trong app (obd/, drivingScore/, nori/...) - đợt rà soát "còn thiếu gì" trước đó (mục audit ở đầu phần này) nói "chưa có tooling test" là ĐÚNG cho riêng Nori Agent (chưa có file test nào cho `src/agent/`) nhưng SAI nếu hiểu là cả app không có Jest - đã có sẵn, chỉ cần viết theo đúng convention có sẵn thay vì tự dựng runner riêng (`npx tsx` script rời rạc như các lần trước).
- **Thêm 1 seam DI nhỏ để test được** (không đổi hành vi production): `ConversationManager` trước đây import cứng `noriApi.chat` (gọi HTTP thật) - không cách nào test được vòng lặp tool-calling/grounding validator mà không có mạng/API key thật. Thêm tham số constructor thứ 4 `chatFn: ChatFn = noriApi.chat` (`ConversationManager.ts`) + thread qua `NoriAgent`'s constructor (tham số thứ 4, optional) - `NoriAgent` sản xuất (không truyền tham số này) hành vi giữ nguyên 100% vì default value áp dụng đúng khi gọi `new ConversationManager(..., undefined)`.
- **`src/agent/platform/TestHarness.ts`** (engine, không phụ thuộc Jest - dùng lại được ở script khác nếu cần): `runScenario()`/`runScenarios()` dựng `NoriAgent` THẬT (không viết lại rút gọn riêng cho test) với `MockVehicleAdapter` thay BLE + kịch bản `chatScript: NoriChatResponse[]` (tiêu thụ theo thứ tự mỗi lần gọi chatFn thật) thay HTTP thật. Có kiểm tra `expectSource`/`expectReplyContains`/`expectReplyNotContains` mỗi turn, cộng trả về `messages` (transcript tool-call đầy đủ) để assert sâu hơn nội dung `tool_result` thật (status cancelled/invalid_input) - quan trọng cho kịch bản LLM vì câu trả lời cuối chỉ là text đã script sẵn, tự nó không chứng minh được `ToolExecutor` có chặn đúng hay không.
- **`src/agent/__tests__/noriAgentHarness.test.ts`** (Jest thật, `npm test` tự chạy) - **10 case, 10/10 pass**, cộng chạy lại TOÀN BỘ 30 suite/264 case cũ trong app - không suite nào bị ảnh hưởng:
  - 5 case Local Matcher offline (`vehicle.getSpeed`, `vehicle.getLiveData`, BLE mất kết nối, `knowledge.explainDTC`, guard "ghi" không bị rule đọc nuốt) - test THẬT qua `NoriAgent.sendMessage()` (không phải gọi thẳng `matchLocalIntent()` như script tay trước đây), nên cover luôn cả tool thật + `MockVehicleAdapter` thật, không chỉ riêng phần regex khớp câu.
  - 3 case cơ chế vòng lặp LLM: grounding validator CHẶN số không grounded (999 km/h giả trong khi tool_result thật là 80), grounding validator CHO QUA số grounded đúng, và `MAX_TOOL_LOOP_ITERATIONS=6` dừng đúng lúc thay vì treo/gọi chatFn vô hạn (harness tự ném lỗi rõ nếu kịch bản bị gọi vượt quá số phần tử đã script - bắt được ngay nếu ai sửa hằng số này mà quên cập nhật test).
  - 2 case xác nhận ghi dữ liệu (Phase 2) KHÔNG BAO GIỜ chạm network trong môi trường test: user từ chối xác nhận `odometer.create` (ToolExecutor trả `cancelled` trước khi gọi `registry.execute()`) và `fuel.create` thiếu 2/3 số bắt buộc (tool tự validate TRƯỚC khi gọi `NoteDriApi`, trả `invalid_input`) - cả 2 đều assert trực tiếp trên nội dung `tool_result` JSON thật, không chỉ suy luận từ câu trả lời cuối.
- **Phạm vi KHÔNG cover (ghi rõ, không giấu)**: các tool "business" (`expense.summary`, `maintenance.*`, `vehicle.getLifetimeCost`, `fuel.findNearbyStations`...) gọi `NoteDriApi` → HTTP thật tới backend Laravel - `TestHarness` không mock lớp `src/api/*.ts`, nên các tool này vẫn cần test tay/backend thật như trước giờ, KHÔNG được tự động hoá trong đợt này (mock thêm 1 lớp DI nữa cho `NoteDriApi`/axios `client` là việc lớn hơn, chưa làm vì chưa được yêu cầu).
- Đã cập nhật mục 7 (bảng module vệ tinh) đánh dấu `TestHarness`/`MockAdapter` **Xong**, và mục 15 cũ (dòng ghi "chưa có TestHarness gọi tới") sửa lại trỏ về đây.

**Cập nhật 2026-07-28 (cải thiện UI/UX cho Nori Agent, theo yêu cầu user "suy nghĩ để cải thiện giao diện, cách thức hoạt động và UI/UX thân thiện hơn"):**

- Đã rà soát lại cả 3 màn hình hiện có (`NoriFloatingButton.tsx`, `NoriQuickPopover.tsx`, `NoriChatScreen.tsx`) và đề xuất 9 hướng cải thiện chia theo mức ưu tiên (xem lịch sử trao đổi). User chọn 4 việc để làm ngay:
- **Phản hồi 2 pha thật** (mục ưu tiên cao nhất) - trước đây cả lượt hỏi chỉ có 1 dòng "Nori đang kiểm tra..." tĩnh, không phân biệt được đang chờ LLM hay đang chờ tool/API thật, cảm giác như treo (nhất là lúc lái xe/dùng giọng nói qua popup). Thêm:
  - `ConversationManager.ts`: `ProgressStage` (`{phase:'thinking'}` | `{phase:'calling_tool', toolNames}`) + tham số constructor thứ 5 `onProgress?` (optional, không phá `TestHarness.ts` hiện có vì không truyền vẫn hợp lệ) - gọi TRƯỚC mỗi lần chatFn (thinking) và NGAY khi phát hiện tool_use cần chạy (calling_tool, kèm tên tool).
  - `NoriAgent.ts`: thread `onProgress` xuống `ConversationManager`, expose `onProgress(cb): Unsubscribe` (cùng pattern `onStateChange` đã có).
  - `src/agent/progressText.ts` (mới): `describeProgressStage()` - đoán câu đệm theo TIỀN TỐ tên tool (không cần hiểu ngữ nghĩa từng tool trong 21 tool): `vehicle.*`/`knowledge.explainDTC` -> "đang đọc dữ liệu xe...", `*.create` -> "đang chuẩn bị ghi dữ liệu...", `*findNearby*` -> "đang tìm vị trí gần bạn...", còn lại -> "đang tra cứu dữ liệu...". Có test Jest riêng (`progressText.test.ts`, 6 case).
  - `noriAgentStore.ts`: state mới `progressStage`, subscribe qua `agent.onProgress()`, reset về `null` khi về `idle` (không để câu đệm CŨ hiện nhầm ở đầu lượt sau).
  - `NoriChatScreen.tsx`/`NoriQuickPopover.tsx`: thay dòng "Nori đang kiểm tra..." tĩnh bằng `describeProgressStage(progressStage)`.
- **Tín hiệu rung khi bắt đầu nghe / có câu trả lời / lỗi giọng nói** - cài mới `expo-haptics` (qua `expo install`, đúng version SDK 54). `useVoiceInput.ts`: rung nhẹ (`impactAsync(Light)`) ngay khi `listen()` bắt đầu phiên nghe thật (trước đây không có tín hiệu nào ngoài đổi UI, dễ nói hụt vài giây đầu ở popup tự động nghe); rung báo lỗi (`notificationAsync(Error)`) trong handler `'error'`. `noriAgentStore.sendMessage()`: rung xác nhận (`notificationAsync(Success)`) ngay khi có câu trả lời (kể cả câu báo cần Premium) - đặt Ở MỘT NƠI DUY NHẤT (store) nên cả `NoriChatScreen` lẫn `NoriQuickPopover` đều được, không phải sửa 2 nơi.
- **Đồng bộ hộp xác nhận ghi dữ liệu sang bottom-sheet** - `NoriChatScreen.tsx`'s Modal xác nhận (`odometer.create`/`fuel.create`) trước đó là dialog CĂN GIỮA (`animationType="fade"`, `justifyContent:'center'`) - dialog căn giữa DUY NHẤT còn sót lại trong toàn bộ Nori, lệch hẳn ngôn ngữ bottom-sheet đã áp dụng cho feedback modal ngay phía trên và cho `NoriQuickPopover` (đợt sửa trước, theo đúng phản hồi "chưa chuyên nghiệp" của user). Đổi sang `animationType="slide"` + `justifyContent:'flex-end'` + bo tròn 2 góc trên + tay cầm kéo trang trí, khớp đúng mẫu đã dùng.
- **Chấm điểm câu trả lời hiện RÕ bằng 2 icon 👍/👎** thay vì thao tác `onLongPress` ẩn hoàn toàn (gần như không ai tự tìm ra) - `NoriChatScreen.tsx`: mỗi bọt trả lời của Nori (có `requestId`, chưa chấm điểm) giờ có 2 icon nhỏ ngay bên dưới. 👍 chấm "đúng" NGAY LẬP TỨC (`submitFeedback(id,'good')`, không qua modal - phản hồi tích cực không cần hỏi thêm gì); 👎 mở modal chi tiết đã có sẵn (chọn sai/1 phần đúng + ghi chú) vì câu trả lời sai đáng để hỏi thêm lý do hơn câu đúng.
- **Verify**: `npx tsc --noEmit` sạch; chạy lại toàn bộ Jest (31 suite/270 case, bao gồm 6 case mới cho `progressText.ts`) - chỉ 1 file KHÔNG liên quan (`obdLiveMonitorDtcPhase2.test.ts`) timeout khi chạy full-suite song song do tải CPU, xác nhận chạy riêng lẻ vẫn pass 10/10 trong 1.8s - không phải do thay đổi lần này, không sửa (flaky test cũ, không thuộc phạm vi Nori). Chưa test trên thiết bị thật (môi trường này không có device/simulator) - đặc biệt cần kiểm tra CẢM GIÁC rung có phù hợp không (haptics là thứ chỉ đánh giá được qua thiết bị thật, không thể verify qua code/simulator).
- **Chưa làm ở lượt này** (nằm trong 9 đề xuất ban đầu, user chưa chọn ưu tiên): chuyển động fade/scale mượt hơn giữa các trạng thái trong popup, nút mở lại chip gợi ý bất kỳ lúc nào, huy hiệu nhấp nháy trên icon nổi khi mood urgent/warn, thêm "cá tính" vào giọng văn trả lời, coachmark cho người dùng mới. **Cả 5 việc này đã làm ngay sau đó cùng ngày** - xem entry tiếp theo bên dưới.

**Cập nhật 2026-07-28 (tiếp - làm nốt 5 ý còn lại trong 9 đề xuất UX, theo yêu cầu user "triển khai luôn, đảm bảo không bug"):**

- **Chuyển động mượt hơn trong `NoriQuickPopover`**: trước đây đổi trạng thái (đang nghe/đang nghĩ/trả lời) là ĐỔI CHỮ TỨC THÌ trong cùng 1 `View`, cảm giác "giật". Thêm `displayKey` (đại diện đúng 1 khối nội dung đang hiện: `premium`/`thinking`/`listening`/`message-<id>`/`empty`) - đổi key thì fade nhẹ (`Animated.Value` opacity 0->1, 200ms) qua `Animated.View`, không đổi key thì không animate lại (tránh nháy vô ích khi status đổi nhưng vẫn cùng khối hiển thị).
- **Nút mở lại chip gợi ý bất kỳ lúc nào** (`NoriChatScreen.tsx`): trước đây chip chỉ hiện đúng 1 lần lúc `uiMessages.length<=1` rồi biến mất vĩnh viễn - không còn cách nào khám phá tool mới thêm sau này (lifetime cost, trạm sạc điện...). Thêm state `showSuggestions` (mặc định = hành vi cũ lúc mới mở) + 1 icon bóng đèn trong thanh soạn tin để bật/tắt bất kỳ lúc nào; bấm 1 chip cũng tự đóng lại panel (đã "dùng xong").
- **Huy hiệu nhấp nháy trên icon nổi** khi mood `urgent`/`warn` CHƯA XEM (`NoriFloatingButton.tsx`): `seenMoodRef` (chỉ sống trong RAM, không cần AsyncStorage) đánh dấu mood đã xem NGAY khi user chạm vào icon (`onPanResponderGrant` - cả bấm lẫn kéo đều tính), badge tự pulse qua `Animated.loop` chỉ khi đang cần hiện (dừng loop lúc ẩn, không chạy animation vô ích). Bug thật tự bắt được lúc code: `mood` bị đọc trực tiếp trong closure của `panResponder` (tạo 1 lần qua `useRef().current`) sẽ bị stale y hệt lớp bug `dockedRef` đã né trước đó - phải thêm `moodRef` cùng pattern.
- **Coachmark 1 lần cho người dùng mới** (`NoriFloatingButton.tsx`): AsyncStorage key `nori_floating_coachmark_seen`, hiện bong bóng chỉ dẫn cạnh icon, tự ẩn sau 6s hoặc ngay khi user chạm vào icon (cùng chỗ với đánh dấu mood đã xem ở trên). Chỉ hiện ở dạng đầy đủ (không hiện lúc đã gạt vào cạnh - trạng thái đó chỉ xảy ra SAU khi đã tương tác, lúc đó coachmark đã tự ẩn từ lâu).
- **Thêm "cá tính" vào giọng văn trả lời** - CHỈ đổi tông giọng, KHÔNG đổi/thêm số liệu nào (an toàn với grounding validator, dù validator chỉ áp dụng đường LLM):
  - `LocalReplyTemplates.ts`: `vehicle.getHealthScore` thêm câu khen/động viên tuỳ điểm số (>=85 khen, <50 trấn an nhẹ, giữa thì giữ nguyên trung tính); `vehicle.getRecentIssues` thêm câu mở đầu tuỳ mood ("Tin vui nè,"/"Nói bạn nghe,"/"Mình hơi lo một chút -").
  - Backend `NoriSystemPrompt.php`: thêm mục "Giọng điệu" hướng dẫn LLM ấm áp/gần gũi hơn cho câu trả lời TỔNG KẾT/ĐÁNH GIÁ (sức khoẻ, vấn đề gần đây), giữ nguyên thẳng-ngắn-gọn cho số liệu sống đơn thuần (tốc độ, vòng tua...) - không áp dụng tràn lan.
- **Verify**: `npx tsc --noEmit` sạch; test lại `buildLocalReply()` qua `npx tsx` cho các trường hợp điểm cao/thấp/giữa và cả 4 mood của `getRecentIssues` - đúng như kỳ vọng, không case nào lệch. Chạy lại toàn bộ Jest (31 suite/270 case) - **pass 100%**, kể cả file từng bị timeout ở lượt trước (`obdLiveMonitorDtcPhase2.test.ts`) nay chạy lại không tải song song thì pass bình thường, xác nhận đúng là flaky do tải CPU chứ không phải bug thật. `php -l` sạch cho `NoriSystemPrompt.php`. Chưa test trên thiết bị thật (không có device/simulator ở môi trường này) - đặc biệt cần kiểm tra: chuyển động fade có mượt trên thiết bị thật không, vị trí bong bóng coachmark có bị che khuất bởi thanh trạng thái/notch không tuỳ máy, và giọng văn ấm áp mới có tự nhiên bằng tiếng Việt không (LLM có thể diễn đạt khác nhau tuỳ provider Groq/Gemini/Anthropic).
