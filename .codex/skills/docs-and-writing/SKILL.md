---
name: docs-and-writing
description: Load BEFORE writing or updating ANY Jot doc, prose, or convention record. Triggers on "where do I document this convention", "update ARCHITECTURE.md", "should this go in a README", "which doc owns this", "house style / response shape", "commit message format", "PR body", writing a migration header comment, "I added a reusable primitive/token — where does it get recorded", "keep docs in sync with code / SSOT", "is this copied truth". Read it before you open the doc file, even for a one-line edit.
---

# Docs & Writing — maintaining Jot's documentation of record

You are editing the docs a retiring principal engineer leaves behind. The docs are load-bearing: agents and juniors act on them. A wrong runbook is worse than none. Your job is to keep each doc pointing at the truth without duplicating it, and to record conventions in the one place that owns them.

This skill governs **where** truth lives and **how** to write it. It does not re-decide whether a change is allowed — that is `change-control`'s job — nor how the architecture is shaped — that is the architecture contract's job. Cross-reference those; do not restate them.

Before any doc edit, ask three questions in order:
1. **Which doc owns this truth?** (Doc Map below — do not scatter the same fact across docs.)
2. **Am I about to copy truth that another file owns?** (SSOT-by-reference — point, never paste.)
3. **Is this conventional (meant to be followed again)?** (If yes, it must land under ARCHITECTURE.md → Key Conventions.)

---

## 1. The Doc Map — which doc owns which truth

Every fact has exactly one home. Read the owner before editing; write the fact only there and reference it from elsewhere.

| Doc | Owns | Notes |
|---|---|---|
| `CLAUDE.md` | The agent workflow/discipline contract: one-file/one-layer, minimal diffs, rabbit-hole rules, stop conditions, assumption policy, response shape. | NON-NEGOTIABLE. If your request conflicts with it, stop and explain — do not edit around it. |
| `ARCHITECTURE.md` | App structure **and Key Conventions** (naming, data-flow direction, styling/design system, routing, Conduit/jotExport, mobile resolution, commenting practice). | **The "Full Tree" ASCII diagram is stale/aspirational** — it shows folders that do not exist (`store/` slices, TanStack Router, `shared/`, `Button/Button.tsx` dirs). The **Key Conventions section is the live, authoritative part.** When they disagree, code + Key Conventions win. Do not "fix" the tree by inventing structure. |
| `RELEASE.md` | Release flow: branch model (`master`/`dev`/`feature/*`), RC pipeline, Android signing/keystore, version SSOT. | `package.json` is the version source of truth. |
| `REFACTOR_SUMMARY.md` | The **live, incomplete** MVC refactor checklist. Many boxes are still `[ ]`. | This file declares itself the single source of truth for refactor scope/progress. Update it at the end of every refactor iteration — check the boxes you completed. |
| `ROADMAP.md` | Product direction / what's next. | Not an implementation record. |
| `README.md` (root) | Product mission/philosophy (North Star, calm, single-language NLP). | Not an engineering runbook. |
| `src/**/README.md` | Local layer/folder notes only — what belongs in this directory and how it composes. | Keep these short and local. A cross-layer or reusable rule does NOT belong here — it belongs in ARCHITECTURE.md Key Conventions. |

### "I changed X → update doc Y"

| You changed / added… | Update… |
|---|---|
| A new reusable UI primitive or design token | `ARCHITECTURE.md` → Key Conventions (Styling & design system), referencing the file/`global.css` by path — see §3 |
| A new naming, file-layout, or dependency-direction rule | `ARCHITECTURE.md` → Key Conventions |
| A new cross-layer contract, shared helper, or "do it this way" pattern | `ARCHITECTURE.md` → Key Conventions |
| A new tool/workflow others should use (e.g. a harness) | `ARCHITECTURE.md` → Key Conventions |
| What lives in one folder / how a local file composes | that folder's `src/**/README.md` |
| Release, signing, branch, or version mechanics | `RELEASE.md` |
| Completed a refactor step / boundary cleanup | check the box in `REFACTOR_SUMMARY.md` |
| Product intent / feature direction | `ROADMAP.md` (or root `README.md` for mission) |
| A one-off, local, non-repeatable change | **no doc** — a code comment (why, not what) if anything |

---

## 2. SSOT-by-reference — point, never paste

This is the rule the codebase works hardest to enforce. From CLAUDE.md:

> **Reference the source; never copy it (SSOT).** Documentation must point to the file that owns the truth, not duplicate its contents. Reference the stylesheet, component, schema, or helper **by path** and describe how to use it, so the doc cannot drift from the code. Do not paste token values, color hex, component prop lists, or code snippets that then need maintaining in two places. If you find copied truth in any doc, replace it with a reference.

Concretely:
- **Never** paste token hex/rgba values — point to `src/styles/global.css` and name the token.
- **Never** paste a component's prop list — say "each component's own file is the source of truth for its props" and name the path (this is exactly how ARCHITECTURE.md's Styling section already does it).
- **Never** paste a schema, migration SQL, or function signature into prose — reference the file by path.
- If you find copied truth already in a doc (a hex value, a prop table, a duplicated code block), **replace it with a reference** as part of your edit — that is not scope creep, it is the rule.

This skill obeys its own rule: it names doc owners and paths, it does not reproduce their contents. Read the owner file for specifics.

---

