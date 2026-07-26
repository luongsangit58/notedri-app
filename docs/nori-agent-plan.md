# Nori Agent — Kế hoạch triển khai

> **Trạng thái tài liệu:** Bản nháp kế hoạch (chưa có code). Mục đích: để bất kỳ ai (người hoặc AI agent) đọc vào cũng biết đang làm gì, đã quyết định gì, còn thiếu gì, và nên bắt đầu từ đâu.
>
> **Ngữ cảnh:** NoteDri hiện có 2 repo liên quan — `notedri-app` (Expo/React Native, repo này) và `notedri` (Laravel backend, sibling repo tại `c:\laragon\www\notedri`). Nori Agent cần thay đổi ở **cả hai** repo.

---

## 1. Tư duy nền tảng

NoteDri **không phải chatbot**. Nori là một **AI Agent** điều khiển các tính năng NoteDri thông qua Tool Calling — giống mô hình XiaoZhi nhưng chuyên biệt cho xe hơi.

Nguyên tắc bắt buộc:

- **Nori không bao giờ tự bịa dữ liệu xe.** Mọi câu trả lời phải bắt nguồn từ: BLE OBD (Vehicle Cache), NoteDri API, hoặc Knowledge Engine.
- **LLM không chứa business logic.** LLM chỉ làm 3 việc: hiểu ý định người dùng → chọn tool đúng → diễn đạt kết quả tool thành câu tự nhiên. Business logic (tính toán, ghi dữ liệu, quy tắc chẩn đoán) luôn nằm ở backend Laravel hoặc trong code app hiện có — không bao giờ để model "tự suy luận" ra số liệu.
- **Không đặt tên là "Chat" trong code.** Dùng đúng bản chất: `NoriAgent`, không phải `ChatScreen`/`ChatService`.
- **Tách lớp Platform Adapter khỏi lớp Agent.** Toàn bộ `ToolRegistry` + `ConversationManager` phải dùng lại được cho các phần cứng tương lai (màn hình ô tô, ESP32/XiaoZhi, Linux) — chỉ thay lớp giao tiếp phần cứng (mic/loa/BLE adapter), không viết lại logic agent.
- **BLE và AI độc lập nhau.** OBD polling không được phụ thuộc vào có đang chat với Nori hay không, và ngược lại.

---

## 2. Hiện trạng codebase (đã khảo sát — không phải giả định)

| Mảnh | Đã có? | Ở đâu | Ghi chú |
|---|---|---|---|
| Vehicle Cache (dữ liệu OBD sống, cập nhật liên tục) | ✅ Có sẵn, gần như tương đương | `src/services/obd/obdLiveMonitor.ts` (781 dòng) | Đây chính là "Vehicle Cache" mà đề xuất kiến trúc yêu cầu — **không viết lại**, chỉ bọc thêm 1 lớp đọc snapshot cho Tool Registry dùng. |
| BLE OBD2 (Vgate iCar Pro) | ✅ Có sẵn, rất đầy đủ | `src/services/obd/BleService.ts`, `ObdReader.ts`, `obdPollingScheduler.ts`, `obdKeepAliveService.ts` | Tự động kết nối khi mở app (đã làm ở commit `87df869`). |
| Chẩn đoán DTC + Knowledge (rule engine) | ✅ Có sẵn | `src/services/obd/diagnosticEngine.ts`, `dtcOfflineDictionary.ts`, `diagnosticRulesStore.ts` | Đây là ứng viên cho `KnowledgeClient`. |
| Speech-to-Text | ✅ Có sẵn, nhưng dùng cho mục đích hẹp | `src/hooks/useVoiceInput.ts` (dùng `expo-speech-recognition`) | Hiện chỉ dùng để đọc số tiền/số lít khi nhập liệu form (vd "500 nghìn" → `500000`). Chưa nối vào bất kỳ luồng hội thoại nào. |
| Text-to-Speech | ❌ Chưa có | — | Chưa cài package nào (`expo-speech` chưa có trong `package.json`). |
| LLM (client hoặc backend) | ❌ Chưa có | — | Không có `ANTHROPIC_API_KEY`/OpenAI key, không có endpoint AI nào ở backend Laravel. |
| Tool Registry / Intent Manager / Conversation Manager | ❌ Chưa có | — | Cần xây từ đầu — nội dung chính của tài liệu này. |
| Mascot "Nori" hiện tại | ✅ Có, nhưng chỉ là UI thuần | `src/services/nori/nori.ts`, `noriSummary.ts`, `assets/nori/nori-icon.png` | Đây là logic tâm trạng (mood: happy/warn/urgent) cho card sức khỏe xe ở Home — **không phải AI**, không có LLM. Sẽ giữ nguyên, KHÔNG động vào; `NoriAgent` là tính năng mới, tách biệt (dùng chung tên thương hiệu "Nori" nhưng khác module). |
| REST API layer sẵn có | ✅ Rất đầy đủ | `src/api/*.ts` (vehicles, refuels, odometer, services/maintenance, reminders, timeline, dashboard...) | Đây chính là `NoteDriApi` — tool nào cần ghi/đọc dữ liệu nghiệp vụ sẽ gọi lại các hàm này, **không viết API client mới**. |
| Backend Laravel | ✅ Repo riêng `c:\laragon\www\notedri` | `routes/api.php` (prefix `v1`, `auth:sanctum`), `app/Http/Controllers/Api/V1/*` | Cần thêm route/controller mới cho AI proxy — xem mục 6. |

