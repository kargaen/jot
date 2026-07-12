# EPIC-007: Space-level policies

**Status:** draft
**Created:** 2026-07-12
**Architecture baseline:** 7d0178c

**Source:** migrated from `ROADMAP.md` (deleted by the governance cleanup):

> Add space-level policies. Examples: default project, widget eligibility, reminder behavior,
> archive defaults.

---

## 1. BDD — User Flows

### Flow 1: A space carries defaults

```gherkin
Given a user who configured a default project on a space
When they capture a task into that space without naming a project
Then the task lands in the default project
```

### Flow 2: Policies stay optional

```gherkin
Given a user who never opens space settings
When they use spaces normally
Then behaviour is identical to today — every policy has today's behaviour as its default
```

**Out of scope for this epic:**
- Which exact policies ship is undecided (Q1); the roadmap's four are candidates, not scope.
- Per-project policies.

---

## 2. Function Call Signatures

*(deferred to revision 2)*

---

## 3. TDD — Testing Strategy

Authority: TBD until the policy set is decided (Q1). Flow 2's authority is legacy application
output — policy-free behaviour must be byte-identical to today's.

### Test map

| Flow | Function call | Authority | Fixture | Tolerance |
|---|---|---|---|---|
| 2 | default-path behaviour with no policies set | legacy output | existing suites | exact |

### What is deliberately not tested

Settings UI layout.

---

## 4. Checklist

```md
[ ] 1. Decide the v1 policy set (human decision) — done when recorded here with one §1 flow
       per policy
[ ] 2. Revision 2: test map + slices — done when epic-review returns approved
```

---

## 5. Summary

### Architecture impact

- [x] Amends Description sections: §2 (policy storage)
- [ ] No change to ARCHITECTURE.md expected
- [ ] Requires a Constitution change

### North star deviation

§0 pending; interim README north star: "strong defaults before customization." This epic IS
customization — the guard is Flow 2: zero-config behaviour must remain today's behaviour.
Named plainly.

### Open questions

| # | Question | Blocks | Decision needed by |
|---|---|---|---|
| Q1 | Which policies ship in v1? | Everything | Item 1 |

### New capability

Yes — first per-space configuration surface.
