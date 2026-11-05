#!/usr/bin/env bash
# Disposable GitHub runner only. Never accepts SDK agreements or contacts the game.
set -euo pipefail
api_level="$1"
[[ "$api_level" == 29 || "$api_level" == 36 ]]
image_package="system-images;android-${api_level};google_apis;x86_64"
"$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --install "$image_package" emulator </dev/null
export ANDROID_AVD_HOME="$RUNNER_TEMP/kingdom-avd"
mkdir -p "$ANDROID_AVD_HOME"
printf 'no\n' | "$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager" create avd --force --name kingdom-play --package "$image_package" --device pixel_2
"$ANDROID_HOME/emulator/emulator" -avd kingdom-play -port 5554 -cores 2 -memory 2048 -no-window -gpu swiftshader_indirect -no-snapshot -noaudio -no-boot-anim -camera-back none > "$RUNNER_TEMP/kingdom-emulator.log" 2>&1 &
emulator_pid=$!
cleanup() { adb -s emulator-5554 emu kill >/dev/null 2>&1 || true; kill "$emulator_pid" >/dev/null 2>&1 || true; }
trap cleanup EXIT
trap 'exit 1' INT TERM
timeout 120 adb -s emulator-5554 wait-for-device
ready=0
for _ in $(seq 1 90); do
  kill -0 "$emulator_pid"
  if [[ "$(adb -s emulator-5554 shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == 1 ]]; then ready=1; break; fi
  sleep 2
done
[[ "$ready" == 1 ]]
adb -s emulator-5554 shell settings put system font_scale 1.3
adb -s emulator-5554 install emulator-input/app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5554 install emulator-input/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb -s emulator-5554 shell am instrument -w game.kingdomcome.alpha.debug.test/game.kingdomcome.alpha.ShellInstrumentation > android-webview-result.txt
cat android-webview-result.txt
grep -q 'ANDROID_WEBVIEW: PASS' android-webview-result.txt
! grep -q 'ANDROID_WEBVIEW: FAIL' android-webview-result.txt
