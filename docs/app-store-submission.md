# App Store Submission — Review Notes & Listing Draft

Draft content to paste into App Store Connect once the Apple Developer Program
enrollment is Active. Everything below is based on the actual permissions and
features in this codebase (see `app.json`, `docs/project-overview.md`) — update
if the feature set changes before submitting.

---

## 1. App Review Notes

Paste into **App Store Connect → App Review Information → Notes**. Written in
English since Apple reviewers default to English regardless of the app's
primary language.

```
NoteDri is a personal vehicle logbook app (fuel, cost, maintenance, GPS trips,
optional OBD2 diagnostics) for cars, motorbikes and EVs. Notes on the
permissions this build requests:

- Location (Always/background): trips are recorded automatically by detecting
  driving speed, including when the app is backgrounded — this is the core
  "auto trip tracking" feature and the only use of background location. It is
  not used for ads or analytics.
- Bluetooth: used only to connect to an ELM327/Vgate-type OBD2 Bluetooth
  adapter plugged into the vehicle's diagnostic port, to read live engine data
  and diagnostic trouble codes (DTC). This requires the reviewer to have a
  physical adapter connected to a vehicle to see live data — if one is not
  available, the DTC Lookup feature (Diagnostics tab) works without any
  adapter or Premium subscription and can be used to verify this area of the
  app.
- Camera / Photo Library: optional — lets the user photograph an odometer or
  fuel receipt for OCR auto-fill instead of typing the numbers by hand.
- Microphone / Speech Recognition: optional — lets the user speak an odometer
  reading or amount instead of typing it. Audio is transcribed on-device/via
  the OS speech API and is not stored.
- Advertising identifier (iOS ATT prompt): the app shows Google AdMob ads to
  keep the free tier sustainable; the App Tracking Transparency prompt is
  shown before any ad personalization. Declining still shows (non-personalized)
  ads.

Demo account: appreview@notedri.com / Admin@123, pre-loaded with at least one
vehicle, a few fuel/odometer logs, and one reminder so the reviewer isn't
looking at an empty state. Sign in with Apple and Sign in with Google are
also both available on the login screen.

Update (this version): the previous "redeem code" mechanism that unlocked
Premium outside of In-App Purchase (flagged under Guideline 3.1.1) has been
completely removed. Premium is now purchased exclusively through StoreKit
auto-renewable subscriptions (3/6/12-month plans). No external code, link, or
backend mechanism grants Premium access.
```

---

## 2. Demo Account — status

Account created: `appreview@notedri.com` / `Admin@123`.

