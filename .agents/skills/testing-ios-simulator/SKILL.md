---
name: testing-ios-simulator
description: "Checks the installed KS Home Screen web app in the Xcode iOS Simulator on the owner's MacBook runner, with before/after screenshots per iPhone. Use only when asked for an iOS Simulator check, such as status bar, safe area, icon, or Add to Home Screen behavior."
---

# Testing in the iOS Simulator

Runs on the Amp runner `oleksandrs-macbook-air-amp-app`, in a new worktree of `/Users/build/code/billiards/ks`. Everything happens in a thread on that runner; an orb has no Simulator.

## Environment

- Xcode 27.2 is installed at `/Applications/Xcode.app`, and `xcode-select` points to it. If `xcode-select -p` shows Command Line Tools, prefix commands with `export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` and tell the owner. Never run `sudo`.
- The runtime is iOS 27.2 (24B8117); list runtimes with `xcrun simctl runtime list`. Ask the owner before downloading another runtime, because each one is several GB.
- Reuse the simulators `KS iPhone 13`, `KS iPhone 16` and `KS iPhone 17 Pro Max` (`xcrun simctl list devices available`). Create a missing one with `xcrun simctl create "KS iPhone 16" com.apple.CoreSimulator.SimDeviceType.iPhone-16 com.apple.CoreSimulator.SimRuntime.iOS-27-2`.
- Xcode 27 has no Simulator.app. Device Hub replaces it, and it has no accessibility tree. Run simulators headless with `simctl` and drive them with XCUITest, as described below. Don't use `open -a Simulator`, System Events or `screencapture`.

## Workflow

1. **Set up the worktree.** Run `bun install`, then `bun run --cwd packages/application db:migrate:local`. A new worktree has no local D1 tables, and starting a match then fails with `no such table`. Start `bun run dev`, which serves on strict port 7529. The Simulator reaches it at `http://localhost:7529`.
2. **Boot every device up front, in parallel.** Run `xcrun simctl boot <udid>`, then `xcrun simctl bootstatus <udid> -b`. Booting takes about 45 s per device.
3. **Make captures comparable.** Run `xcrun simctl status_bar <udid> override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3`, then `xcrun simctl ui <udid> appearance dark` (or `light`).
4. **Seed state over HTTP, never through the Simulator UI.** The owner's rule: the Simulator only opens pages. For a Strila match:

   ```sh
   curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" -X POST \
     -H "Origin: http://localhost:7529" \
     --data-urlencode seatAName=Олег --data-urlencode seatBName=Іван \
     -d matchTargetFrames=3 -d targetA=9 -d targetB=9 -d firstBreakerSeat=A \
     "http://localhost:7529/sparring/setup/strila-v2/"
   ```

   A `302` redirects to the Match URL.
5. **Install the web app once per device.** Run `xcrun simctl openurl <udid> http://localhost:7529/sparring/`. In Safari, tap Page Menu (`MoreMenuButton`), then `ShareButton`, View More and Add to Home Screen. Check that the "Open as Web App" switch is on, then tap `AddToHomeScreenAddButton`. Launch the app from its SpringBoard icon; it runs as `com.apple.webapp`.
6. **Navigate inside the installed app,** for example Меню → Зараз грають → the match card. Tap elements by label; use coordinates only as a last resort.
7. **Compare before and after by switching only the server code.** Keep one icon per device and reopen the page. Delete and re-add the icon only when the manifest, the icons or install-time behavior changed: iOS saves the icon, the label and some status bar behavior when the icon is added. To delete, long-press the icon → Delete Bookmark → Delete, then count the icons by label.
8. **Capture.** Run `xcrun simctl io <udid> screenshot <device>-ios<version>-<build>-<page>-<before|after>.png`. Wait for a stable element first, and inspect every capture before reporting it.
9. **Clean up.** Restore any reverted code, stop the dev server, run `xcrun simctl shutdown all`, and report the worktree state.

## XCUITest driver

XCUITest can drive Safari (`com.apple.mobilesafari`), SpringBoard (`com.apple.springboard`) and the web app (`com.apple.webapp`) through `XCUIApplication(bundleIdentifier:)`, and needs no macOS Accessibility permission. A reusable kit is tracked in BIL-189. Until it exists, build a minimal one under `.amp/in/uia`:

- **Project:** a UIKit host app plus a UI-testing bundle, with ad-hoc signing (`CODE_SIGN_IDENTITY = "-"`) and deployment target 27.0.
- **Test:** one test that reads a line-based step script.
  - Commands: `app`, `tap <label>`, `press <label>`, `tapxy`, `type`, `home`, `dump`, `exists`, `sleep`, `reveal`.
  - `dump` writes the element tree, which is the fastest way to find identifiers.
- **Build once:** `xcodebuild build-for-testing -project KSUIA.xcodeproj -scheme UITests -destination id=<udid> -derivedDataPath dd`.
- **Run each script:** `TEST_RUNNER_KS_SCRIPT=<abs path> TEST_RUNNER_KS_OUT=<dir> xcodebuild test-without-building … -destination id=<udid>`. The `TEST_RUNNER_` prefix is what passes environment variables into the test.

Xcode 27's agent tools (`xcrun mcpbridge`) can also tap and take screenshots, but they are built for the agent's own Xcode app and haven't been tried on Safari or SpringBoard here.

## Pitfalls

| Symptom | Fix |
| --- | --- |
| `unable to find utility "simctl"` | Set `DEVELOPER_DIR` (see Environment). |
| Typing in the Setup form stalls on keyboard tips, autofill chips or lost focus | Seed over HTTP (step 4). |
| "Щось пішло не так", and the dev log shows `no such table` | Run `db:migrate:local`. |
| An icon is "not hittable" | It's on another Home Screen page. Swipe left first. |
| Duplicate icons after a failed delete | Repeat the delete until one icon is left. |
| Stuck on "Wait for com.apple.webapp to idle" | Live pages keep the app busy. Run `simctl terminate <udid> com.apple.webapp` and relaunch. |
| Old label or icon after a change | iOS saved it at install time. Re-add the icon. |

## Limits

The Simulator matched real iPhones in community measurements of how iOS colors the status bar. Behavior that depends on install date or on the exact blur size still needs a real device. iOS 26 isn't installed.
