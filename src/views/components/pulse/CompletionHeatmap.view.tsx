import { useMemo, useState } from "react";

const WEEKS = 16;
const CELL = 13;
const GAP = 3;

function toISO(d: Date): string {
  return d.toISOString().split("T")[0];
}

function getMondayOf(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setDate(m.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.trim().replace(/\s/g, "");
  if (!h.startsWith("#") || h.length < 7) return `rgba(91,91,214,${alpha})`;
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function cellColor(count: number, accent: string): string {
  if (count === 0) return "var(--bg-tertiary)";
  if (count === 1) return hexToRgba(accent, 0.25);
  if (count <= 3)  return hexToRgba(accent, 0.5);
  if (count <= 6)  return hexToRgba(accent, 0.75);
  return accent;
}

const DAY_ROWS = [
  { row: 0, label: "Mon" },
  { row: 2, label: "Wed" },
  { row: 4, label: "Fri" },
];

export default function CompletionHeatmap({ dates }: { dates: string[] }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const accentColor = useMemo(
    () => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(),
    [],
  );

  const { weeks, countMap, currentStreak, bestStreak, monthLabels } = useMemo(() => {
    const countMap: Record<string, number> = {};
    for (const d of dates) {
      const day = d.slice(0, 10);
      countMap[day] = (countMap[day] ?? 0) + 1;
    }

    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    const todayStr = toISO(todayDate);

    const startMonday = getMondayOf(todayDate);
    startMonday.setDate(startMonday.getDate() - (WEEKS - 1) * 7);

    const weeks: string[][] = [];
    const cursor = new Date(startMonday);
    for (let w = 0; w < WEEKS; w++) {
      const week: string[] = [];
      for (let d = 0; d < 7; d++) {
        week.push(toISO(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(week);
    }

    // Current streak: consecutive days backwards from today
    let currentStreak = 0;
    const cur = new Date(todayDate);
    while (countMap[toISO(cur)]) {
      currentStreak++;
      cur.setDate(cur.getDate() - 1);
    }

    // Best streak over the grid
    let bestStreak = 0;
    let run = 0;
    for (const day of weeks.flat()) {
      if (day > todayStr) break;
      if (countMap[day]) { run++; bestStreak = Math.max(bestStreak, run); }
      else run = 0;
    }

    // Month labels: show when month changes
    const monthLabels: { col: number; label: string }[] = [];
    let lastMonth = -1;
    weeks.forEach((week, col) => {
      const m = new Date(week[0] + "T00:00:00").getMonth();
      if (m !== lastMonth) {
        monthLabels.push({ col, label: new Date(week[0] + "T00:00:00").toLocaleDateString("en-GB", { month: "short" }) });
        lastMonth = m;
      }
    });

    return { weeks, countMap, currentStreak, bestStreak, monthLabels };
  }, [dates]);

  const todayStr = toISO(new Date());
  const totalCompleted = Object.values(countMap).reduce((a, b) => a + b, 0);

  return (
    <div
      style={{
        marginTop: 32,
        padding: "20px 24px",
        background: "var(--bg-primary)",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      {/* Stats */}
      <div style={{ display: "flex", gap: 32, marginBottom: 20 }}>
        <Stat label="Completed (16 wks)" value={String(totalCompleted)} accent={accentColor} />
        <Stat label="Current streak" value={currentStreak > 0 ? `${currentStreak} day${currentStreak > 1 ? "s" : ""}` : "—"} accent={accentColor} />
        <Stat label="Best streak" value={bestStreak > 0 ? `${bestStreak} day${bestStreak > 1 ? "s" : ""}` : "—"} accent={accentColor} />
      </div>

      {/* Heatmap grid */}
      <div style={{ display: "flex", gap: GAP, alignItems: "flex-start" }}>
        {/* Day labels */}
        <div style={{ display: "flex", flexDirection: "column", gap: GAP, paddingTop: 20, marginRight: 6, flexShrink: 0 }}>
          {Array.from({ length: 7 }, (_, i) => {
            const entry = DAY_ROWS.find((d) => d.row === i);
            return (
              <div
                key={i}
                style={{ height: CELL, display: "flex", alignItems: "center", fontSize: 10, color: "var(--text-tertiary)", width: 26, justifyContent: "flex-end" }}
              >
                {entry ? entry.label : ""}
              </div>
            );
          })}
        </div>

        <div>
          {/* Month labels */}
          <div style={{ display: "flex", gap: GAP, marginBottom: 4, height: 16 }}>
            {weeks.map((_, col) => {
              const ml = monthLabels.find((m) => m.col === col);
              return (
                <div key={col} style={{ width: CELL, fontSize: 10, color: "var(--text-tertiary)", overflow: "visible", whiteSpace: "nowrap" }}>
                  {ml ? ml.label : ""}
                </div>
              );
            })}
          </div>

          {/* Cells */}
          <div style={{ display: "flex", gap: GAP }}>
            {weeks.map((week, col) => (
              <div key={col} style={{ display: "flex", flexDirection: "column", gap: GAP }}>
                {week.map((day) => {
                  const count = countMap[day] ?? 0;
                  const isFuture = day > todayStr;
                  return (
                    <div
                      key={day}
                      onMouseEnter={(e) => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        const d = new Date(day + "T00:00:00");
                        const dateLabel = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
                        setTooltip({
                          x: rect.left + CELL / 2,
                          y: rect.top,
                          text: count > 0 ? `${count} task${count > 1 ? "s" : ""} · ${dateLabel}` : dateLabel,
                        });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                      style={{
                        width: CELL,
                        height: CELL,
                        borderRadius: 3,
                        background: isFuture ? "transparent" : cellColor(count, accentColor),
                        opacity: isFuture ? 0 : 1,
                        cursor: "default",
                        transition: "background 150ms",
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 12, justifyContent: "flex-end" }}>
        <span style={{ fontSize: 10, color: "var(--text-tertiary)", marginRight: 4 }}>Less</span>
        {[0, 1, 2, 4, 7].map((n) => (
          <div key={n} style={{ width: CELL, height: CELL, borderRadius: 3, background: cellColor(n, accentColor) }} />
        ))}
        <span style={{ fontSize: 10, color: "var(--text-tertiary)", marginLeft: 4 }}>More</span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: "fixed",
            left: tooltip.x,
            top: tooltip.y - 8,
            transform: "translate(-50%, -100%)",
            background: "var(--bg-primary)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-sm)",
            padding: "4px 8px",
            fontSize: 12,
            color: "var(--text-primary)",
            boxShadow: "var(--shadow-md)",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            zIndex: 100,
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
        {label}
      </span>
      <span style={{ fontSize: 22, fontWeight: 700, color: accent, lineHeight: 1.1 }}>
        {value}
      </span>
    </div>
  );
}
