---
name: roadmap
description: Use this skill when the user asks for the roadmap, the board, an overview of epics or the backlog, what to work on next, or a status check — typically at the start of a session. Reads epics/*.md and git state, prints a compact bucketed table sized for a small mobile screen, one suggested next action, and operational drift findings only if any exist. The roadmap is a generated view — never written to a file, never committed, so it cannot drift. Do not use to change any epic (that is the owning lifecycle skill).
---

# Roadmap

## Input

$ARGUMENTS

None required. Optional: a bucket name to filter, or `all` to include Done and Superseded
(excluded by default).

## Buckets

Derived from each epic's Status line and checklist — read the files, never the conversation:

| Bucket | Derivation |
|---|---|
| Backlog | `draft`, checklist (§4) empty — a routed stub |
| Draft | `draft`, checklist has items |
| Review | `review` — waiting for `epic-review` |
| Blocked | `blocked` — failed review |
| Approved | `active`, no `[x]` and no `epic/<NNN>-*` branch |
| WIP | `active`, at least one `[x]` or an existing epic branch |
| Done | `closed` — hidden unless `all` |
| Superseded | `superseded by …` — hidden unless `all` |

An unparseable Status line is its own row (`??`) at the top — a finding, not a guess.

## Gathering

```bash
grep -H "^\*\*Status:\*\*" epics/*.md
grep -c "^- \[x\]" <epic>          # ticked
grep -c "^- \[.\]" <epic>          # total items
git branch --list "epic/<NNN>-*"   # started?
<this-skill-dir>/../branch-lifecycle/gate.sh audit   # drift, reused — do not reimplement
```

## Output

Three parts, in order. **Omit any part with nothing in it.** If all three are empty:
`Roadmap: no epics, nothing needs attention.` — one line, done.

**1. The board.** One markdown table, mobile-narrow — three columns, titles truncated at
~30 chars, bucket order as above, oldest first within a bucket:

```md
| Epic | Bucket | Items |
|---|---|---|
| 017 auth-flow | WIP | 3/7 |
| 019 export | Approved | 0/5 |
| 020 onboarding | Review | — |
| 014 search | Blocked | — |
| 022 offline | Backlog | — |
```

**2. Start here.** Exactly one line, the highest of these that applies:

1. Blocked epic exists → `Start: EPIC-<n> is blocked — epic-unblock has proposals.`
2. Review epic exists → `Start: EPIC-<n> awaits review — run epic-review.`
3. WIP epic exists → `Start: EPIC-<n>, item <first unticked>.`
4. Approved epic exists → `Start: EPIC-<n>, item 1.`
5. Only Draft/Backlog → `Start: finish drafting EPIC-<n>.`

One suggestion, not a list. The user decides; this is a default, not an order.

**3. Needs attention** — only if findings exist. Sources, all mechanical:

- `gate.sh audit` DELETE/REPORT lines (merged-but-undeleted branches, stale work branches).
- A `closed` epic with unchecked, unstruck items.
- A `??` Status row from part 1.

One line per finding, no elaboration. **If there are no findings, print nothing for this
part — not "all clear", nothing.** The roadmap must never invent chores; part 2 already says
what to do next, and silence here means clean.
