# NoteDri Mobile App - Development Guide

Local setup, device testing, environment variables, BLE gotchas, and GPS background task notes.

> **Before writing any code:** Read Expo v56 docs at https://docs.expo.dev/versions/v56.0.0/ - the managed workflow API surface changed significantly from earlier versions and AI-generated code based on older docs will be wrong.

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 20 LTS or 22 LTS | https://nodejs.org (use nvm) |
| npm | bundled with Node | - |
| Expo CLI | latest | `npm install -g expo-cli` (or use `npx expo`) |
| EAS CLI | >= 20.3.0 | `npm install -g eas-cli` |
| Android Studio | Latest stable | Required for Android emulator and native builds |
| Xcode | 15+ | macOS only; required for iOS builds and simulator |
| Physical Android device | Android 10+ | Recommended; BLE and GPS background task do not work in emulator |
| Physical iOS device | iOS 16+ | Required for BLE and background location testing |

---

## Environment Setup

### Clone and install

```bash
cd /home/miichi/TMP
git clone <repo-url> notedri-app
cd notedri-app
npm install
# patches are applied automatically via postinstall
```

### Environment variables

Create a `.env.local` file in the project root:

```bash
# .env.local (never commit this file)
EXPO_PUBLIC_API_URL=https://notedri.com
```

For development against a local Laravel backend:

```bash
EXPO_PUBLIC_API_URL=http://192.168.x.x:8000
# Use your machine's LAN IP - localhost does not work from a physical device
```

Expo reads any variable prefixed with `EXPO_PUBLIC_` from `.env`, `.env.local`, `.env.development`, or `.env.production` files at build time. Variables are **inlined at build time** - not read at runtime. A rebuild is required when you change them.

### Available env variables

| Variable | Default | Purpose |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `https://notedri.com` | Base URL for all API calls |

---

## Running Locally

### Option 1: Expo Go (limited - no BLE / GPS background)

```bash
npx expo start
```

Scan the QR code with Expo Go on your phone. **Limitation:** `react-native-ble-plx` and expo-task-manager background GPS are not supported in Expo Go (they require a custom native build). Use this only for UI development on screens that do not use hardware features.

### Option 2: Development client (recommended for hardware features)

A development client is a custom build of the app that includes all native modules. You must build it once, then use it for all subsequent dev sessions.

**Step 1:** Build the dev client (one-time per device / major dependency change):

```bash
eas build --profile development --platform android
# or for iOS:
eas build --profile development --platform ios
```

Install the resulting APK/IPA on your device.

**Step 2:** Start the dev server with dev client mode:

```bash
npx expo start --dev-client
```

**Step 3:** Open the app on your device. It will show a URL entry field. Enter the dev server URL displayed in your terminal (e.g., `exp://192.168.x.x:8081`).

From this point, the development workflow is the same as Expo Go - hot reload works, you can inspect logs in the terminal. But BLE and background GPS will work because the native modules are present.

### Android emulator (UI only)

```bash
npx expo start
# press 'a' to open in Android emulator
```

BLE and GPS background tasks do not work in the emulator. Acceptable for UI-only screen development.

---

## Running on a Physical Device (USB)

### Android (ADB)

```bash
# Enable USB debugging on device
# Connect via USB
adb devices              # verify device listed
npx expo run:android     # installs and launches (first run builds natively)
```

For subsequent runs with an existing dev client APK already installed:

```bash
npx expo start --dev-client
adb reverse tcp:8081 tcp:8081   # tunnel metro bundler
```

### iOS (Xcode)

```bash
npx expo run:ios --device   # lists connected devices
```

Or open `ios/` in Xcode and run from there after `npx expo prebuild --platform ios`.

---

## patch-package

The project uses `patch-package` to fix a `build.gradle` issue in `react-native-ble-plx`. Patches in `patches/` are applied automatically on `npm install` via the `postinstall` script.

If you upgrade `react-native-ble-plx` or add a new patch:

```bash
# Edit node_modules/<package>/<file> to make your fix, then:
npx patch-package react-native-ble-plx
# Commit the resulting patches/react-native-ble-plx+x.x.x.patch
```

If patches fail to apply after a package upgrade, delete the relevant `.patch` file, upgrade the package, and re-apply or remove the patch if the upstream fix has been merged.

---

## BLE OBD2 Gotchas

### Android permissions

BLE on Android 12+ requires `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT` permissions at runtime. These are declared in `app.json` but must also be requested at runtime. `BleService.scan()` should only be called after permissions are granted. Use `expo-permissions` or `PermissionsAndroid` (React Native built-in) to request them before calling `getBleService().scan()`.

`OBDSetupScreen` handles the permission request flow before initiating a scan.

### Location permission for BLE scan (Android)

Android requires `ACCESS_FINE_LOCATION` to perform a BLE scan (OS requirement, not related to GPS). The permission request in `OBDSetupScreen` includes this.

