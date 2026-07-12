# EPIC-009: Auth lifecycle messaging & automation

**Status:** draft
**Created:** 2026-07-12
**Architecture baseline:** 7d0178c

**Source:** migrated from `ROADMAP.md` (deleted by the governance cleanup):

> Improve auth lifecycle messaging and recovery. Make re-signup, unconfirmed accounts, and
> resend-confirmation flows feel intentional instead of silent or ambiguous.

> Add auth lifecycle automation. Decide on cleanup for stale unconfirmed users, reminder emails
> before expiry, and a gentle onboarding follow-up for confirmed users who never create a first
> task.

---

## 1. BDD — User Flows

### Flow 1: Unconfirmed signup is not a dead end

```gherkin
Given a user who signed up but never confirmed their email
When they try to sign in or sign up again with the same address
Then they see a clear explanation of the account's state
And a working way to resend the confirmation
```

### Flow 2: Stale accounts are handled deliberately

```gherkin
Given an unconfirmed account older than the decided threshold
When the automation runs
Then the account is cleaned up or reminded per the recorded policy
And confirmed users who never created a task receive at most one gentle follow-up
```

**Out of scope for this epic:**
- Changing auth providers or session mechanics.
- Marketing email of any kind beyond the single onboarding follow-up.

---

## 2. Function Call Signatures

*(deferred to revision 2)*

---

## 3. TDD — Testing Strategy

Authority: Flow 1 messaging states — TBD, requires enumerating Supabase auth error states
first. Flow 2 policy — a human decision to record here (Q1) before it can pin tests. Email
content renders from the existing `EMAIL_TEMPLATES.md` shells (kept in the repo).

### Test map

| Flow | Function call | Authority | Fixture | Tolerance |
|---|---|---|---|---|
| 1 | auth-state → message mapping | TBD (state enumeration) | TBD | exact |
| 2 | cleanup/reminder selection | recorded policy (Q1) | TBD | exact |

### What is deliberately not tested

Email deliverability; Supabase's own auth internals.

---

## 4. Checklist

```md
[ ] 1. Enumerate the real Supabase auth lifecycle states Jot can encounter — done when
       recorded here as the state table Flow 1 tests assert against
[ ] 2. Decide the automation policy (thresholds, reminder timing) — human decision, done
       when recorded here
[ ] 3. Revision 2: slices — done when epic-review returns approved
```

---

## 5. Summary

### Architecture impact

- [x] Amends Description sections: possibly a new Description entry if a scheduled
  edge-function/cron surface is added
- [ ] No change to ARCHITECTURE.md expected
- [ ] Requires a Constitution change

### North star deviation

§0 pending; interim README north star: "the app should reduce mental load" — silent auth dead
ends are load; no deviation.

### Open questions

| # | Question | Blocks | Decision needed by |
|---|---|---|---|
| Q1 | Cleanup/reminder policy and thresholds | Flow 2 | Item 2 |
| Q2 | Where does scheduled automation run (Supabase cron / edge function)? | Flow 2 slices | Revision 2 |

### New capability

Yes — first scheduled backend automation, named deliberately.
