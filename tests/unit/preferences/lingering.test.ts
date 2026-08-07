// Pins the lingering-threshold preference: persisted to localStorage, clamped to a sane
// range, and always falling back to the default rather than yielding a broken threshold.
class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
(globalThis as unknown as { localStorage: Storage }).localStorage =
  new MemoryStorage() as unknown as Storage;

import { DEFAULT_LINGERING_DAYS } from "../../../src/models/tasks/taskAttention";
import {
  LINGERING_DAYS_KEY,
  MAX_LINGERING_DAYS,
  MIN_LINGERING_DAYS,
  clampLingeringDays,
  loadLingeringDays,
  saveLingeringDays,
} from "../../../src/utils/preferences/lingering";

let failures = 0;
function assertEqual<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures++;
    console.error(`  \x1b[31m✗ ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}\x1b[0m`);
  }
}

// Nothing stored → the default the user was promised.
localStorage.clear();
assertEqual("empty store → 7 days", loadLingeringDays(), DEFAULT_LINGERING_DAYS);

// Round-trip of a tuned threshold.
saveLingeringDays(14);
assertEqual("saved threshold round-trips", loadLingeringDays(), 14);

// Clamping: 0 would make every fresh capture linger immediately.
assertEqual("zero clamps up to the minimum", clampLingeringDays(0), MIN_LINGERING_DAYS);
assertEqual("negative clamps up to the minimum", clampLingeringDays(-5), MIN_LINGERING_DAYS);
assertEqual("absurd values clamp to the maximum", clampLingeringDays(10_000), MAX_LINGERING_DAYS);
assertEqual("fractions truncate to whole days", clampLingeringDays(7.9), 7);
assertEqual("numeric strings are accepted", clampLingeringDays("21"), 21);
assertEqual("non-numeric falls back to the default", clampLingeringDays("soon"), DEFAULT_LINGERING_DAYS);
assertEqual("null falls back to the default", clampLingeringDays(null), DEFAULT_LINGERING_DAYS);
assertEqual("NaN falls back to the default", clampLingeringDays(Number.NaN), DEFAULT_LINGERING_DAYS);

// Saving clamps too, so a bad value can never reach storage.
localStorage.clear();
saveLingeringDays(0);
assertEqual("saving 0 stores the minimum", loadLingeringDays(), MIN_LINGERING_DAYS);

// A corrupt stored value never breaks the bucket.
localStorage.clear();
localStorage.setItem(LINGERING_DAYS_KEY, "whenever");
assertEqual("corrupt stored value → default", loadLingeringDays(), DEFAULT_LINGERING_DAYS);

if (failures > 0) {
  console.error(`\x1b[31mLingering preference tests failed: ${failures}\x1b[0m`);
  process.exit(1);
}
console.log("Lingering preference tests passed");
