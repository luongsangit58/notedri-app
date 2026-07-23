#!/usr/bin/env bash
# Build APK/AAB local qua eas-cli, có dọn bớt Gradle daemon cũ trước/sau để tránh
# cộng dồn RAM giữa các lần build (nguyên nhân hay gặp khi máy đang free RAM thấp).
# Dùng: scripts/build-local.sh preview     (APK, 1 kiến trúc CPU - test nhanh)
#       scripts/build-local.sh production  (AAB, đủ 4 kiến trúc CPU - nộp Play Store)
set -euo pipefail

PROFILE="${1:-preview}"
if [[ "$PROFILE" != "preview" && "$PROFILE" != "production" ]]; then
  echo "Dùng: $0 [preview|production]" >&2
  exit 1
fi

echo "== RAM trước khi build =="
free -h

echo "== Dừng Gradle daemon cũ (nếu có) để giải phóng RAM còn giữ từ lần build trước =="
pkill -f 'org\.gradle\.launcher\.daemon\.bootstrap' 2>/dev/null && sleep 1 || echo "  (không có daemon nào đang chạy)"

ARGS=(build --platform android --profile "$PROFILE" --local)

if [[ "$PROFILE" == "preview" ]]; then
  # APK chỉ cần chạy trên máy test -> giới hạn 1 kiến trúc CPU, giảm hẳn RAM/CPU cần dùng
  export ORG_GRADLE_PROJECT_reactNativeArchitectures=arm64-v8a
  export GRADLE_OPTS="-Dorg.gradle.jvmargs=-Xmx3g -Dorg.gradle.workers.max=2"
else
  # AAB nộp Play Store phải đủ 4 kiến trúc CPU -> không giới hạn ABI, chỉ giới hạn heap/worker
  unset ORG_GRADLE_PROJECT_reactNativeArchitectures || true
  export GRADLE_OPTS="-Dorg.gradle.jvmargs=-Xmx4g -Dorg.gradle.workers.max=2"
fi

echo "== Build $PROFILE (GRADLE_OPTS=$GRADLE_OPTS) =="
npx eas-cli "${ARGS[@]}"
STATUS=$?

echo "== Dừng Gradle daemon vừa tạo để trả lại RAM cho máy =="
pkill -f 'org\.gradle\.launcher\.daemon\.bootstrap' 2>/dev/null || true

echo "== RAM sau khi build =="
free -h

exit $STATUS
