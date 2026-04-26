# Android Setup Checklist

## Code prep (done — no Android SDK needed)

- [x] `src-tauri/src/widget_sync.rs` — Rust sync command written and registered
- [x] `src/lib/widgetSync.ts` — TypeScript helper written (no-op on desktop)
- [x] `android-widget/kotlin/` — All Kotlin widget files staged
- [x] `android-widget/res/` — All layout/xml/drawable resources staged
- [x] `android-widget/AndroidManifest_additions.xml` — Manifest additions staged
- [x] `src-tauri/src/lib.rs` — App entry point refactored; desktop-only code gated behind `#[cfg(desktop)]`; mobile entry point wired with `#[cfg_attr(mobile, tauri::mobile_entry_point)]`
- [x] `src-tauri/Cargo.toml` — Desktop-only crates moved to `[target.'cfg(not(...))'.dependencies]`

## Your machine setup (you need to do these)

- [x] Install **JDK 17** (e.g. via [Adoptium](https://adoptium.net/)) and set `JAVA_HOME`
- [x] Install **Android Studio** — includes the SDK Manager and AVD Manager
- [x] In Android Studio → SDK Manager → SDK Platforms: install **Android 14 (API 34)**
- [x] In Android Studio → SDK Manager → SDK Tools: install **NDK (Side by side)** and **Android SDK Command-line Tools**
- [x] Set environment variables:
  ```
  ANDROID_HOME = %LOCALAPPDATA%\Android\Sdk
  NDK_HOME     = %LOCALAPPDATA%\Android\Sdk\ndk\<version>
  ```
  Add `%ANDROID_HOME%\platform-tools` to `PATH`
- [x] Install Rust Android targets:
  ```bash
  rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android i686-linux-android
  ```

## Android project generation (you need to do these)

- [x] From the Jot repo root, run:
  ```bash
  npx tauri android init
  ```
- [x] Copy staged files to their final destinations (see the table in README.md)
- [x] Merge `AndroidManifest_additions.xml` into the generated `AndroidManifest.xml`
- [x] Add the two string resources to `res/values/strings.xml`

## First build and run

- [ ] Connect an Android device (USB debugging on) or start an emulator (API 34)
- [ ] Run:
  ```bash
  npx tauri android dev
  ```
- [ ] Verify the app installs and launches
- [ ] Long-press home screen → Widgets → find "Jot Pulse" and "Quick Capture"
- [ ] Add a widget and confirm it shows today's tasks

## Wire syncWidgets into the frontend

- [x] `syncWidgets()` called at the end of `loadData()` in Dashboard — fires after every task mutation and on realtime updates
