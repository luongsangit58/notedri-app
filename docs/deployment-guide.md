# NoteDri Mobile App - Deployment Guide

EAS Build configuration, build commands, store submission, OTA updates, and production environment variables.

---

## EAS Configuration Overview

**File:** `eas.json`

```json
{
  "cli": {
    "version": ">= 20.3.0"
  },
  "build": {
    "development": { ... },
    "preview": { ... },
    "production": { ... }
  },
  "submit": {
    "production": { ... }
  }
}
```

**EAS Project ID:** `92c0bda5-b744-47c5-b06d-12bff12b13f9`
Set in `app.json` under `expo.extra.eas.projectId`.

---

## Build Profiles

### development

Produces a **dev client** build. Used by developers for local testing with full native module support (BLE, GPS background task).

```json
"development": {
  "developmentClient": true,
  "distribution": "internal"
}
```

| Property | Value |
|---|---|
| Output | APK (Android) / IPA (iOS) |
| Distribution | Internal (EAS dashboard or direct install) |
| Purpose | Developer device setup; enables hot reload via dev client |
| Expo Updates | Disabled |

Build command:
```bash
eas build --profile development --platform android
eas build --profile development --platform ios
```

### preview

Produces an **APK** for Android (direct install, no Play Store). Used for internal QA, stakeholder reviews, and beta testing.

```json
"preview": {
  "android": {
    "buildType": "apk"
  },
  "distribution": "internal"
}
```

| Property | Value |
|---|---|
| Output | APK |
| Distribution | Internal (EAS dashboard direct download) |
| Purpose | QA, internal testing, demos |
| Expo Updates | Enabled (can receive OTA updates) |

Build command:
```bash
eas build --profile preview --platform android
```

Share the APK download link from the EAS dashboard with testers.

### production

Produces an **AAB** (Android App Bundle) for Play Store, with Proguard minification enabled and auto-incrementing build number.

```json
"production": {
  "android": {
    "buildType": "app-bundle",
    "gradleCommand": ":app:bundleRelease"
  },
  "autoIncrement": true
}
```

| Property | Value |
|---|---|
| Android output | AAB (required by Google Play) |
| iOS output | IPA (signed for App Store) |
| Proguard | Enabled (Android code shrinking) |
| Build number | Auto-incremented by EAS |
| Distribution | Store |
| Expo Updates | Enabled |

Build command:
```bash
eas build --profile production --platform android
eas build --profile production --platform ios
eas build --profile production --platform all   # both at once
```

---

## Pre-Build Checklist

Before every production build:

- [ ] `EXPO_PUBLIC_API_URL` is set to `https://notedri.com` (not a dev/staging URL)
- [ ] `app.json` `version` is updated (semantic version)
- [ ] Changelog or release notes prepared
- [ ] All pending `TripSyncQueue` / `GpsTripSyncQueue` items are confirmed to upload correctly against production API
- [ ] BLE OBD2 tested on physical device with ELM327 adapter
- [ ] GPS background tracking tested on physical device (device screen off for 5+ minutes)
- [ ] Push notifications tested (send from backend, receive on device)
- [ ] Dark and light theme tested
- [ ] Both vi and en language tested
- [ ] Premium-gated screens tested against a Premium account

---

## Environment Variables for Production

EAS Build can inject secrets as environment variables at build time. Set them via:

```bash
eas secret:create --scope project --name EXPO_PUBLIC_API_URL --value "https://notedri.com"
```

Or set them in the EAS dashboard under Project > Secrets.

| Secret Name | Value for Production |
|---|---|
| `EXPO_PUBLIC_API_URL` | `https://notedri.com` |

Variables prefixed with `EXPO_PUBLIC_` are inlined at build time and visible in the JavaScript bundle (treat as public). Never put sensitive secrets (private keys, API secrets) in `EXPO_PUBLIC_` variables.

---

## Signing Configuration

### Android

Signing is managed by EAS. On first production build, EAS generates a keystore and stores it securely in EAS infrastructure.

**Important:** If you ever need to migrate away from EAS, export the keystore:
```bash
eas credentials --platform android
# Follow prompts to download the keystore
```

The keystore must be consistent across all builds - changing it invalidates existing installs for users (they would need to uninstall and reinstall).

### iOS

