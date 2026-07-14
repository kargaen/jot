---
name: branch-lifecycle
description: Use this skill when a branch is about to be created, merged, promoted, or deleted — including when the user says "start the epic", "push to dev", "cut an rc", "ship it", "merge to master", or asks what branches are safe to delete. Also use when work begins on an epic or a triaged direct slice, since that is when the branch is created. Binds branch existence to epic state so a branch whose epic is closed is provably garbage, and gates each promotion on a mechanical condition rather than on the work feeling done. Reads branch names from ARCHITECTURE.md; do not hardcode them.
---

# Branch Lifecycle

A branch is not a place to work. It is the open state of one epic or one slice.

## Input

$ARGUMENTS

**Required:** the operation, and the epic or slice it belongs to.
**If missing:** ask which epic. Do not create a branch for work that has not been triaged.

**Waivable by explicit instruction:** the deletion prompt — the user may keep a branch.
**Not waivable:**
- No branch is created without an epic id or a triage verdict.
- No promotion happens on a subjective judgement. Every gate below is a command that exits 0.

## Branch model

`ARCHITECTURE.md` declares this project's branch names, which branch triggers a release
candidate, and which is the release branch. Read them. Do not assume `main`, `dev`, or
`master`.

`gate.sh` reads the same names from git config, set once per repository:

```bash
git config branch.integration <name>   # the branch whose push cuts a release candidate
git config branch.release     <name>   # the branch that holds candidate-passed code
git config gate.testcmd       "<cmd>"  # required — the gate refuses if unset
```

If they are unset the gate refuses with exit 2. It never guesses.

The rules below are about *roles*, not names:

| Role | Holds | Created from | Deleted when |
|---|---|---|---|
| **work** | one epic, or one triaged slice | integration | it merges to integration |
| **integration** | everything awaiting a release candidate | release | never |
| **release** | what has passed a release candidate | — | never |

## Naming binds the branch to its reason

```
epic/014-per-parameter-caching     # from EPIC-014
fix/<slug>                         # from a change-triage direct-slice verdict
```

A branch whose name carries no epic id and no triage slug has no reason to exist. That is the
whole stale-branch defence: staleness becomes checkable instead of remembered.

A direct slice may commit straight to integration if it touches one file and its test passes.
Otherwise it gets a `fix/` branch under the same rules.

## Gate 1 — work → integration

This push cuts a release candidate. It is the first point at which the code can reach a build
the user cannot inspect by hand, so the gate is the test suite and nothing else.

Do not promote on "the feature feels complete". Check:

```bash
<this-skill-dir>/gate.sh work-to-integration <epic-id>
```

Which verifies, and refuses on any failure:

1. Every checklist item in the epic is `[x]`.
2. The full test suite passes on the work branch.
3. `epic-closeout` has run — the epic's Status is `closed`. A predicted "no impact" does not
   substitute: closeout owns the predicted-vs-actual reconciliation and the Status flip, and
   it runs for no-impact epics too.
4. The work branch is rebased on, or merged with, current integration.
5. The diff touches no file outside what the epic's checklist named.

Check 5 catches the thing tests cannot: a slice that quietly grew.

**Then merge, then delete the work branch immediately.** Not later. The merge is the moment
the branch stopped meaning anything, and a branch kept "just in case" is the stale branch.

The merge commit is the undo. If the release candidate fails, revert it — do not go looking
for the branch.

## Gate 2 — integration → release

```bash
<this-skill-dir>/gate.sh integration-to-release <rc-tag>
```

1. A release candidate was built from this exact integration commit.
2. The user has confirmed the candidate, interactively, at the terminal. **This is the only
   human gate in the system.** The script prompts on `/dev/tty`; a non-interactive caller
   cannot pass it, and an agent never asserts it.
3. No commit has landed on integration since the candidate was built. If one has, the tested
   artifact is not the one being promoted — cut a new candidate.

Check 3 is the one that bites a solo developer, because merging one more small fix while
waiting for the build feels free.

## Stale branches

```bash
<this-skill-dir>/gate.sh audit
```

Reports, without deleting:

- Merged into integration and still present → **delete**.
- Names an epic whose status is `closed` → **delete**.
- Names an epic that does not exist → **ask.** Either the epic was renamed or the branch is
  an agent's abandoned scratch work.
- No epic id and no triage slug → **ask.** It should never have been created.
- Unmerged, older than the integration branch's last release → report. Deciding is the user's.

Never delete an unmerged branch without asking. Everything else in this list is safe.

## When the release candidate fails

The work branch is already gone. That is correct.

1. Revert the merge on integration. The RC that failed is now not the head.
2. Triage the failure. It is a bug against a described behaviour → `change-triage`.
3. It gets a new `fix/` branch, or a new epic if the failure revealed a missing contract.

Do not resurrect the branch. Its epic is closed; re-opening it makes the closeout a lie.

## Do not

- Do not create a branch to "explore". Exploration is read-only.
- Do not leave a branch alive because the next epic might touch the same files.
- Do not merge integration into a work branch to "keep it fresh" more than once. Twice means
  the work branch has outlived its epic.
- Do not push to the release branch directly. Ever.
