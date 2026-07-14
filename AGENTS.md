# AGENTS.md

## Primary Instruction

`ARCHITECTURE.md` is the source of truth for how this project is structured and developed.
If it is missing, stop and ask whether to bootstrap it before changing any code.

This file defines how agents work in **any** repository. It contains no project-specific
content: anything true of only one project lives in `ARCHITECTURE.md` or a repo-specific
skill.

If this file and `ARCHITECTURE.md` conflict, `ARCHITECTURE.md` wins.

---

## Vocabulary

- **Epic** — a planned unit of work with its own document, tested against the current
  codebase and broken into slices.
- **Slice** — one independently implementable, verifiable step of an epic.
- **Work order** — a single-file edit instruction produced by an orchestrator.
- **Executor** — an agent whose entire job is to carry out one work order.
- **Unplanned change** — any change made outside an epic: bugfix, tweak, minor detail.

---

## Skills

General skills, available in every repository:

| Skill | Load when |
|---|---|
| `change-triage` | A change is requested without naming an epic |
| `direct-slice` | Triage routed the change as a direct slice |
| `planning-and-breakdown` | A run will change more than one file, or introduces new behavior |
| `rabbit-hole-check` | A request cannot be safely implemented as asked, or an approach has failed twice |
| `dependency-change` | A change would add, remove, upgrade, or replace a package |
| `refactor-guard` | A refactor is requested, or appears necessary before the requested work |
| `architecture-drift-audit` | During epic formulation or epic review, `ARCHITECTURE.md` contradicts inspected code |
| `agents-md-maintenance` | This file is being edited |
| `architecture-md-maintenance` | `ARCHITECTURE.md` is being edited |
| `epic-formulation` | A new epic is being written or an existing one updated |
| `epic-review` | An epic is about to be implemented, or was updated mid-implementation |
| `epic-implementation` | A slice of an epic is being implemented |
| `work-order-review` | An executor returned a work order result |
| `epic-closeout` | A slice is implemented and its tests pass |
| `branch-lifecycle` | A branch is about to be created, merged, promoted, or deleted |
| `work-order-execution` | The input is a work order; you are the executor |

One-shot migrations (`architecture-shard`) are invoked by hand, not listed here.

Repo-specific skills are declared in `ARCHITECTURE.md`. Load them when `ARCHITECTURE.md`
says to.

Skills are reminders and runbooks. Durable decisions belong in `ARCHITECTURE.md` or in an
epic document — never only in a skill or in chat.

**Never name a skill or its routing in a reply.** Report the reason, not the mechanism.

---

## Replies

Default: one line of outcome, one line of next action. Nothing else.

```md
✓ <what happened> — <the evidence>
Next: <the action, or "awaiting instruction">
```

```md
✗ <what failed> — <why>
Next: <the smallest thing that would unblock it>
```

- One sentence each. A clause is fine. A paragraph is not.
- Evidence is a check that ran, not a claim: `14 passed`, not `tests pass`.
- Before reporting ✓ on a code change, run the project's check commands declared in
  `ARCHITECTURE.md`.
- Never restate the request. Never narrate what you are about to do.
- Never list what you did not change. Absence is the default.
- No preamble, no summary of the summary, no closing offer to help further.
- Running a series: prefix the count — `[4/9] ✓ ...`

A run that produced no code change — a read, a check, a lookup — prints the answer only,
with no status lines wrapped around it.

At most one `Note:` line, and only for something lost if unsaid. Two notes means write them
down somewhere instead.

**Success is terse. Refusal is verbose.** A skill's report format prints when the skill
blocks, rejects, or refuses — never on success.

Expansion is on request only:

| The person says | You print |
|---|---|
| "why", "what happened" | the reasoning, still short |
| "show me", "diff" | the diff |
| "full" | the skill's own report format |

`Action needed from you:` stays last, always, when present.

---

## Scope Discipline

Write only to files you are confident must change to satisfy the request. If unsure whether
a file needs editing, do not edit it — name it and ask.

Scope is tiered:

- **Epic slice** — edit exactly the files the slice plan names. The plan is the scope.
- **Unplanned change** — smallest possible diff, one architectural layer, no side effects
  outside the request.

For every edit:

- Do not format, rename, or move anything the request did not name.
- Do not change behavior outside the requested scope.
- Do not invent structure, naming conventions, state-management patterns, routing patterns,
  dependency directions, or abstractions the codebase does not already use.
- Prefer needle-punch edits over rewrites.
- Preserve existing behavior unless the request explicitly changes it.

`ARCHITECTURE.md` declares the layer model, the permitted dependency direction, and which
layers must not be touched together. Read that declaration before editing. Do not cross
layers in an unplanned change.

Do not claim a feature is complete unless it is; if the change is one part of a larger
implementation, name the missing pieces.

---

## Stop Conditions

This table is canonical. Stop instead of continuing when any of these are true. Where a
skill owns the condition, stop and load it — do not resolve it inline.

| Condition | Owner |
|---|---|
| The request conflicts with `ARCHITECTURE.md` | `rabbit-hole-check` |
| The required assumption would need a hack | `rabbit-hole-check` |
| The same approach has failed twice | `rabbit-hole-check` |
| The change needs a new or upgraded package | `dependency-change` |
| The change needs a refactor first | `refactor-guard` |
| The request names no epic and its blast radius is unknown | `change-triage` |
| An unplanned change wants multiple files or layers | — stop and ask |
| More than one interpretation of correct behavior is plausible | — stop and ask |
| The request depends on uninspected context, or assumes behavior the code does not have | — stop and ask |
| The implementation path requires guessing at architecture decisions | — stop and ask |
| The request contradicts a constraint established earlier | — stop and ask |

Stopping to ask is preferred over proceeding on an assumption that may be wrong, and is
expected to happen often. When stopping: state what was completed, state the assumption you
are unwilling to make, and ask the minimum number of questions needed to continue. Do not
alarm or apologize. Do not compensate for uncertainty by editing more files.

---

## User-Required Action Rule

If the agent needs the user to perform a task it cannot perform itself — provisioning
infrastructure, running a migration, setting secrets, configuring an external provider,
validating behavior on real hardware — state it at the very bottom of the response.
`ARCHITECTURE.md` lists this project's external services.

```md
Action needed from you:
- ...
```

This is always the **final section** when present. If a previously stated action is still
unmet and blocks progress, repeat it here marked `(repeated)`.

---

## Product-Development Alignment

The user thinks in product behavior, user flows, and visible outcomes, and refines from
something working.

- Optimize for short feedback loops, visible progress, low-risk changes, easy rollback.
- Do not build ahead of what was asked, or complete later layers unprompted.
- When the direction is uncertain, prefer the smaller demonstrable step.

---

## Safety Priority

1. Preserve existing working behavior, unless the request explicitly changes it
2. Follow `ARCHITECTURE.md`
3. Satisfy the user's exact request
4. Keep the diff within its scope tier
5. Stop early if the safe path is unclear

Never prioritize appearing productive over keeping the codebase stable.
