// Pins EPIC-013 item 2/4: the config-driven effort model.
// Weights and capacity are runtime-tweakable (Q2), so the predicate is measured
// against whatever config it is given — never hardcoded numbers.
import {
  DEFAULT_EFFORT_CONFIG,
  taskEffortPoints,
  dayLoad,
  isOverCapacity,
  overCapacityAreas,
  dayCapacityStatus,
  type EffortConfig,
  type EffortLevel,
} from "../../../src/models/tasks/taskEffort";

let failures = 0;
function assertEqual<T>(label: string, actual: T, expected: T) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) {
    failures++;
    console.error(`  \x1b[31m✗ ${label}: expected ${right}, got ${left}\x1b[0m`);
  }
}

type EffortTask = { effort?: EffortLevel | null };
const task = (effort: EffortLevel | null): EffortTask => ({ effort });

// A tuned config, deliberately different from the defaults, to prove the predicate
// reads the config rather than baked-in constants.
const tuned: EffortConfig = { weights: { light: 1, medium: 3, heavy: 5 }, dailyCapacity: 6 };

// ── Suggested defaults (Q2): light=1, medium=2, heavy=4, capacity=8 ──
assertEqual("default light weight", taskEffortPoints("light", DEFAULT_EFFORT_CONFIG), 1);
assertEqual("default medium weight", taskEffortPoints("medium", DEFAULT_EFFORT_CONFIG), 2);
assertEqual("default heavy weight", taskEffortPoints("heavy", DEFAULT_EFFORT_CONFIG), 4);

// ── No effort set contributes nothing ──
assertEqual("null effort = 0 points", taskEffortPoints(null, DEFAULT_EFFORT_CONFIG), 0);
assertEqual("undefined effort = 0 points", taskEffortPoints(undefined, DEFAULT_EFFORT_CONFIG), 0);

// ── Day load sums task effort against the given config ──
assertEqual(
  "empty day = 0 load",
  dayLoad([], DEFAULT_EFFORT_CONFIG),
  0,
);
assertEqual(
  "heavy + medium + null = 4+2+0 (defaults)",
  dayLoad([task("heavy"), task("medium"), task(null)], DEFAULT_EFFORT_CONFIG),
  6,
);
assertEqual(
  "same tasks re-weighted by tuned config = 5+3 = 8",
  dayLoad([task("heavy"), task("medium"), task(null)], tuned),
  8,
);

// ── Over-capacity is load strictly greater than capacity ──
assertEqual(
  "two heavies (8) does not exceed default capacity 8",
  isOverCapacity([task("heavy"), task("heavy")], DEFAULT_EFFORT_CONFIG),
  false,
);
assertEqual(
  "two heavies + light (9) exceeds default capacity 8",
  isOverCapacity([task("heavy"), task("heavy"), task("light")], DEFAULT_EFFORT_CONFIG),
  true,
);
assertEqual(
  "heavy + medium (8) exceeds tuned capacity 6",
  isOverCapacity([task("heavy"), task("medium")], tuned),
  true,
);

// ── Per-area capacity (EPIC-013 Flow 5) ──
// Only areas with their own configured capacity produce an area-level warning; areas
// without one contribute only to the daily total.
type AreaTask = { effort?: EffortLevel | null; area_id?: string | null };
const areaTask = (area_id: string | null, effort: EffortLevel | null): AreaTask => ({ area_id, effort });

const perArea: EffortConfig = {
  weights: { light: 1, medium: 2, heavy: 4 },
  dailyCapacity: 100, // high, so only area limits bite in these cases
  areaCapacities: { work: 4 }, // "work" caps at 4; "home" has none
};

assertEqual(
  "no configured area capacities → no area warnings",
  overCapacityAreas([areaTask("work", "heavy")], DEFAULT_EFFORT_CONFIG),
  [],
);
assertEqual(
  "work under its cap (4) → no warning",
  overCapacityAreas([areaTask("work", "heavy")], perArea),
  [],
);
assertEqual(
  "work over its cap (heavy+medium=6 > 4) → warning names work",
  overCapacityAreas([areaTask("work", "heavy"), areaTask("work", "medium")], perArea),
  [{ areaId: "work", load: 6, capacity: 4 }],
);
assertEqual(
  "home has no cap → never warns even when heavy",
  overCapacityAreas(
    [areaTask("home", "heavy"), areaTask("home", "heavy"), areaTask("work", "light")],
    perArea,
  ),
  [],
);

// ── dayCapacityStatus composite (EPIC-013 item 7) ──
assertEqual(
  "status: under capacity, no area caps",
  dayCapacityStatus([areaTask("work", "medium")], DEFAULT_EFFORT_CONFIG),
  { load: 2, capacity: 8, overCapacity: false, overloadedAreas: [] },
);
assertEqual(
  "status: over daily + over area, both reported",
  dayCapacityStatus(
    [areaTask("work", "heavy"), areaTask("work", "heavy")],
    { weights: { light: 1, medium: 2, heavy: 4 }, dailyCapacity: 6, areaCapacities: { work: 4 } },
  ),
  {
    load: 8,
    capacity: 6,
    overCapacity: true,
    overloadedAreas: [{ areaId: "work", load: 8, capacity: 4 }],
  },
);

if (failures > 0) {
  console.error(`\nTask effort model tests: ${failures} failed`);
  process.exit(1);
}
console.log("Task effort model tests passed");