EAS manages iOS Distribution Certificate and Provisioning Profile via Apple Developer Program.

Required Apple Developer Program membership (paid, $99/year USD).

```bash
# Configure credentials:
eas credentials --platform ios
```

---

## Store Submission

### Google Play Store

```bash
# After a successful production build:
eas submit --profile production --platform android
```

EAS Submit uploads the AAB to Google Play Console. First-time setup:

1. Create an app in Google Play Console
2. Complete the store listing (screenshots, description)
3. Set up EAS Submit with a Google Play service account key:
   ```bash
   eas secret:create --scope project --name GOOGLE_SERVICE_ACCOUNT_KEY_JSON --value "$(cat service-account.json)"
   ```
4. Configure `eas.json` submit section:
   ```json
   "submit": {
     "production": {
       "android": {
         "serviceAccountKeyPath": "PATH_OR_ENV_VAR",
         "track": "production"
       }
     }
   }
   ```

### Apple App Store

```bash
eas submit --profile production --platform ios
```

Requires Apple ID credentials stored in EAS:
```bash
eas secret:create --scope project --name APPLE_ID --value "your@apple.id"
eas secret:create --scope project --name APPLE_APP_SPECIFIC_PASSWORD --value "xxxx-xxxx-xxxx-xxxx"
```

---

## OTA Updates (Expo Updates)

Expo Updates allows pushing JavaScript-only changes directly to users without a new app store release. The native binary stays the same; only the JS bundle is updated.

### When to use OTA vs. full build

| Change type | OTA update | Full build |
|---|---|---|
| JavaScript / TypeScript changes | Yes | Not required |
| New React Native library with native code | No | Required |
| `app.json` changes (permissions, plugins) | No | Required |
| Asset changes (images, fonts) | Yes (bundled assets) | Not required |
| Native module version upgrade | No | Required |

### Publishing an OTA update

```bash
# Publish to the "production" channel (targets production builds)
eas update --channel production --message "Fix fuel price display"

# Publish to preview channel (targets preview builds)
eas update --channel preview --message "Test new dashboard layout"
```

Users receive the update on next app launch (downloaded in background, applied on next restart).

### Update channels

| Channel | Profile | Who receives |
|---|---|---|
| `production` | production | All production app store users |
| `preview` | preview | Internal testers with preview APK |
| `development` | development | Developer devices |

---

## Build Monitoring

Monitor builds at: https://expo.dev/accounts/<account>/projects/notedri-app/builds

```bash
# List recent builds:
eas build:list

# View build details:
eas build:view <build-id>

# Download build artifact:
eas build:download <build-id>
```

---

## Version Management

`app.json` has two version fields:

```json
{
  "version": "1.0.0",             // Semantic version shown to users
  "android": {
    "versionCode": 1              // Integer build number (auto-incremented in production profile)
  },
  "ios": {
    "buildNumber": "1.0.0"       // String build number (auto-incremented in production profile)
  }
}
```

With `"autoIncrement": true` in the production EAS profile, EAS automatically increments `versionCode` (Android) and `buildNumber` (iOS) on each production build. You only need to manually update `version` (semantic version) for major/minor releases.

---

## Troubleshooting Builds

### Build fails with native module error

```bash
# Check if patches are applied correctly:
cat patches/*.patch

# Ensure android/ is up to date:
npx expo prebuild --clean
eas build --profile production --platform android
```

### "This app requires a newer version of Expo" error on device

The dev client build is tied to the Expo SDK version. If you upgrade the SDK, rebuild the dev client.

### Proguard stripping needed classes (Android production)

Add a `proguard-rules.pro` entry in `android/app/` to keep the affected class:
```
-keep class com.example.lib.** { *; }
```

### iOS build fails with signing error

```bash
# Reset EAS credentials and regenerate:
eas credentials --platform ios
```

### OTA update not received by users

- Check that the update was published to the correct channel
- Confirm `runtimeVersion` in `app.json` matches the installed build (mismatched runtimeVersion means the update is silently ignored)
- Check https://expo.dev for update publish status

---

## Rollback

### OTA rollback

```bash
# Roll back to a previous update:
eas update:rollback --channel production
```

### Full build rollback

Submit the previous production build to the store via the store console (Google Play or App Store Connect both support re-publishing previous builds). No EAS command needed.
