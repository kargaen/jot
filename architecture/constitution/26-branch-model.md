# 26. Branch Model

Verified against `RELEASE.md`.

| Branch | Role | What a push does |
|---|---|---|
| `master` | Release | Full production release (version-gated — see below) |
| `dev` | Integration | Builds and publishes a Release Candidate prerelease |
| `feature/*` | Work | No release. Branches off `dev`, PRs back into `dev`, deleted on merge |

- **`git config branch.integration`** is `dev`; **`git config branch.release`** is `master`.
- A push to `dev` always cuts an RC — published on the single reusable `rc` tag (deleted and
  recreated per run), no manual version bump required.
- A push to `master` only cuts a full release when the version has been bumped (`npm run
  version:sync -- X.Y.Z`) and the corresponding `v<version>` tag does not already exist; if the
  tag exists, the release is skipped rather than re-cut.
- The only human gate in the system is confirming a Release Candidate is good before promoting
  `dev` into `master`.
- A work branch is named for its purpose (`feature/*` for feature work); it does not release on
  its own and is deleted once merged into `dev`.
