# Android Widget — Staging Files

These files are ready to drop in once `tauri android init` generates the Android project.

## Setup steps

```bash
# 1. Install Android SDK + NDK (via Android Studio), set ANDROID_HOME
# 2. From the Jot repo root:
npx tauri android init
```

## Where each file goes after init

| Staging path | Final destination |
|---|---|
| `kotlin/com/jot/app/widget/*.kt` | `src-tauri/gen/android/app/src/main/kotlin/com/jot/app/widget/` |
| `res/layout/*.xml` | `src-tauri/gen/android/app/src/main/res/layout/` |
| `res/xml/*.xml` | `src-tauri/gen/android/app/src/main/res/xml/` |
| `res/drawable/*.xml` | `src-tauri/gen/android/app/src/main/res/drawable/` |
| `AndroidManifest_additions.xml` | Merge contents into `src-tauri/gen/android/app/src/main/AndroidManifest.xml` |

Add the two string resources from the manifest additions file to `res/values/strings.xml`.

## What's already wired (no Android SDK needed)

- `src-tauri/src/widget_sync.rs` — Rust command, compiles on all platforms
- `src/lib/widgetSync.ts` — TypeScript helper, skips silently on desktop
- Both registered in `lib.rs` and `Cargo.toml`

## Calling syncWidgets from the frontend

Call after any task mutation and on app foreground:

```typescript
import { syncWidgets } from "../lib/widgetSync";
// fire-and-forget — never awaited, never blocks UI
syncWidgets();
```

The function checks `platform() === "android"` internally and is a no-op on desktop.
