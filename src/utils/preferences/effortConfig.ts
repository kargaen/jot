// EPIC-013: persistence for the runtime-tweakable effort config (Q2 — weights and
// daily capacity are tuned in settings, not in code). Mirrors the localStorage
// preference pattern of hiddenAreas / nlpSettings. Every field falls back to its
// default independently, so a partial or corrupt payload never yields a broken config.
import {
  DEFAULT_EFFORT_CONFIG,
  type EffortConfig,
  type EffortLevel,
} from "../../models/tasks/taskEffort";

export const EFFORT_CONFIG_KEY = "jot_effort_config";

const LEVELS: EffortLevel[] = ["light", "medium", "heavy"];

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function mergeAreaCapacities(value: unknown): Record<string, number> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const out: Record<string, number> = {};
  for (const [areaId, cap] of Object.entries(value)) {
    if (typeof cap === "number" && Number.isFinite(cap)) out[areaId] = cap;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function mergeConfig(parsed: unknown): EffortConfig {
  if (typeof parsed !== "object" || parsed === null) return DEFAULT_EFFORT_CONFIG;
  const p = parsed as {
    weights?: Partial<Record<EffortLevel, unknown>>;
    dailyCapacity?: unknown;
    areaCapacities?: unknown;
  };
  const weights = { ...DEFAULT_EFFORT_CONFIG.weights };
  for (const level of LEVELS) {
    weights[level] = num(p.weights?.[level], DEFAULT_EFFORT_CONFIG.weights[level]);
  }
  const config: EffortConfig = {
    weights,
    dailyCapacity: num(p.dailyCapacity, DEFAULT_EFFORT_CONFIG.dailyCapacity),
  };
  const areaCapacities = mergeAreaCapacities(p.areaCapacities);
  if (areaCapacities) config.areaCapacities = areaCapacities;
  return config;
}

export function loadEffortConfig(): EffortConfig {
  try {
    const raw = localStorage.getItem(EFFORT_CONFIG_KEY);
    return raw ? mergeConfig(JSON.parse(raw)) : DEFAULT_EFFORT_CONFIG;
  } catch {
    return DEFAULT_EFFORT_CONFIG;
  }
}

export function saveEffortConfig(config: EffortConfig): void {
  localStorage.setItem(EFFORT_CONFIG_KEY, JSON.stringify(config));
}
