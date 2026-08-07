// Pins the Lingering bucket: open + undated + untouched for at least the configured
// threshold. The threshold is a user setting, so the predicate is measured against
// whatever it is given — never a hardcoded 7.
import {
  DEFAULT_LINGERING_DAYS,
  daysSinceUpdate,
  filterLingeringTasks,
  isLingering,
  isUndated,
  type LingeringCandidate,
} from "../../../src/models/tasks/taskAttention";

let failures = 0;
function assertEqual<T>(label: string, actual: T, expected: T) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) {
    failures++;
    console.error(`  \x1b[31m✗ ${label}: expected ${right}, got ${left}\x1b[0m`);
  }
}

const TODAY = "2026-08-07";

function task(overrides: Partial<LingeringCandidate> = {}): LingeringCandidate {
  return {
    status: "todo",
    due_date: null,
    scheduled_date: null,
    updated_at: `${TODAY}T09:00:00.000Z`,
    ...overrides,
  };
}

// ── The default the settings page starts from ──
assertEqual("default threshold is 7 days", DEFAULT_LINGERING_DAYS, 7);

// ── Undated means no due date AND no scheduled date, and still open ──
assertEqual("open task with no dates is undated", isUndated(task()), true);
assertEqual("due date disqualifies", isUndated(task({ due_date: "2026-08-01" })), false);
assertEqual("scheduled date disqualifies", isUndated(task({ scheduled_date: "2026-09-01" })), false);
assertEqual("completed task is not undated work", isUndated(task({ status: "completed" })), false);
assertEqual("cancelled task is not undated work", isUndated(task({ status: "cancelled" })), false);

// ── Days since the last change, counted from the date part of updated_at ──
assertEqual("changed today = 0 days", daysSinceUpdate(task(), TODAY), 0);
assertEqual(
  "changed 7 days ago = 7 days",
  daysSinceUpdate(task({ updated_at: "2026-07-31T23:59:59.000Z" }), TODAY),
  7,
);
assertEqual(
  "a late-evening change still counts as that whole day",
  daysSinceUpdate(task({ updated_at: "2026-08-06T23:30:00.000Z" }), TODAY),
  1,
);
assertEqual(
  "a future timestamp never goes negative",
  daysSinceUpdate(task({ updated_at: "2026-08-20T09:00:00.000Z" }), TODAY),
  0,
);
assertEqual(
  "an unparseable timestamp counts as fresh",
  daysSinceUpdate(task({ updated_at: "not-a-date" }), TODAY),
  0,
);

// ── The threshold is inclusive, and read from the argument ──
const sevenDaysStale = task({ updated_at: "2026-07-31T09:00:00.000Z" });
const sixDaysStale = task({ updated_at: "2026-08-01T09:00:00.000Z" });

assertEqual("exactly at the threshold lingers", isLingering(sevenDaysStale, TODAY, 7), true);
assertEqual("one day short does not linger", isLingering(sixDaysStale, TODAY, 7), false);
assertEqual("same task lingers under a 3-day threshold", isLingering(sixDaysStale, TODAY, 3), true);
assertEqual("same task is fresh under a 30-day threshold", isLingering(sevenDaysStale, TODAY, 30), false);
assertEqual("threshold defaults to 7 when omitted", isLingering(sevenDaysStale, TODAY), true);

// A dated task never lingers, however long it has sat — Overdue/Upcoming already own it.
assertEqual(
  "an old but dated task belongs to another bucket",
  isLingering(task({ updated_at: "2026-01-01T09:00:00.000Z", due_date: "2026-01-05" }), TODAY, 7),
  false,
);
assertEqual(
  "an old completed task never lingers",
  isLingering(task({ updated_at: "2026-01-01T09:00:00.000Z", status: "completed" }), TODAY, 7),
  false,
);

// ── Filtering returns longest-untouched first ──
type Row = LingeringCandidate & { id: string };
const rows: Row[] = [
  { ...task({ updated_at: "2026-07-20T09:00:00.000Z" }), id: "middle" },
  { ...task({ updated_at: `${TODAY}T09:00:00.000Z` }), id: "fresh" },
  { ...task({ updated_at: "2026-06-01T09:00:00.000Z" }), id: "oldest" },
  { ...task({ updated_at: "2026-07-01T09:00:00.000Z", due_date: "2026-07-02" }), id: "dated" },
  { ...task({ updated_at: "2026-07-25T09:00:00.000Z" }), id: "newest-lingering" },
];

assertEqual(
  "lingering tasks come back longest-untouched first",
  filterLingeringTasks(rows, TODAY, 7).map((r) => r.id),
  ["oldest", "middle", "newest-lingering"],
);
assertEqual(
  "a huge threshold empties the bucket",
  filterLingeringTasks(rows, TODAY, 365).map((r) => r.id),
  [],
);
assertEqual("no tasks → no lingering tasks", filterLingeringTasks([], TODAY, 7), []);

if (failures > 0) {
  console.error(`\x1b[31mTask attention tests failed: ${failures}\x1b[0m`);
  process.exit(1);
}
console.log("Task attention tests passed");