### No BLE in emulator

BLE is a hardware feature. Android emulator does not have BLE hardware. Always test OBD2 features on a physical Android device with an ELM327 or Vgate iCar adapter plugged into the OBD2 port.

### ELM327 adapter compatibility

Not all cheap ELM327 clones are compatible. The app supports:
- Generic ELM327 clones with `FFF0` service UUID
- Vgate iCar Pro (tested and confirmed)

Chinese clones with different UUID profiles may not work without adding a new adapter profile to `BleService.ts`. See `J16 protocol.pdf` in the project root for the AT command specification.

### iOS BLE background

On iOS, BLE connections are suspended when the app goes to background. `TripSession` uses `AppState` to handle the gap. OBD2 features on iOS are foreground-only effectively - the user must keep the app open for trip recording.

---

## GPS Background Task Setup

### Android

On Android 10+, background location requires a foreground service notification. This is configured in `app.json`:

```json
{
  "plugins": [
    ["expo-location", {
      "locationAlwaysAndWhenInUsePermission": "NoteDri needs location to track your trips in the background.",
      "isAndroidBackgroundLocationEnabled": true,
      "isAndroidForegroundServiceEnabled": true
    }]
  ]
}
```

The foreground service notification appears in the notification shade while tracking is active. This is an Android OS requirement - it cannot be hidden.

### iOS

iOS background location works when the user grants "Always Allow" location permission. The app requests this when GPS tracking is first enabled.

Background task is registered with `expo-task-manager`. On iOS, background execution time is limited by the OS but the location updates are delivered as location events (not time-based), so the background task is woken for each significant location change.

### Testing background GPS

1. Build a dev client (background tasks do not run in Expo Go).
2. Start a GPS trip from the app.
3. Put the app in the background or lock the screen.
4. Drive (or simulate movement using a GPS spoofing app).
5. Return to the app - the trip should show accumulated distance.

On Android emulator you can use the "Extended Controls > Location" panel to simulate GPS movement, but the background foreground service will not run correctly in the emulator.

---

## Code Conventions

| Convention | Detail |
|---|---|
| TypeScript | Strict mode enabled (`tsconfig.json`). Avoid `any` - use proper types. |
| Imports | Absolute imports from `src/` if path aliases are configured in `tsconfig.json`; otherwise relative. Check `tsconfig.json` for `paths`. |
| Components | Functional components with `React.FC` or explicit props type. |
| Styles | `StyleSheet.create()` in each component file. Access theme colors via `useThemeStore().colors`. |
| Translations | Always use `const { t } = useI18nStore()` and `t('key')`. Never hardcode Vietnamese or English strings in JSX. |
| Currency | Use `MoneyInput` for VND input fields. Use `format.ts` helpers for display. |
| Dates | Use `dayjs` for all date manipulation. Import from `dayjs` not `Date`. |
| Navigation | Use the typed navigation prop from React Navigation. Do not use the `navigation` ref in components (only for service-layer usage in `src/utils/navigation.ts`). |

---

## Common Development Tasks

### Add a new screen

1. Create `src/screens/<feature>/MyNewScreen.tsx`
2. Add to `AppNavigator.tsx` (or `AuthNavigator.tsx`) with a route name
3. Add the route name to the navigator's param list type
4. Add translations to `src/i18n/vi.ts` and `src/i18n/en.ts`

### Add a new API endpoint

1. Add the function to the relevant `src/api/<domain>.ts` (or create a new file)
2. Create or update the corresponding hook in `src/hooks/use<Domain>.ts`
3. Add the query key to the domain's key list

### Add a new translation key

1. Add to `src/i18n/vi.ts` (Vietnamese, the source of truth)
2. Add the English equivalent to `src/i18n/en.ts`
3. Use via `t('your.new.key')` in components

### Update native dependencies (adds/removes native module)

After adding or removing a native module (one that has `android/` or `ios/` native code):

```bash
# If using managed workflow with Expo config plugins:
npx expo prebuild --clean

# Rebuild the dev client:
eas build --profile development --platform android
```

---

## Debugging Tips

### Metro bundler logs

```bash
npx expo start --dev-client
# logs appear in the terminal; also available in the Expo Dev Tools browser at http://localhost:8081
```

### React Native Debugger

Connect the Expo dev client to React Native Debugger (standalone app) for Redux/Zustand state inspection and network request logging.

### BLE debugging

Add `console.log` in `BleService.ts` to trace AT command sends and responses. The ELM327 adapter echoes back all sent bytes on the notify characteristic before the response - `BleService` must filter these out.

### Zustand devtools

In development builds, Zustand stores can be connected to the React Native Debugger devtools extension if the stores use `devtools()` middleware. Currently not configured - add if needed.

### TanStack Query devtools

TanStack Query does not have an official React Native devtools panel. Use `queryClient.getQueryCache()` in a debug screen or console to inspect cache state.