**Kết luận quan trọng:** phần lớn "OBD Manager" + "Vehicle Cache" trong đề xuất ban đầu **đã tồn tại và đã chạy production**. Việc cần làm KHÔNG phải là xây lại tầng OBD, mà là xây tầng Agent (Tool Registry, Conversation Manager, kết nối LLM) **bọc lên trên** hạ tầng đã có.

---

## 3. Quyết định kiến trúc đã chốt

Các câu hỏi mở đã được thảo luận và chốt như sau (2026-07-26):

1. **Phạm vi vòng 1 (Phase 1): xây Agent core trước, chưa làm voice.**
   Lý do: STT đã có nhưng TTS và LLM đều chưa có — làm full voice pipeline ngay rủi ro cao vì nhiều mảnh ghép đồng thời. Ưu tiên: `NoriAgent` lõi (Tool Registry + Vehicle Context + Conversation Manager) chạy đúng qua giao diện **chat dạng text** trước, sau đó mới nối STT/TTS vào.

2. **LLM được gọi từ backend Laravel, không gọi thẳng từ app.**
   Lý do: giữ API key an toàn (không nhúng trong APK), tận dụng `auth:sanctum` + rate-limit sẵn có, đúng tinh thần "business logic thuộc backend". App vẫn giữ vai trò thực thi Tool (vì chỉ app mới đọc được BLE/Vehicle Cache tại chỗ) — backend chỉ đóng vai trò "bộ não ngôn ngữ" (hiểu ý định, chọn tool, viết câu trả lời), không thực thi tool.

3. **Model đề xuất: Claude Haiku 4.5 (`claude-haiku-4-5`).**
   Lý do: việc LLM phải làm ở đây chủ yếu là *điều phối* (chọn đúng tool trong danh sách có sẵn, ghép tham số, viết lại kết quả tool thành câu tiếng Việt tự nhiên) — không phải suy luận sâu. Đây đúng là loại việc Haiku 4.5 làm tốt với chi phí thấp nhất trong dòng model hiện tại ($1 / $5 mỗi triệu token input/output, so với Sonnet 5 $3/$15 hay Opus 5 $5/$25). Haiku 4.5 hỗ trợ đầy đủ tool use (function calling) qua Messages API — đủ cho toàn bộ danh sách tool ở mục 5. Nếu sau này có ca khó (vd người dùng hỏi mơ hồ, cần suy luận nhiều bước) có thể escalate sang Sonnet 5 cho riêng những request đó, nhưng **không cần thiết ở Phase 1**.
   → Backend `.env` cần thêm `ANTHROPIC_API_KEY` (chưa có, cần đăng ký/lấy từ team).

---

## 4. Kiến trúc tổng thể (Phase 1 — text-first)

```
User gõ tin nhắn (app)
        │
        ▼
┌───────────────────────────── App (notedri-app) ─────────────────────────────┐
│  NoriAgent                                                                   │
│   ├── ConversationManager   (giữ lịch sử hội thoại, điều phối vòng lặp)     │
│   ├── ToolRegistry          (khai báo + validate input tool)                │
│   ├── VehicleContext        (đọc snapshot từ obdLiveMonitor — KHÔNG poll)   │
│   ├── NoteDriApi            (bọc lại src/api/*.ts hiện có)                  │
│   └── KnowledgeClient       (bọc lại diagnosticEngine/dtcOfflineDictionary) │
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
                                     │
                                     ▼
        Gửi tool_results ngược lại backend → lặp lại đến khi có câu trả lời cuối
                                     │
                                     ▼
                     Hiển thị câu trả lời trong NoriChatScreen (text)
```

