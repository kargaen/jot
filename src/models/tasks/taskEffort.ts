// EPIC-013: effort-based capacity planning (model layer — pure, no I/O).
//
// Effort is a simple ordinal scale (light/medium/heavy), deliberately NOT hours: it
// never converts to time (§0 north star, clause 3). Weights and the daily capacity are
// runtime-tweakable config (Q2), so every predicate here takes the config as an argument
// rather than baking in numbers — tuning is a settings change, not a code change.
export type EffortLevel = "light" | "medium" | "heavy";

export interface EffortConfig {
  weights: Record<EffortLevel, number>;
  dailyCapacity: number;
}

// Suggested starting values (Q2) — non-linear like a scrum scale so "heavy" carries its
// hidden complexity. A day is ~two heavies, or one heavy + two medium + a light chore.
export const DEFAULT_EFFORT_CONFIG: EffortConfig = {
  weights: { light: 1, medium: 2, heavy: 4 },
  dailyCapacity: 8,
};

// Points for a single task's effort. No effort set contributes nothing.
export function taskEffortPoints(
  effort: EffortLevel | null | undefined,
  config: EffortConfig,
): number {
  return effort == null ? 0 : config.weights[effort];
}

// Total planned effort of the tasks assigned to one day, under the given config.
export function dayLoad(
  tasks: ReadonlyArray<{ effort?: EffortLevel | null }>,
  config: EffortConfig,
): number {
  return tasks.reduce((sum, t) => sum + taskEffortPoints(t.effort, config), 0);
}

// A day is over capacity when its load strictly exceeds capacity — landing exactly on
// capacity is a full-but-fine day, not a warning.
export function isOverCapacity(
  tasks: ReadonlyArray<{ effort?: EffortLevel | null }>,
  config: EffortConfig,
): boolean {
  return dayLoad(tasks, config) > config.dailyCapacity;
}
