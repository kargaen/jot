# EPIC-014: Export & copy surface

**Status:** active
**Created:** 2026-07-14
**Architecture baseline:** 83af2d9

**Source:** owner decisions, 2026-07-14:

> two buttons or maybe a small menu on the existing copy button to pick between json and Markdown.
> I am missing the button on a *project* list and *area* list. probably also on subtask level…
> any list view/component should expose a list of tasks that the container of the component can
> grab and expose to the copy mechanism.
> dropping empty entries should be the new norm. consumers have to be as resilient that they
> don't break if something is missing.

Grounded state (verified 2026-07-14):
- The "copy as JSON" header action exists only in the **mobile** AppShell, driven by a route
  `handle: { exportTasks }`. Present on today/upcoming/all/logbook/space/project; absent on the
  overdue/inbox stubs.
- **Desktop** (`Dashboard.view.tsx`, the main multi-window surface) has **no** copy affordance on
  any list. Subtask lists (in TaskDetail) have none either.
- `src/models/export/jotExport.ts` is the single serializer, shared by the clipboard action **and**
  the Conduit edge function (§11a Constitution; §11b Description). Any output-shape change is an
  external Conduit API change.

---

## 1. BDD — User Flows

### Flow 1: Copy from any task list

```gherkin
Given any surface that shows a list of tasks (Today, Upcoming, All, Logbook, an area, a project,
      a task's subtasks, and the desktop lists)
When the user triggers copy on that list
Then the clipboard receives that list's tasks in the chosen format
And a list the user is looking at never lacks the affordance while another list has it
```

### Flow 2: Choose JSON or Markdown

```gherkin
Given the copy affordance on a task list
When the user picks a format (JSON or Markdown)
Then JSON yields the machine JotExport payload
And Markdown yields a human-readable rendering of the same tasks
And the chosen format is remembered as the default for next time
```

### Flow 3: Empty fields are omitted

```gherkin
Given a task with no due date, no notes, no project, and no effort
When it is exported (JSON, and via the Conduit API)
Then keys for those absent values are omitted entirely rather than emitted as null
And a consumer reading a present key always gets a meaningful value
```

**Out of scope for this epic:**
- Which tasks each list contains — this epic copies whatever the list already shows.
- New export *destinations* (save-to-file, Android share sheet) — that is EPIC-008.
- Auth, tokens, or the Conduit security boundary.
- A round-trip *import* of Markdown — Markdown is export-only, human-facing.
- Bumping the JotExport version number — parked as Q2 (a decision, not an omission).

---

## 2. Function Call Signatures

The one contract pinned early (Q1 resolved): Markdown is produced from the serializer's output,
so no second data source of truth exists.

```ts
function renderMarkdown(export: JotExportV1): string;  // pure; derived presentation only
```

Remaining helpers deferred to revision 2.

---

## 3. TDD — Testing Strategy

### Authority for correctness

| Under test | Authority |
|---|---|
| JSON output with empty keys dropped | Legacy application output — the existing `serializeTasks` golden output with null/empty keys removed; a golden fixture in the export test pins it |
| Markdown rendering | This epic's golden fixture is the authority (owner delegated the format: "not bothered with the format details", 2026-07-14). Rendered from `JotExportV1`, so it inherits the empty-omission of Q3. |
| Empty-key omission rule | **Q3 resolved 2026-07-14: drop anything with no meaning — null scalars, empty strings, empty arrays, empty objects.** Golden fixture pins it. |
| Copy on each new surface (area, project, subtask, desktop) | Legacy parity — reproduces the mobile export behaviour on the new surface; the serializer output is identical for the same task set |

### Test map

| Flow | Function call | Authority | Fixture | Tolerance |
|---|---|---|---|---|
| 3 | `serializeTasks` (empties dropped) | legacy output minus empties | `tests/unit/models/` golden | exact |
| 2 | Markdown renderer | this epic's golden (Q1-gated) | `tests/unit/models/` golden | exact |
| 1 | per-surface task exposure → serializer | legacy parity | reuse export fixtures | exact string |

### What is deliberately not tested

The picker's visual design; clipboard permission behaviour on each OS; exact Markdown
typography beyond the pinned golden.

---

## 4. Checklist

Serializer/contract slices first (they pin the data), then UI coverage, then the picker.

