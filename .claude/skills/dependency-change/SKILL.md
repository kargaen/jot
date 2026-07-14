---
name: dependency-change
description: Use this skill when a change would add, remove, upgrade, or replace a package, or when an implementation seems to require a library the project does not already depend on. Produces the justification block — why existing code cannot solve it, what risk it introduces, what smaller no-dependency option exists — and decides the route: in-constraint upgrade as a slice, a contained change as a dependency-change run, or an epic. Links to official installation documentation rather than writing install commands. Do not use for importing modules already present in the manifest.
---

# Dependency Change

A dependency is a permanent decision made during a temporary task.

## Input

$ARGUMENTS

**Required:** the package, and what it is for.
**If missing:** ask. Do not infer the package from an import you were about to write.

**Waivable by explicit instruction:** nothing.
**Not waivable:**
- You do not add the dependency in the same run that proposes it.
- You do not write install commands. Link the official docs.

## First: is it already there?

Read the manifest. Importing a module that is already a declared dependency is not a
dependency change and this skill does not apply.

A transitive dependency is **not** already there. Depending on it declares a contract nobody
agreed to, and it disappears when the direct dependency drops it.

## Justification block

```md
Proposed dependency: <name> <version constraint>
For: <the one thing it does that is needed>

Why existing code cannot solve it:
<the specific gap — not "it would be more work">

Smaller option without the dependency:
<what a from-scratch version costs, in lines and in risk. "None" is an answer, but say it.>

Risk introduced (verify against the package registry — never from memory):
- Maintenance: <last release, maintainer count, or "unknown">
- Surface: <what it pulls in transitively>
- Reversibility: <how hard to remove once code depends on it>

Proposed route:
<slice (in-constraint upgrade) | dependency-change run (contained; closeout amends the
stack table citing this run) | epic (types in public signatures, or layers reshaped)>

Install: <link to official documentation>

Nothing was added. Proceed?
```

## The three questions that decide it

1. **Is the gap real?** "More work" is not a gap. "Correctly implementing this is a research
   project" is.
2. **Is the smaller option actually smaller?** Forty lines you own beats a package you do not,
   until it is four hundred. Estimate honestly.
3. **Can it be removed?** A dependency that touches one module is reversible. One whose types
   appear in your public signatures is permanent.

## Route

This skill decides the route. `change-triage` defers package changes here; do not route back.
Three outcomes:

1. **Upgrade within the existing version constraint** — not a stack change. A slice; no
   document amendment.
2. **Add, remove, or swap, contained to one module** — after the user approves the
   justification block, it lands as a **dependency-change run**. The run is the provenance:
   `epic-closeout` amends the tech stack table citing it, and the Change History row names it.
3. **A dependency whose types enter public signatures, or that reshapes layers or folder
   structure** — an epic. Hand the justification block to `epic-formulation` as the stub.

## Do not

- Do not run the installer to "check whether it works". That mutates the environment before
  the decision is made.
- Do not add a dependency to avoid writing a test double.
- Do not pin by copying a version from a search result. Read the project's own constraint
  policy first.
