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
  // EPIC-013 Q1: optional per-area capacity (areaId → points). An area listed here also
  // warns when its own day-load exceeds this, independently of the daily total. Areas not
  // listed contribute only to the daily total.
  areaCapacities?: Record<string, number>;
}

// One area whose day-load exceeded its own configured capacity.
export interface AreaOverload {
  areaId: string;
  load: number;
  capacity: number;
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

// Areas whose day-load exceeds their own configured capacity. Only areas listed in
// config.areaCapacities can appear; an area without a configured cap never warns (it
// counts only toward the daily total). Same strict-exceeds rule as the daily check.
export function overCapacityAreas(
  tasks: ReadonlyArray<{ effort?: EffortLevel | null; area_id?: string | null }>,
  config: EffortConfig,
): AreaOverload[] {
  const caps = config.areaCapacities;
  if (!caps) return [];
  const result: AreaOverload[] = [];
  for (const areaId of Object.keys(caps)) {
    const capacity = caps[areaId];
    const load = dayLoad(
      tasks.filter((t) => t.area_id === areaId),
      config,
    );
    if (load > capacity) result.push({ areaId, load, capacity });
  }
  return result;
}
