# Release Flow

`package.json` is the source of truth for the app version.

To prepare a new version locally:

```sh
npm run version:sync -- 0.9.0
git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml docs/index.html
git commit -m "Release v0.9.0"
git push origin master
```

On push to `master`, GitHub Actions will:

- verify all version-bearing files match
- build the frontend
- create a GitHub Release if `v<package.json version>` does not already exist
- build and upload the Windows installer and updater artifacts
- deploy `docs/` to GitHub Pages with the synced version

You can also run the workflow manually from GitHub Actions and provide a version. That builds with the provided version without requiring a local commit first.
