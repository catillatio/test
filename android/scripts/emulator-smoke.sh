#!/usr/bin/env bash
# Disposable GitHub runner only. Never accepts SDK agreements or contacts the game.
set -euo pipefail
export PATH="$ANDROID_HOME/platform-tools:$PATH"
stage=BOOT
api_level="$1"
[[ "$api_level" == 29 || "$api_level" == 36 ]]
image_package="system-images;android-${api_level};google_apis;x86_64"
"$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --install "$image_package" emulator </dev/null
export ANDROID_AVD_HOME="$RUNNER_TEMP/kingdom-avd"
mkdir -p "$ANDROID_AVD_HOME"
printf 'no\n' | "$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager" create avd --force --name kingdom-play --package "$image_package" --device pixel_2
"$ANDROID_HOME/emulator/emulator" -avd kingdom-play -port 5554 -cores 2 -memory 2048 -no-window -gpu swiftshader_indirect -no-snapshot -noaudio -no-boot-anim -camera-back none > "$RUNNER_TEMP/kingdom-emulator.log" 2>&1 &
emulator_pid=$!
cleanup() {
  original_status=$?
  trap - EXIT
  if [[ "$original_status" != 0 ]]; then
    umask 077
    private_diagnostic="$RUNNER_TEMP/kingdom-emulator-diagnostic"
    mkdir -p "$private_diagnostic"; chmod 700 "$private_diagnostic"
    timeout 5 adb -s emulator-5554 get-state > "$private_diagnostic/adb-state.txt" 2>/dev/null || true
    timeout 5 adb -s emulator-5554 shell getprop sys.boot_completed > "$private_diagnostic/boot.txt" 2>/dev/null || true
    if timeout 5 adb -s emulator-5554 shell pm path game.kingdomcome.alpha.debug > "$private_diagnostic/app-path.txt" 2>/dev/null; then touch "$private_diagnostic/app-path.complete"; fi
    if timeout 5 adb -s emulator-5554 shell pm path game.kingdomcome.alpha.debug.test > "$private_diagnostic/test-path.txt" 2>/dev/null; then touch "$private_diagnostic/test-path.complete"; fi
    if timeout 5 adb -s emulator-5554 shell pm list instrumentation > "$private_diagnostic/instrumentation.txt" 2>/dev/null; then touch "$private_diagnostic/instrumentation.complete"; fi
    if timeout 10 adb -s emulator-5554 logcat -d -t 500 -s PackageManager PackageInstaller PackageInstallerSession installd dex2oat > "$private_diagnostic/package-log.txt" 2>/dev/null; then touch "$private_diagnostic/package-log.complete"; fi
    remote_test_path=$(sed -n 's/^package://p' "$private_diagnostic/test-path.txt" | tr -d '\r')
    if [[ "$remote_test_path" =~ ^/data/app/[A-Za-z0-9/_.=+~-]+/base\.apk$ && "$remote_test_path" != *..* ]]; then
      if timeout 10 adb -s emulator-5554 pull "$remote_test_path" "$private_diagnostic/installed-test.apk" > /dev/null 2>&1; then
        if cmp -s "$private_diagnostic/installed-test.apk" emulator-input/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk; then
          printf '%s\n' MATCH > "$private_diagnostic/apk-match.txt"
        fi
      fi
    fi
    # Private raw diagnostics never become artifacts or public log output.
    python3 android/scripts/emulator-diagnostic.py "$stage" "$original_status" "$private_diagnostic" | tee -a android-webview-result.txt
  fi
  timeout 15 adb -s emulator-5554 emu kill >/dev/null 2>&1 || true
  kill "$emulator_pid" >/dev/null 2>&1 || true
  exit "$original_status"
}
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
stage=FONT_SCALE
printf '%s\n' 'ANDROID_EMULATOR_STAGE: FONT_SCALE'
timeout 20 adb -s emulator-5554 shell settings put system font_scale 1.3
stage=INSTALL_APP
printf '%s\n' 'ANDROID_EMULATOR_STAGE: INSTALL_APP'
timeout 90 adb -s emulator-5554 install --no-streaming emulator-input/app/build/outputs/apk/debug/app-debug.apk
stage=INSTALL_TEST
printf '%s\n' 'ANDROID_EMULATOR_STAGE: INSTALL_TEST'
timeout 90 adb -s emulator-5554 install --no-streaming -t emulator-input/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
stage=INSTRUMENT
printf '%s\n' 'ANDROID_EMULATOR_STAGE: INSTRUMENT'
timeout 120 adb -s emulator-5554 shell am instrument -w game.kingdomcome.alpha.debug.test/game.kingdomcome.alpha.ShellInstrumentation > android-webview-result.txt
cat android-webview-result.txt
grep -q 'ANDROID_WEBVIEW: PASS' android-webview-result.txt
! grep -q 'ANDROID_WEBVIEW: FAIL' android-webview-result.txt