Ở Phase sau (voice), sơ đồ mở rộng thêm 2 đầu:

```
Mic → VoiceManager (STT, dùng lại useVoiceInput) → NoriAgent (như trên) → TTSManager → Speaker
```

---

## 5. Danh sách Tool (Phase 1 — chỉ đọc, chưa có tool ghi dữ liệu)

Mỗi tool trả JSON thuần, map thẳng vào service/API **đã tồn tại**:

| Tool | Nguồn dữ liệu thật | File hiện có |
|---|---|---|
| `vehicle.getLiveData()` | Snapshot đầy đủ từ Vehicle Cache | `obdLiveMonitor.ts` |
| `vehicle.getSpeed()` | Vehicle Cache | `obdLiveMonitor.ts` |
| `vehicle.getRPM()` | Vehicle Cache | `obdLiveMonitor.ts` |
| `vehicle.getCoolant()` | Vehicle Cache | `obdLiveMonitor.ts` |
| `vehicle.getFuelLevel()` | Vehicle Cache | `obdLiveMonitor.ts` |
| `vehicle.getBatteryVoltage()` | Vehicle Cache | `obdLiveMonitor.ts` |
| `vehicle.readDTC()` | Vehicle Cache + `dtcOfflineDictionary` để giải nghĩa mã lỗi | `obdReaderDtcPhase2`, `dtcOfflineDictionary.ts` |
| `vehicle.getHealthScore()` | API backend đã có | `src/api/vehicles.ts` → `vehiclesApi.health()` |
| `vehicle.getTripToday()` | API GPS trips đã có | `src/api/gpsTrips.ts` |
| `vehicle.getCurrentODO()` | API odometer đã có | `src/api/odometer.ts` |
| `expense.summary()` | API đã có | `src/api/dashboard.ts` (hoặc endpoint tổng hợp chi phí hiện có — cần xác nhận tên chính xác khi implement) |
| `maintenance.getUpcoming()` | API services/reminders đã có | `src/api/services.ts`, `src/api/reminders.ts` |
| `insurance.getStatus()` / `inspection.getReminder()` | Cần xác nhận đã có endpoint tương ứng chưa (khả năng nằm trong `reminders`/`dashboard`) | Cần rà soát khi implement |

**Chưa làm ở Phase 1** (để Phase 2, vì cần luồng hội thoại nhiều lượt kiểu "hỏi lại người dùng" — ví dụ ghi đổ xăng cần hỏi "đổ bao nhiêu tiền?" rồi "đầy bình chưa?"):

- `fuel.create()`, `fuel.getLatest()`
- `maintenance.create()`
- `vehicle.clearDTC()`
- `ocr.scanReceipt()`, `ocr.scanOdometer()`
- `navigation.goGarage()`, `user.profile()`, `system.settings()`

---

## 6. Việc cần làm ở backend Laravel (`c:\laragon\www\notedri`)

Repo Claude Code hiện tại **không thể chỉnh sửa trực tiếp** (cần mở phiên làm việc riêng trong repo đó). Ghi lại đây để người tiếp theo biết cần làm gì:

1. Thêm `ANTHROPIC_API_KEY` vào `.env` / `.env.example` + config (`config/services.php`).
2. Cài `anthropic-ai/sdk` (PHP) qua Composer — theo skill `claude-api` (đọc `php/claude-api/README.md` khi vào phiên backend).
3. Tạo `AiNoriController` (namespace `App\Http\Controllers\Api\V1`), route mới trong `routes/api.php`, nhóm cùng `auth:sanctum`:
   ```
   Route::post('ai/nori/chat', [AiNoriController::class, 'chat'])->middleware('throttle:20,1');
   ```
4. Controller nhận `{ messages: [...], tools: [...] }` từ app, gọi Anthropic Messages API với `model: "claude-haiku-4-5"` + `tools` (định nghĩa JSON schema khớp danh sách ở mục 5), trả về `stop_reason` + `content` gần nguyên bản cho app xử lý vòng lặp tool-calling (xem `shared/tool-use-concepts.md` trong skill `claude-api` nếu cần tham khảo pattern chuẩn).
5. **Không** để backend tự thực thi tool — chỉ forward tool_use blocks về app, nhận lại tool_result từ app ở request tiếp theo (giống hệt cách Anthropic tool use hoạt động bình thường, chỉ là "client" ở đây là app di động thay vì code backend).
6. Rate limit + log usage token (để theo dõi chi phí Haiku 4.5 theo user).

---

