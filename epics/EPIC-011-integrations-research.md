# EPIC-011: Integrations research — Outlook & email capture

**Status:** draft
**Created:** 2026-07-12
**Architecture baseline:** 7d0178c

**Source:** migrated from `ROADMAP.md` (deleted by the governance cleanup). Two research
tracks, kept in one epic because both are pre-implementation research with a written finding as
the only deliverable; either track graduates to its own epic if research says "build".

> Outlook integration research. Validate what is realistically possible in Microsoft enterprise
> environments before promising anything.

> Email capture research. Explore mailbox-to-Jot capture with strict scope and fallback parsing
> rules so it does not become an LLM dependency trap.

---

## 1. BDD — User Flows

No user-facing flows — the deliverable is two recorded findings in this document.

### Flow 1: Research produces a decision, not code

```gherkin
Given the two research questions above
When each track's research concludes
Then this epic contains a written finding with a build / don't-build / blocked verdict
And any "build" verdict names the follow-up epic to formulate
```

**Out of scope for this epic:**
- Writing any integration code. Research is read-only.

---

## 2. Function Call Signatures

*(none — research epic)*

---

## 3. TDD — Testing Strategy

Not applicable — no code under test. The acceptance bar is the evidence standard from
`research-methodology`: findings must cite what was actually verified (API docs, tenant
policies, a spike account), not assumptions.

### What is deliberately not tested

Everything — nothing ships from this epic.

---

## 4. Checklist

```md
[ ] 1. Outlook track: record the finding (what Microsoft enterprise environments actually
       permit) — done when the verdict and evidence are written into this document
[ ] 2. Email-capture track: record the finding (scope, parsing fallback rules, LLM-dependency
       risk) — done when the verdict and evidence are written into this document
```

---

## 5. Summary

### Architecture impact

- [x] No change to ARCHITECTURE.md expected
- [ ] Amends Description sections
- [ ] Requires a Constitution change

### North star deviation

§0 pending; interim README north star: "avoid mixed-language parsing ambiguity… be suspicious
of features that mostly patch over product states" — the email-capture track's LLM-trap caution
is carried into item 2's scope verbatim. No deviation from research itself.

### Open questions

| # | Question | Blocks | Decision needed by |
|---|---|---|---|
| Q1 | Both verdicts | Any follow-up integration epic | Checklist completion |

### New capability

None yet — this epic exists to decide whether one should.