## 3. Documenting New Conventions

From CLAUDE.md — when a change establishes something **conventional** (meant to be followed again), record it under **Key Conventions** in `ARCHITECTURE.md` as part of the same work. "A convention that lives only in code (or only in a chat) gets reinvented."

**MUST be recorded** (these are explicitly conventional):
- A new reusable UI primitive/component intended for reuse (e.g. a shared `Button`).
- A new design token (color, radius, spacing, shadow) or a change to the token set.
- A new naming pattern, file-layout rule, or dependency-direction rule.
- A new cross-layer contract, shared helper, or "do it this way" pattern.
- A new tool or workflow others should use (e.g. the visual harness).

**MUST NOT be recorded:** one-off, local, non-repeatable changes. They do not belong in ARCHITECTURE.md.

Record it **by reference** (§2): name the new primitive/token/tool and its path, describe how to use it and when — do not paste its internals. The Styling & design system and Data-export sections in ARCHITECTURE.md are the model to imitate.

---

## 4. House style

### Response shape (from CLAUDE.md "Communication Style")

When reporting work, use this shape and **omit empty sections**:

```
Changed:
- ...
Not changed:
- ...
Checks:
- ...
Findings for later:
- ...
Side note:
- ...
Test suggestion:
- What to test / Benefit / Current gap
Next safest step:
- ...
Action needed from you:
- ...
```

`Action needed from you`, when present, is always the **final** section. Be concise; do not over-explain architecture unless asked.

### View Cleanliness (from CLAUDE.md)

Never write developer notes, TODOs, placeholder labels, or status prose as **rendered UI text**. Any text inside a view is product text the user sees. Commentary about a view change goes in a code comment, never on screen. This rule has no exceptions.

### Commenting practice (from ARCHITECTURE.md → Commenting Practice)

Comment **why, not what**: architectural intent, invariants, non-obvious constraints, cross-layer/cross-domain decisions, why an approach was chosen. Do not narrate obvious code line-by-line. Prefer a few high-value comments over pervasive low-signal ones; if a function needs many comments, prefer clearer names/smaller units first.

---

## 5. Commit / PR conventions

Verify current practice before writing: `git log --oneline -20`.

Observed and expected pattern:
- **Imperative subject line**, concise, describing effect — e.g. `Embed project on fetched tasks so name is never null`, `Fix task-title tap not opening editor on device`.
- Issue-numbered fixes use `Fix #N: ...` / `Fix <subject>` style; docs commits prefix `Docs: ...`; phased refactor work prefixes `Phase N: ...`.
- **Body explains *why*** (the failure or constraint), not a diff restatement — mirrors the "why not what" comment rule.
- Every commit ends with the trailer block (per CLAUDE.md's git rules):

```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_<id>
```

- PR bodies end with the generated-with footer per CLAUDE.md.
- Only commit/push when the user asks; if on the default branch, branch first (see `change-control` for the landing contract).

### Template — a Key Conventions entry (by reference)

```md
### <Convention name>

<One or two sentences: what the rule is and when it applies.> The source of
truth is `<path/to/file>` — <how to use it / what it owns>. <Do-this / not-that
in one line.> (See `<file>` for the current <tokens/props/schema>.)
```

### Template — a `src/**/README.md` update

```md
# <Folder purpose, one line>

What belongs here:
- <local rule / what composes here>

Do not put here:
- <cross-layer or reusable rule> → belongs in ARCHITECTURE.md Key Conventions.
```

### Template — a migration header comment

Migrations are append-only and idempotent (see `change-control`). Lead every migration file with a `why` header and cross-reference related migrations by filename:

```sql
-- <What this migration does and WHY it exists (the failure/constraint it fixes)>.
-- <Any invariant, e.g. only the sha-256 hash is ever stored.>
-- <Cross-reference: see <YYYYMMDDHHMMSS_related_migration.sql> for <reason>.>
```

The real `api_tokens` and `perf_rls_initplan` migrations are good models — read them for the tone.

---

## Cross-references (do not duplicate)

- **`change-control`** — whether a change is allowed, one-file/one-layer classification, migration/RLS/version gating, how to land a change. Load it before editing code; this skill only covers the prose/doc side.
- **The architecture contract** (Key Conventions in `ARCHITECTURE.md`, and any `architecture-contract` skill if present) — the actual structural rules. This skill tells you *where to write a convention down*, not *what the convention should be*.

## When NOT to use this skill

- You are writing product/runtime code, not docs — use the relevant layer's rules and `change-control`.
- You are deciding whether a change is safe/allowed — that is `change-control`.
- The text you're writing is rendered UI copy — that is product text under the view rules, not documentation.
- A one-off local change with no reusable convention — a `why` code comment suffices; touch no doc.

## Provenance and maintenance

- Authored 2026-07-04 against the repo state of that date. Doc owners, the stale-tree warning, the response shape, and the commit trailer were verified by direct Read/Grep/`git log`.
- Re-verify before trusting: `ls src/**/README.md` (per-folder notes still exist / new ones added), `git log --oneline -20` (commit/PR conventions still hold), and skim `ARCHITECTURE.md` Key Conventions + `CLAUDE.md` "Documenting New Conventions" / "Communication Style" for wording drift.
- If ARCHITECTURE.md's Full Tree ever gets reconciled with reality, delete the stale-tree warning in §1.