```md
[x] 1. Empty-omission rule (Q3) — recorded 2026-07-14: drop anything with no meaning (null
       scalars, empty strings, empty arrays, empty objects). Bump to `version: 2` (Q2).
[x] 2. Golden test for `serializeTasks` v2 with empties dropped — landed as
       `tests/unit/models/task-export.test.ts` (sparse-drops, populated-keeps incl.
       `estimated_mins: 0`, empty-envelope frame); observed red on v1/unstripped output.
[x] 3. Empty omission + `version: 2` in `src/models/export/jotExport.ts` — `isEmpty`/`dropEmpty`
       deep-clean within each task, envelope frame kept, interface renamed `JotExportV2`,
       `tasks: Array<Partial<JotExportTask>>`. Conduit inherits it (returns the same output).
       Wired into `test:tasks`; tsc + full suite green.
[x] 4. Golden test for the Markdown renderer — appended to `task-export.test.ts` (derived
       human view: ids/timestamps/estimated_mins omitted, `priority: none` skipped, singular
       header); observed red on the missing `renderMarkdown` export.
[x] 5. `renderMarkdown(exported: JotExportV2): string` in `src/models/export/jotExport.ts` —
       pure, import-free, reformats the serializer's already-stripped output (no second data
       source, §11a). Test 4 passes; tsc green.
[x] 6. "List exposes its tasks" contract realized as a reusable control: `useCopyTasks.ts`
       (View→Hook→Controller→Service glue) + `views/components/ui/CopyTasksControl.view.tsx`
       (props: `tasks`, `onCopied?`). AppShell refactored onto it — which also removed
       AppShell's prior direct view→service import. tsc + build green. (No render-test: this
       repo has no React test harness; the copy path is pinned by the controller test, and §3
       lists visual rendering as not-tested. Finding recorded.)
[x] 7. Copy on desktop area/project surfaces — `<CopyTasksControl tasks={displayTasks} />` in
       the desktop Dashboard header; covers today/inbox/area/project (whatever `displayTasks`
       holds). Build green.
[x] 8. Copy on the subtask list — `<CopyTasksControl tasks={subtasks} />` in TaskDetail's
       Subtasks header. Build green.
[x] 9. JSON/Markdown picker + global remembered default (Q4) — `src/utils/preferences/exportFormat.ts`
       (localStorage `jot_export_format`, JSON default, pinned by `export-format.test.ts`);
       `exportTasksToClipboard(..., format)` dispatches JSON vs `renderMarkdown` (pinned by
       `export-tasks-controller.test.ts`); AppShell renders JSON/MD chips + clipboard, copies in
       the chosen format and remembers it. tsc + full build green. (Desktop copy in item 7 reuses
       this same control.)
```

---

## 5. Summary

### Architecture impact

- [ ] No change to ARCHITECTURE.md expected
- [x] Amends Description sections: §11b (Conduit response shape — empty keys omitted), and §10 /
  the list-exposure pattern once it ships
- [ ] **Requires a Constitution change** — see the top-line flag below

**Top-line flag (resolved).** The Markdown slices (items 4–5) sit against **§11a**
(Constitution): *"Never hand-roll a second serialization format."* Owner decided 2026-07-14
that Markdown is acceptable **as a presentation derived from** the single `serializeTasks`
output — the JSON JotExport stays the one data source of truth, Conduit still emits only JSON,
nothing forks. Under that reading no Constitution change is *required* to proceed. A one-line
§11a clarification (permitting derived human-presentation formats) would remove future ambiguity,
but only a human may make that edit — see Action needed. Not a blocker.

### North star deviation

§0: "Capture is never more than a moment away… No feature, layer, or dependency may sit between
the user and capture." This epic is about getting tasks *out*, the mirror of capture, and adds no
friction to capture. Dropping empty keys and covering every list make output cleaner and more
uniform — aligned, no deviation.

### Open questions

| # | Question | Blocks | Decision needed by |
|---|---|---|---|
| Q1 | ~~§11a and derived Markdown?~~ **Resolved 2026-07-14: accepted as derived presentation; no required Constitution change.** | — | — |
| Q2 | ~~Version bump?~~ **Resolved 2026-07-14: bump to `version: 2`.** | — | — |
| Q3 | ~~What is "empty"?~~ **Resolved 2026-07-14: drop anything with no meaning — null/empty scalars, empty arrays, empty objects.** | — | — |
| Q4 | ~~Default global or per-surface?~~ **Resolved 2026-07-14: global.** | — | — |

### New capability

Yes — a second, human-readable copy format (Markdown) and a universal per-list copy affordance;
both are named here because they extend the export surface beyond today's JSON-only, mobile-only
action.