## 7. Việc cần làm ở app (`notedri-app`, repo này)

### 7.1 Cấu trúc thư mục đề xuất

```
src/
  agent/                        ← MỚI, toàn bộ logic Nori Agent nằm đây
    NoriAgent.ts                 orchestrator chính, điều phối vòng lặp hội thoại
    ConversationManager.ts       giữ lịch sử tin nhắn, gọi API backend, lặp tool-calling
    ToolRegistry.ts              đăng ký tool + validate input/output theo schema
    tools/
      vehicleTools.ts            vehicle.getSpeed/getRPM/... (đọc VehicleContext)
      businessTools.ts           expense.summary, maintenance.getUpcoming... (gọi NoteDriApi)
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

### 7.2 Không làm mới (tái dùng)

- Không viết lại BLE/OBD polling — `VehicleContext` chỉ đọc, không ghi.
- Không viết API client mới cho vehicles/refuels/reminders/... — `NoteDriApi` trong `agent/` chỉ là lớp mỏng gọi lại `src/api/*.ts`.
- Không đổi `src/services/nori/nori.ts` (mood logic của card Home) — đó là tính năng khác, giữ nguyên.

### 7.3 Voice (Phase 3, chưa làm ngay)

- STT: nối `useVoiceInput`/`ExpoSpeechRecognitionModule` (đã có) vào `NoriAgent.sendMessage()`.
- TTS: cần thêm package (`expo-speech` là lựa chọn built-in đơn giản nhất để bắt đầu — cần đánh giá chất lượng giọng tiếng Việt trước khi quyết định có cần TTS cloud (Google/Azure) hay không).

---

## 8. Roadmap theo giai đoạn

| Phase | Nội dung | Trạng thái |
|---|---|---|
| **0** | Tài liệu kế hoạch này | ✅ Xong (file này) |
| **1** | Backend: endpoint `ai/nori/chat` + Anthropic tool-use loop. App: `NoriAgent` lõi + `ToolRegistry` (tool đọc dữ liệu, bảng mục 5) + `NoriChatScreen` (text) | ⬜ Chưa bắt đầu |
| **2** | Tool ghi dữ liệu qua hội thoại nhiều lượt: `fuel.create()`, `maintenance.create()`, `vehicle.clearDTC()` (cần slot-filling: agent hỏi lại thiếu thông tin gì) | ⬜ Chưa bắt đầu |
| **3** | Voice: nối STT có sẵn vào `NoriAgent`, thêm `TTSManager` (chọn giải pháp TTS), nút mic trong `NoriChatScreen` hoặc màn hình riêng | ⬜ Chưa bắt đầu |
| **4** | Wake word, Background service (giữ agent sống khi app nền), tối ưu polling để không xung đột với OBD service hiện có | ⬜ Chưa bắt đầu |
| **5** | Platform Adapter cho phần cứng tương lai (màn hình ô tô Android, ESP32/XiaoZhi, Linux) — tách lớp giao tiếp phần cứng khỏi `NoriAgent`/`ToolRegistry` | ⬜ Chưa bắt đầu (thiết kế interface adapter nên làm từ Phase 1 để đỡ phải refactor sau) |

---

## 9. Câu hỏi còn mở / cần quyết định tiếp

- [ ] Xác nhận tên chính xác của endpoint backend cho `expense.summary()`, `insurance.getStatus()`, `inspection.getReminder()` — cần rà `routes/api.php` kỹ hơn khi implement (mục 6 mới chỉ khảo sát sơ bộ `vehicles`/`odometer`/`refuels`).
- [ ] Giải pháp TTS cho Phase 3: dùng `expo-speech` (offline, đơn giản) hay TTS cloud (chất lượng giọng tiếng Việt tốt hơn nhưng tốn phí + cần mạng)?
- [ ] Giới hạn rate-limit/chi phí Haiku 4.5 theo user — có cần gắn vào gói Premium hiện có không, hay free cho mọi user?
- [ ] Wake word (Phase 4) dùng giải pháp nào trên Android — cần nghiên cứu riêng, chưa có hướng.

---

## 10. Cho người/agent tiếp theo

Nếu bạn nhặt việc này lên: đọc mục 3 (quyết định đã chốt) và mục 6–7 (việc cụ thể) trước, đừng thiết kế lại từ đầu — kiến trúc lớn đã được thảo luận và chốt. Bắt đầu từ Phase 1: viết `AiNoriController` ở backend trước (vì app cần endpoint này để test), sau đó mới viết `NoriAgent`/`ToolRegistry` ở app.