Still to verify before submitting (log in and check manually):
- [ ] Has at least 1 vehicle (car or motorbike)
- [ ] Has 2-3 fuel/refuel log entries (so Reports/Stats isn't empty)
- [ ] Has 1 upcoming maintenance reminder
- [ ] Consider setting `is_premium = true` on this account so the reviewer can
  see Premium screens (OBD2 live dashboard UI, data export) without needing to
  complete a real Sandbox purchase — optional, but reduces back-and-forth if
  the reviewer tries a Premium-gated screen

---

## 3. Store Listing — English (primary submission language for review)

**Subtitle** (≤30 chars): `Drive Smarter, Optimize Costs`

**Promotional text** (≤170 chars, editable anytime without a new review):
```
Auto-track trips by GPS, log fuel by voice or photo, and get maintenance
reminders before deadlines. Your vehicle's health, cost and history — all in
one app.
```

**Description** (≤4000 chars):
```
NoteDri is your all-in-one vehicle logbook and health tracker for cars,
motorbikes and EVs.

Track fuel, costs and maintenance in seconds — by hand, by voice, or straight
from a photo of your dashboard or receipt. Get timely reminders before your
inspection, insurance or registration expires, and watch your Vehicle Health
Score update automatically as you log data.

KEY FEATURES
• Fuel & odometer logging — snap a photo of your dashboard or receipt (OCR),
  or just speak the numbers
• Cost & consumption reports — see exactly where your money goes, plus a
  year-in-review recap
• Maintenance reminders — never miss an oil change, inspection or
  registration deadline
• Automatic GPS trip tracking — starts and stops on its own as you drive,
  with a route map and a driving score
• Nearby fuel stations & EV charging points on the map
• Vehicle Health Score — a simple score built from your vehicle's age,
  service history and driving data
• OBD2 diagnostics — connect a Bluetooth ELM327/Vgate adapter to read live
  engine data (RPM, speed, coolant temperature, fuel level) and diagnostic
  trouble codes; DTC lookup works even without an adapter or Premium
• Multi-vehicle garage — manage every car, motorbike or EV you own in one
  place

NoteDri also works at notedri.com, so your data stays in sync between the
web and the app.

Fuel consumption, cost and health-score figures are estimates based on the
data you enter and are for reference only — they do not replace manufacturer,
inspection-authority or professional advice.
```

**Keywords** (≤100 chars, comma-separated, no spaces around commas):
```
fuel log,car maintenance,OBD2,mileage tracker,vehicle expense,GPS trip,car care,gas mileage,DTC
```

---

## 4. Store Listing — Vietnamese (secondary locale, optional at launch)

**Subtitle**: `Lái xe thông minh, tiết kiệm hơn`

**Description**:
```
NoteDri là sổ tay điện tử quản lý xe toàn diện cho ô tô, xe máy và xe điện.

Ghi xăng, chi phí và lịch bảo dưỡng chỉ trong vài giây — nhập tay, đọc bằng
giọng nói, hoặc chụp ảnh đồng hồ/hoá đơn để tự động điền số. Nhận nhắc nhở
trước khi hết hạn đăng kiểm, bảo hiểm, đăng ký; theo dõi Điểm sức khoẻ xe tự
động cập nhật theo dữ liệu bạn nhập.

TÍNH NĂNG CHÍNH
• Ghi số công-tơ-mét & đổ xăng — chụp ảnh đồng hồ/hoá đơn (OCR) hoặc đọc bằng
  giọng nói
• Báo cáo chi phí & tiêu hao — biết rõ tiền đi đâu, có tổng kết cuối năm
• Nhắc lịch bảo dưỡng — không bỏ lỡ thay nhớt, đăng kiểm, đăng ký xe
• Ghi hành trình GPS tự động — tự bắt đầu/kết thúc khi bạn lái xe, kèm bản đồ
  và điểm lái xe
• Tìm cây xăng & trạm sạc gần nhất trên bản đồ
• Điểm sức khoẻ xe — tổng hợp từ tuổi xe, lịch sử bảo dưỡng và dữ liệu vận hành
• Chẩn đoán OBD2 — kết nối adapter Bluetooth ELM327/Vgate để đọc thông số
  động cơ (vòng tua, tốc độ, nhiệt độ nước làm mát, mức xăng) và mã lỗi (DTC);
  tra mã lỗi dùng được ngay cả khi chưa có adapter hoặc chưa nâng cấp Premium
• Quản lý nhiều xe cùng lúc trong một gara

NoteDri cũng hoạt động trên notedri.com, dữ liệu đồng bộ giữa web và app.

Các số liệu tiêu hao, chi phí và điểm sức khoẻ chỉ mang tính tham khảo dựa
trên dữ liệu bạn nhập, không thay thế khuyến cáo của nhà sản xuất, cơ quan
đăng kiểm hay chuyên gia kỹ thuật.
```

---

## 5. URLs & category

| Field | Value |
|---|---|
| Support URL | `https://notedri.com` (or a dedicated `/support` page if you want one) |
| Marketing URL | `https://notedri.com` |
| Privacy Policy URL | `https://notedri.com/garage/legal/privacy` |
| Primary category | Utilities |
| Secondary category | Navigation *or* Lifestyle (either is defensible given GPS trips + garage management) |

## 6. Age rating questionnaire

No user-generated content shown to others by default (the "public sổ tay"
link is opt-in per vehicle), no gambling, no mature content → expect **4+**.
Answer "No" to all the objectionable-content questions unless something in
the app changes.

## 7. Still open before you can actually submit

- [ ] Apple Developer Program must show **Active** (currently processing)
- [ ] `eas credentials --platform ios` (interactive, needs your Apple ID + 2FA)
- [ ] Create the app in App Store Connect, get its App ID for `eas.json`'s
      `submit.production.ios`
- [ ] Fill in the App Privacy Nutrition Label using `notedri` repo's updated
      privacy policy as the source of truth (Location, Camera, Microphone,
      Bluetooth, Advertising Identifier)
- [x] Demo account created (see §2) — still needs data seeded/verified
- [ ] iPhone 6.7" screenshots (required); iPad screenshots only if
      `supportsTablet: true` stays enabled in `app.json`
- [ ] `eas build --platform ios --profile production`
- [ ] `eas submit --platform ios --profile production`
- [ ] Paste §1/§3/§4/§5/§6 content into App Store Connect, attach screenshots,
      submit for review
