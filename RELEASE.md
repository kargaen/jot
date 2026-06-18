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

Every push to `dev` automatically builds and publishes a pre-release tagged `vX.Y.Z-rc.N`.

The RC number auto-increments from the highest existing `vX.Y.Z-rc.*` tag for the current base version in `package.json`. No manual version bump is needed for RC builds.

RC releases are marked as **pre-release** on GitHub and are not served as the latest stable version.

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
