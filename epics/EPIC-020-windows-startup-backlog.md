# EPIC-020: Windows startup backlog draft

**Status:** draft
**Created:** 2026-07-17
**Architecture baseline:** 77cf288

**Source:** owner backlog notes, 2026-07-17. This draft isolates install/startup behavior because it is platform and release-surface work, separate from Pulse's existing window-opening preference.

---

## 1. BDD — User Flows

### Flow 1: Choose app startup during install

```gherkin
Given the user is installing Jot on Windows
When the installer reaches startup preferences
Then the user can choose whether Jot starts with Windows
And that choice controls app autostart, not whether Pulse opens when the app starts
```

### Flow 2: Startup choice remains reversible

```gherkin
Given the user previously chose whether Jot starts with Windows
When they later change their mind
Then they can update the app autostart setting without confusing it with Pulse's "Open on start" behavior
```

**Out of scope for this draft:**
- Pulse window startup behavior except for clarifying that it is separate.
- Non-Windows startup UX unless later chosen.
- Release implementation details.

---

## 2. Function Call Signatures

*(deferred to revision 2)*

The contract depends on Tauri installer/autostart capabilities and the current release setup.

---

## 3. TDD — Testing Strategy

### Authority for correctness

| Backlog item | Likely authority when promoted | Notes |
|---|---|---|
| Ask during install to start with Windows | Tauri/Windows installer behavior | Likely needs manual or release-candidate validation. |
| Keep separate from Pulse "Open on start" | Existing Pulse preference behavior | Regression should prove app autostart and Pulse-open-on-app-start are distinct settings. |
| Reversible setting | Tauri autostart capability behavior | The app should expose or document a way to change the decision later. |

### Test map

| Flow | Function call | Authority | Fixture | Tolerance |
|---|---|---|---|---|
| 1 | TBD | Windows installer/autostart behavior | TBD | exact setting state |
| 2 | TBD | existing Pulse preference behavior | TBD | exact separation of settings |

### What is deliberately not tested

This draft does not define installer UI text, registry/startup mechanism, or cross-platform behavior.

---

## 4. Checklist

Draft backlog items for later formulation:

```md
[ ] 1. Ask during install whether Jot starts with Windows — the existing Pulse "Open on start" setting is separate and controls opening Pulse on app start. Reflection: this is OS/install/release work, not a normal view tweak; include an in-app way to reverse the choice if possible. Complexity: M-L.
```

---

## 5. Summary

### Architecture impact

- [ ] No change to ARCHITECTURE.md expected
- [x] Amends Description sections if implemented later: release/platform configuration documentation; possibly config/flags if an in-app autostart preference is added
- [ ] **Requires a Constitution change** — a human decision, blocks this epic until resolved

### North star deviation

§0 says: "Jot decides what to show by the user's context, never by its own urgency." Starting with Windows can be helpful but risks making Jot feel intrusive. The epic should keep startup opt-in and clearly separate app autostart from opening Pulse.

### Open questions

| # | Question | Blocks | Decision needed by |
|---|---|---|---|
| Q1 | Should the installer ask only on Windows, or should the product eventually expose startup options on every desktop platform? | Blocks scope | Before formulation |
| Q2 | Where should the user reverse the install-time choice inside the app? | Blocks item 1 | Before implementation |

### New capability

Yes — install-time app autostart choice is a platform capability outside normal in-app task management.
