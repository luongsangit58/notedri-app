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
| `TestHarness`/`MockAdapter` | `NoriAgent.runWithMock(scenarioScript)` — chạy kịch bản hội thoại có sẵn không cần xe thật/BLE thật. | **Phase 1** — lợi ích gần, xem mục 8 |

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
- [ ] Giải pháp TTS cho Phase 3: dùng `expo-speech` (offline, đơn giản) hay TTS cloud (chất lượng giọng tiếng Việt tốt hơn nhưng tốn phí + cần mạng)?
- [ ] Giới hạn rate-limit/chi phí Haiku 4.5 theo user — có cần gắn vào gói Premium hiện có không, hay free cho mọi user?
- [ ] Wake word (Phase 4) dùng giải pháp nào trên Android — cần nghiên cứu riêng, chưa có hướng.
- [ ] Chính sách lưu trữ dữ liệu theo từng loại cần viết tường minh trước khi ra mắt voice: audio thô xoá sau khi STT xong? transcript giữ bao nhiêu ngày? vị trí có bao giờ gửi nguyên văn cho LLM không (mặc định: không)?
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
3. Test qua UI thật với xe/BLE thật hoặc `MockVehicleAdapter` (đã viết sẵn, chưa có TestHarness gọi tới nó — mục 7 `TestHarness`/`MockAdapter` vẫn là việc mở).

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
