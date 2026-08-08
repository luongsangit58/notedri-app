#!/usr/bin/env bash
# Đẩy file APK vừa build lên GitHub Releases (repo public) để có link tải trực tiếp cho user
# không vào được CH Play (chủ yếu màn hình Android ô tô không có/không đăng nhập được Google
# Play). Asset luôn đặt tên "app-release.apk" nên link tải sau đây KHÔNG đổi qua các lần release,
# luôn tự trỏ về bản mới nhất:
#   https://github.com/luongsangit58/notedri-app/releases/latest/download/app-release.apk
#
# Dùng: scripts/release-apk.sh [đường-dẫn-apk]
#   (mặc định: android/app/build/outputs/apk/release/app-release.apk - file build:apk/gradle
#   assembleRelease sinh ra)
set -euo pipefail
cd "$(dirname "$0")/.."

APK="${1:-android/app/build/outputs/apk/release/app-release.apk}"
if [[ ! -f "$APK" ]]; then
  echo "Không thấy file APK: $APK (build trước bằng 'npm run build:apk' hoặc gradle assembleRelease - xem BUILD.md)" >&2
  exit 1
fi

if ! command -v gh &>/dev/null; then
  echo "Cần cài GitHub CLI (gh) - xem https://cli.github.com" >&2
  exit 1
fi
if ! gh auth status &>/dev/null; then
  echo "Chưa đăng nhập gh. Chạy: gh auth login" >&2
  exit 1
fi

VERSION_NAME=$(node -p "require('./app.json').expo.version")
VERSION_CODE=$(node -p "require('./app.json').expo.android.versionCode")
TAG="v${VERSION_NAME}-${VERSION_CODE}"

echo "== Kiểm tra chữ ký APK khớp keystore Google Play (SHA-1 E7:C3:62:65:6A:94:40:6E:75:0E:01:EB:A5:43:C2:FC:8D:59:FA:D4) =="
SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$LOCALAPPDATA/Android/Sdk}}"
APKSIGNER=$(find "$SDK_ROOT/build-tools" -iname "apksigner.bat" 2>/dev/null | sort -V | tail -1)
if [[ -n "$APKSIGNER" ]]; then
  SHA1=$("$APKSIGNER" verify --print-certs "$APK" | grep "SHA-1 digest" | awk '{print $NF}')
  echo "  SHA-1 thực tế: $SHA1"
  if [[ "$SHA1" != "e7c362656a94406e750e01eba543c2fc8d59fad4" ]]; then
    echo "  ⚠️  SHA-1 KHÔNG khớp keystore production! Dừng lại, kiểm tra keystore trước khi phát hành công khai." >&2
    exit 1
  fi
else
  echo "  (không tìm thấy apksigner, bỏ qua kiểm tra tự động - tự kiểm tra thủ công nếu cần)"
fi

echo "== Tạo release $TAG, đính kèm $APK (giữ nguyên tên asset app-release.apk) =="
gh release create "$TAG" "$APK" \
  --title "NoteDri $VERSION_NAME ($VERSION_CODE)" \
  --notes "Build APK để cài trực tiếp (sideload) cho thiết bị không vào được CH Play - vd màn hình Android ô tô. Ký cùng khoá với bản phát hành trên Google Play."

echo "== Xong. Link tải cố định (luôn là bản mới nhất): =="
echo "https://github.com/luongsangit58/notedri-app/releases/latest/download/app-release.apk"
