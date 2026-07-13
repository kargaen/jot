// Pins EPIC-013 item 5: the effort config preference (runtime-tweakable weights +
// daily capacity, persisted to localStorage, per-field fallback to defaults).
class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
(globalThis as unknown as { localStorage: Storage }).localStorage =
  new MemoryStorage() as unknown as Storage;

import { DEFAULT_EFFORT_CONFIG } from "../../../src/models/tasks/taskEffort";
import {
  EFFORT_CONFIG_KEY,
  loadEffortConfig,
  saveEffortConfig,
} from "../../../src/utils/preferences/effortConfig";

let failures = 0;
function assertEqual<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures++;
    console.error(`  \x1b[31m✗ ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}\x1b[0m`);
  }
}

// Nothing stored → defaults.
localStorage.clear();
assertEqual("empty store → defaults", loadEffortConfig(), DEFAULT_EFFORT_CONFIG);

// Full round-trip of a tuned config.
const tuned = { weights: { light: 1, medium: 3, heavy: 5 }, dailyCapacity: 6 };
saveEffortConfig(tuned);
assertEqual("saved config round-trips", loadEffortConfig(), tuned);

// Partial stored config merges over defaults (user only changed capacity).
localStorage.clear();
localStorage.setItem(EFFORT_CONFIG_KEY, JSON.stringify({ dailyCapacity: 12 }));
assertEqual("partial merges over default weights", loadEffortConfig(), {
  weights: DEFAULT_EFFORT_CONFIG.weights,
  dailyCapacity: 12,
});

// A single bad weight falls back for that field only.
localStorage.clear();
localStorage.setItem(
  EFFORT_CONFIG_KEY,
  JSON.stringify({ weights: { light: 2, medium: "oops", heavy: 9 } }),
);
assertEqual("bad weight falls back per-field", loadEffortConfig().weights, {
  light: 2,
  medium: DEFAULT_EFFORT_CONFIG.weights.medium,
  heavy: 9,
});

// Corrupt JSON → defaults, never throws.
localStorage.clear();
localStorage.setItem(EFFORT_CONFIG_KEY, "{not json");
assertEqual("corrupt json → defaults", loadEffortConfig(), DEFAULT_EFFORT_CONFIG);

if (failures > 0) {
  console.error(`\nEffort config preference tests: ${failures} failed`);
  process.exit(1);
}
console.log("Effort config preference tests passed");
