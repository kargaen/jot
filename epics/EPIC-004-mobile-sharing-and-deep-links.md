# EPIC-004: Mobile sharing parity & deep-link handoff

**Status:** draft
**Created:** 2026-07-12
**Architecture baseline:** 7d0178c

**Source:** migrated from `ROADMAP.md` (deleted by the governance cleanup):

> Add mobile project-sharing parity. Desktop project sharing is in place. Mobile can wait for
> now, but it should eventually support project invites and acceptance too.

> Expand deep-link routes for app handoff. Build on the confirmation flow so Jot can open
> directly into shared spaces, projects, and assignment-related surfaces from links.

> Adopt verified HTTPS app links / universal links. Replace the first-pass custom scheme flow
> with stronger mobile-friendly links once hosting and domain control are ready.

---

## 1. BDD — User Flows

### Flow 1: Mobile invite parity

```gherkin
Given a user on mobile who owns a shared-capable project
When they invite a collaborator
Then the invite works end-to-end on mobile as it already does on desktop
And the invitee can accept from mobile
```

### Flow 2: Links land in the right place

```gherkin
Given a valid link to a shared space, project, or assigned task
When the recipient opens it on a device with Jot installed
Then Jot opens directly on that surface after the existing confirmation flow
```

**Out of scope for this epic:**
- Verified HTTPS app links replacing the custom scheme — recorded here as the follow-up step,
  blocked on hosting/domain control (Q1). The custom scheme remains v1.
- New collaboration semantics (roles, permissions changes).

---

## 2. Function Call Signatures

*(deferred to revision 2)*

---

## 3. TDD — Testing Strategy

Authority: legacy application output — desktop sharing behaviour is the contract mobile must
reproduce; the existing deep-link confirmation flow (`services/desktop/deepLinks.service.ts`
and the RLS collaboration suite) pins access outcomes.

### Test map

| Flow | Function call | Authority | Fixture | Tolerance |
|---|---|---|---|---|
| 1 | invite/accept path on mobile | desktop parity (legacy output) | existing collaboration fixtures | exact |
| 2 | deep-link route resolution | TBD at revision 2 | TBD | exact |

### What is deliberately not tested

Push-notification delivery timing; OS-level link-association UI.

---

## 4. Checklist

```md
[ ] 1. Revision 2 of this epic: enumerate the deep-link route matrix and mobile invite
       surfaces, then slice — done when epic-review returns approved
```

---

## 5. Summary

### Architecture impact

- [x] Amends Description sections: §10 (routes), possibly §11b if Conduit-adjacent surfaces
  are touched
- [ ] No change to ARCHITECTURE.md expected
- [ ] Requires a Constitution change

### North star deviation

§0 pending; interim README north star: "lightweight collaboration without bloating the
product." Parity work, no new ceremony — no deviation.

### Open questions

| # | Question | Blocks | Decision needed by |
|---|---|---|---|
| Q1 | Hosting/domain control for verified HTTPS app links | The follow-up epic only | Before that epic is formulated |

### New capability

None — parity and reach for existing sharing.
