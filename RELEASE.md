# Release Flow

`package.json` is the source of truth for the app version.

---

## Branch Model

| Branch | Purpose | Release trigger |
|--------|---------|----------------|
| `master` | Production | Full release on push |
| `dev` | Integration | RC prerelease on every push |
| `feature/*` | Feature work | No release — branch off `dev`, PR back into `dev` |

---

## Release Candidates (dev → RC)

Every push to `dev` automatically builds and publishes a pre-release on the single reusable `rc` tag (deleted and recreated per run). No manual version bump is needed for RC builds.

RC releases are marked as **pre-release** on GitHub and are not served as the latest stable version.

---

## Android Signing

Android enforces that an update is signed with the **same key** as the installed app and carries a versionCode ≥ the installed one. No CA-issued certificate is involved — the key is self-signed and just has to stay stable.

- The release keystore lives only in GitHub repo secrets: `ANDROID_KEYSTORE_B64` (base64 of the `.jks`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`. The RC workflow writes it to `src-tauri/gen/android/keystore.jks` + `key.properties` before building; `src-tauri/gen/android/app/build.gradle.kts` signs release builds with it (falls back to the debug key locally when `key.properties` is absent).
- versionCode is set per RC build to `1000002 + run_number` (strictly increasing; base = Tauri's derivation of version 1.0.2).
- **If the keystore secret is ever lost or replaced**, existing installs cannot update — every device must uninstall and reinstall once. Keep the keystore backup safe.
- When `master` starts building Android, it must reuse the same keystore and a versionCode scheme above the RC one.

---

## Production Release (dev → master)

To cut a stable release:

1. Bump the version in all tracked files:

   ```sh
   npm run version:sync -- 1.0.3
   git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml docs/index.html
   git commit -m "Release v1.0.3"
   ```

2. Merge `dev` into `master` (or push the version commit directly to `master`).

3. Push to `master`:

   ```sh
   git push origin master
   ```

On push to `master`, GitHub Actions will:

- verify all version-bearing files match
- build the frontend
- create a GitHub Release tagged `v<version>` (skipped if the tag already exists)
- build and upload the Windows installer and updater artifacts
- deploy `docs/` to GitHub Pages

You can also trigger the production workflow manually from GitHub Actions and supply a version directly — no local commit required.

---

## Manual Dispatch

Both workflows support `workflow_dispatch` with an optional `version` input. This lets you build any version without a local commit first.
