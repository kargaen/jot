# EPIC-015: Capture and quick panel backlog draft

**Status:** draft
**Created:** 2026-07-17
**Architecture baseline:** 77cf288

**Source:** owner backlog notes, 2026-07-17. This draft groups the capture-speed, quick-panel, voice, and NLP-parser notes so they can be picked up as one capture-focused epic later.

---

## 1. BDD — User Flows

### Flow 1: Capture accepts input without delay

```gherkin
Given the user has a thought to capture
When they open capture or quick panel and submit a task
Then the UI feels accepted immediately
And the user can immediately trigger another capture with Ctrl+Space
And any save failure preserves the queued text and opens the right recovery UI prefilled
```

### Flow 2: Capture understands natural shorthand reliably

```gherkin
Given the user enters project tags, long titles, or project names through NLP
When Jot parses the capture text
Then title/description splitting does not break project extraction
And supported project-name workarounds are predictable rather than surprising
```

### Flow 3: Capture input can become richer without slowing capture

```gherkin
Given the user prefers speaking or returning to a just-saved item
When they use microphone capture or an "open last edited item" command
Then those affordances remain optional and do not add friction to normal text capture
```

**Out of scope for this draft:**
- Task attachments or screenshots; see EPIC-019.
- Final queue durability design.
- Final parser grammar changes.
- Full implementation checklist.

---

## 2. Function Call Signatures

*(deferred to revision 2)*

Signatures should wait until the first slice identifies whether the core work is latency reduction, durable queued CRUD, parser ordering, or UI draft preservation.

---

## 3. TDD — Testing Strategy

### Authority for correctness

| Backlog item | Likely authority when promoted | Notes |
|---|---|---|
| Slow quick capture saves | Measured before/after timing | First slice should instrument the actual delay before designing a queue. |
| Queued CRUD recovery | Owner examples plus existing create/edit/delete behavior | Tests need to prove drafts are not lost and failures route to the right UI. |
| Long-title split vs `#jot` project tag | Legacy parser output plus a new regression fixture | This looks bounded enough for a parser test before implementation. |
| Project names with spaces through NLP | Owner-approved examples | Avoid adding a setting unless examples prove both literal underscores and space conversion are needed. |
| Quick panel focus loss | Owner-approved UX decision | Prompt, draft, or partial-task behavior must be chosen before implementation. |
| Microphone capture | Platform capability behavior | May need manual OS validation if native permissions are involved. |

### Test map

| Flow | Function call | Authority | Fixture | Tolerance |
|---|---|---|---|---|
| 1 | TBD | measured timing / existing CRUD behavior | TBD | timing threshold TBD; exact recovery state |
| 2 | TBD | legacy parser output plus owner examples | TBD | exact parse result |
| 3 | TBD | platform capability / command behavior | TBD | exact for command routing |

### What is deliberately not tested

This draft does not pin the queue storage layer, retry cadence, microphone implementation, or prompt copy for draft recovery.

---

## 4. Checklist

Draft backlog items for later formulation:

```md
[ ] 1. Add microphone for capture tab — optional voice input for capture. Reflection: valuable only if it preserves instant capture; complexity is L with native/audio permissions, M if an existing browser speech surface is enough.

[ ] 2. Investigate slow saves and make quick capture close optimistically — reported save latency is 2-3 seconds; quick capture should close like the task was accepted, allow immediate Ctrl+Space recapture, queue pending CRUD, and gracefully recover failures by reopening edit/capture prefilled or offering delete retry. Reflection: start with measurement before queue design; durable CRUD queues introduce ordering, idempotency, and failure UX contracts. Complexity: XL.

[ ] 3. Preserve project tag parsing when long-title splitting runs — title/description splitting works, but appears to run before project extraction and leaves `#jot` in the title. Reflection: likely a bounded parser-ordering bug once reproduced. Complexity: S-M.

[ ] 4. Quick panel action: Open last edited item — useful after saving a task and opening it straight away. Reflection: small if last-edited identity already exists; harder if it must account for optimistic queued saves. Complexity: S-M now, M-L if tied to the queue.

[ ] 5. Preserve quick panel draft on focus loss — shifting focus drops typed text. Reflection: because quick panel is not a returnable window, choose between prompting about a draft, silently saving a draft, or creating a partial task; silent partial tasks may create clutter. Complexity: M-L.

[ ] 6. Handle spaces in project names created via NLP — direct NLP project creation breaks on spaces; `_` could be converted to a space, possibly not as a setting until examples justify it. Reflection: parser grammar tradeoff; keep it explicit and fixture-backed. Complexity: S-M.
```

---

## 5. Summary

### Architecture impact

- [ ] No change to ARCHITECTURE.md expected
- [x] Amends Description sections if implemented later: §10 routing/navigation if recovery opens specific windows; possibly §6/parser boundary if parser behavior is documented after shipping
- [ ] **Requires a Constitution change** — a human decision, blocks this epic until resolved

### North star deviation

§0 says: "attention is opt-in, capture is not." This group directly supports that property if latency and recovery improve without adding prompts to the happy path. Microphone and draft prompts can erode it if they become noisy or block text capture.

### Open questions

| # | Question | Blocks | Decision needed by |
|---|---|---|---|
| Q1 | Is the first slice measurement-only, or should queue design be included immediately? | Blocks item 2 | Before formulation |
| Q2 | On focus loss, should quick panel prompt, save a draft, or create a partial task? | Blocks item 5 | Before implementation |
| Q3 | Should `_` become a space for NLP-created project names by default? | Blocks item 6 | Before parser changes |
| Q4 | Is microphone capture native/Tauri, browser-based, or deferred until mobile? | Blocks item 1 | Before formulation |

### New capability

Yes — optional voice capture, optimistic capture, durable recovery, and quick-panel draft/last-edited behavior expand capture beyond the current text-submit path.
