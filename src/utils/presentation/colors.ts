/**
 * Deterministic cyclic color assignment for spaces and projects.
 * Colors are derived from the entity's ID via hash, so the same
 * space/project always gets the same color on every device.
 */

const SPACE_PALETTE = [
  "#6366f1", // indigo
  "#0ea5e9", // sky
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
];

const PROJECT_PALETTE = [
  "#3b82f6", // blue
  "#22c55e", // green
  "#f97316", // orange
  "#a855f7", // purple
  "#06b6d4", // cyan
  "#84cc16", // lime
  "#f43f5e", // rose
  "#64748b", // slate
];

function hashId(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) + h + id.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function spaceColor(id: string): string {
  return SPACE_PALETTE[hashId(id) % SPACE_PALETTE.length];
}

export function projectColor(id: string): string {
  return PROJECT_PALETTE[hashId(id) % PROJECT_PALETTE.length];
}
