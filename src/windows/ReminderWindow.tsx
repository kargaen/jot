import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow, getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { UserAttentionType, availableMonitors, type Monitor } from "@tauri-apps/api/window";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { useAuth } from "../lib/auth";
import { supabase, fetchAllTasks, fetchProjects, fetchAreas, completeTask } from "../lib/supabase";
import { spaceColor, projectColor } from "../lib/colors";
import { loadHiddenAreas, filterVisibleTasks } from "../lib/tasks";
import { getResolvedTheme, loadThemePreference } from "../lib/theme";
import Toggle from "../components/Toggle";
import type { Area, TaskWithTags, Project } from "../types";

const WINDOW_WIDTH  = 250;
const MARGIN_X      = 16;
const IDLE_PAUSE_MS = 30_000;
const IDLE_POLL_MS  = 3_000;
const MAX_PER_SECTION = 4;
const PULSE_THRESHOLD = 10;
const FALLBACK_WINDOW_HEIGHT = 480;
const EMPTY_AUTO_DURATION = 30;
const CLEARED_DURATION = 10;
const RELAX_IMAGES = [
  "/zen-beach1.png",
  "/zen-beach2.png",
  "/zen-beach3.png",
  "/zen-beach4.png",
  "/zen-beach5.png",
  "/zen-beach6.png",
  "/zen-beach7.png",
];
const RELAX_QUOTES = [
  "Enjoy the quiet. It counts too.",
  "No rush. The day has room.",
  "Clear skies, clear list.",
  "A quiet Pulse is still progress.",
  "Nothing due right now. Breathe.",
];

function loadDuration(): number {
  return parseInt(localStorage.getItem("jot_reminder_duration") ?? "180", 10);
}
function loadPin(): boolean {
  return localStorage.getItem("jot_reminder_pin") !== "false";
}
function loadOnStart(): boolean {
  return localStorage.getItem("jot_reminder_on_start") === "true";
}
function loadOpacity(): number {
  return parseFloat(localStorage.getItem("jot_reminder_opacity") ?? "0.88");
}

function fmtCountdown(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function barColor(progress: number): string {
  return `hsl(${Math.round(progress * 120)}, 72%, 42%)`;
}

function LoadingPulse() {
  return (
    <div style={{ padding: "18px 12px", display: "grid", gap: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", textAlign: "center" }}>
        Loading today's Pulse...
      </div>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: 34,
            borderRadius: "var(--radius-sm)",
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-subtle)",
            opacity: 1 - i * 0.18,
          }}
        />
      ))}
    </div>
  );
}

function monitorBounds(monitor: Monitor) {
  const area = monitor.workArea ?? { position: monitor.position, size: monitor.size };
  const scale = monitor.scaleFactor || 1;
  return {
    x: area.position.x / scale,
    y: area.position.y / scale,
    width: area.size.width / scale,
    height: area.size.height / scale,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function resolvePosition(savedX: string | null, savedY: string | null, monitors: Monitor[]) {
  const width = window.outerWidth || WINDOW_WIDTH;
  const height = window.outerHeight || FALLBACK_WINDOW_HEIGHT;
  const fallback = () => {
    const monitor = monitors[0];
    if (!monitor) {
      return {
        x: window.screen.width - WINDOW_WIDTH - MARGIN_X,
        y: Math.round(window.screen.height * 0.3),
      };
    }
    const bounds = monitorBounds(monitor);
    return {
      x: bounds.x + bounds.width - width - MARGIN_X,
      y: bounds.y + Math.round(bounds.height * 0.3),
    };
  };

  const x = savedX ? parseInt(savedX, 10) : NaN;
  const y = savedY ? parseInt(savedY, 10) : NaN;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return fallback();

  const current = monitors.find((monitor) => {
    const bounds = monitorBounds(monitor);
    return x >= bounds.x && x < bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height;
  });
  if (!current) return fallback();

  const bounds = monitorBounds(current);
  return {
    x: clamp(x, bounds.x, bounds.x + bounds.width - width),
    y: clamp(y, bounds.y, bounds.y + bounds.height - height),
  };
}

async function openTask(task: TaskWithTags) {
  const label = `task-${task.id}`;
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) { await existing.setFocus(); return; }
  new WebviewWindow(label, {
    url: window.location.origin,
    title: task.title,
    width: 700,
    height: 720,
    decorations: true,
    resizable: true,
    center: true,
  });
}

// ─── Task row ─────────────────────────────────────────────────────────────────

function ReminderTask({
  task, projects, areas, onCompleted,
}: { task: TaskWithTags; projects: Project[]; areas: Area[]; onCompleted: (id: string) => void }) {
  const [done, setDone] = useState(false);
  const project = projects.find((p) => p.id === task.project_id) ?? null;
  const areaId  = task.area_id ?? project?.area_id ?? null;
  const area    = areas.find((a) => a.id === areaId) ?? null;

  async function handleComplete(e: React.MouseEvent) {
    e.stopPropagation();
    setDone(true);
    try {
      await completeTask(task.id);
      onCompleted(task.id);
    } catch {
      setDone(false);
    }
  }

  return (
    <div
      onClick={() => openTask(task)}
      style={{
        display: "flex", alignItems: "center", gap: 7, padding: "3px 0",
        cursor: "pointer", opacity: done ? 0.4 : 1, transition: "opacity 200ms",
      }}
    >
      {/* Completion circle */}
      <span
        onClick={handleComplete}
        style={{
          width: 13, height: 13, borderRadius: "50%", flexShrink: 0,
          border: `1.5px solid ${done ? "var(--text-tertiary)" : "var(--border-strong)"}`,
          background: done ? "var(--text-tertiary)" : "transparent",
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      />

      {/* Space indicator — rounded square */}
      <span style={{
        width: 7, height: 7, borderRadius: 2, flexShrink: 0,
        background: area ? spaceColor(area.id) : "var(--text-tertiary)",
      }} />

      <span style={{
        fontSize: 12, color: "var(--text-primary)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
        textDecoration: done ? "line-through" : "none",
      }}>
        {task.title}
      </span>

      {/* Project indicator — circle */}
      {project && (
        <span style={{
          width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
          background: projectColor(project.id),
        }} />
      )}
    </div>
  );
}

// ─── Section ─────────────────────────────────────────────────────────────────

function Section({
  label, color, tasks, projects, areas, divider, onCompleted,
}: {
  label: string; color: string;
  tasks: TaskWithTags[]; projects: Project[]; areas: Area[];
  divider?: boolean;
  onCompleted: (id: string) => void;
}) {
  if (tasks.length === 0) return null;
  const shown = tasks.slice(0, MAX_PER_SECTION);
  const rest  = tasks.length - shown.length;
  return (
    <div style={{ padding: "9px 12px", borderTop: divider ? "1px solid var(--border-subtle)" : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
        <span style={{ width: 7, height: 7, borderRadius: 2, background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.07em" }}>
          {label}
        </span>
        <span style={{ fontSize: 10, color: "var(--text-tertiary)", marginLeft: "auto" }}>
          {tasks.length}
        </span>
      </div>
      {shown.map((t) => (
        <ReminderTask key={t.id} task={t} projects={projects} areas={areas} onCompleted={onCompleted} />
      ))}
      {rest > 0 && (
        <div style={{ fontSize: 11, color: "var(--text-tertiary)", paddingTop: 2 }}>and {rest} more…</div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ReminderWindow() {
  const { user }    = useAuth();
  const isManual    = getCurrentWebviewWindow().label.includes("manual");

  const [tasks,    setTasks]    = useState<TaskWithTags[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [areas,    setAreas]    = useState<Area[]>([]);
  const [pin,      setPin]      = useState(loadPin);
  const [onStart,  setOnStart]  = useState(loadOnStart);
  const [opacity,  setOpacity]  = useState(loadOpacity);

  const duration = useRef(loadDuration());
  const previousPulseCount = useRef<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(duration.current);
  const [paused,      setPaused]      = useState(false);
  const [loaded,      setLoaded]      = useState(false);
  const [relax] = useState(() => ({
    image: RELAX_IMAGES[Math.floor(Math.random() * RELAX_IMAGES.length)],
    quote: RELAX_QUOTES[Math.floor(Math.random() * RELAX_QUOTES.length)],
  }));

  // Inject pulse keyframe
  useEffect(() => {
    const el = document.createElement("style");
    el.textContent = `@keyframes jot-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.45;transform:scale(0.88)}}`;
    document.head.appendChild(el);
    return () => el.remove();
  }, []);

  useEffect(() => {
    const prevBodyBg = document.body.style.background;
    const prevHtmlBg = document.documentElement.style.background;
    document.body.style.background = "transparent";
    document.documentElement.style.background = "transparent";
    return () => {
      document.body.style.background = prevBodyBg;
      document.documentElement.style.background = prevHtmlBg;
    };
  }, []);

  // Restore saved position (or default mid-right), then reveal
  useEffect(() => {
    const win = getCurrentWebviewWindow();
    const savedX = localStorage.getItem("jot_reminder_x");
    const savedY = localStorage.getItem("jot_reminder_y");
    availableMonitors()
      .then((monitors) => resolvePosition(savedX, savedY, monitors))
      .catch(() => resolvePosition(savedX, savedY, []))
      .then(({ x, y }) => win.setPosition(new LogicalPosition(x, y)))
      .then(() => win.show())
      .catch(() => {});
  }, []);

  // Persist size and position — poll to catch drag/resize live
  useEffect(() => {
    let prevX = 0, prevY = 0, prevW = 0, prevH = 0;
    const save = () => {
      const x = window.screenX, y = window.screenY;
      const w = window.outerWidth, h = window.outerHeight;
      if (x !== prevX || y !== prevY) {
        localStorage.setItem("jot_reminder_x", String(x));
        localStorage.setItem("jot_reminder_y", String(y));
        prevX = x; prevY = y;
      }
      if (w !== prevW || h !== prevH) {
        localStorage.setItem("jot_reminder_width", String(w));
        localStorage.setItem("jot_reminder_height", String(h));
        prevW = w; prevH = h;
      }
    };
    const id = setInterval(save, 500);
    return () => clearInterval(id);
  }, []);


  // Always-on-top + taskbar visibility + user attention
  useEffect(() => {
    const win = getCurrentWebviewWindow();
    win.setAlwaysOnTop(pin).catch(() => {});
    win.setSkipTaskbar(pin).catch(() => {});
    if (!pin) {
      setTimeout(() => win.requestUserAttention(UserAttentionType.Informational).catch(() => {}), 400);
    }
  }, [pin]);

  // Load data
  useEffect(() => {
    if (!user) return;
    setLoaded(false);
    Promise.all([fetchAllTasks(), fetchProjects(), fetchAreas()])
      .then(([t, p, a]) => { setTasks(t); setProjects(p); setAreas(a); setLoaded(true); })
      .catch(() => { setLoaded(true); });
  }, [user?.id]);

  // Realtime: reload when tasks change in any window (dashboard completions, edits)
  useEffect(() => {
    if (!user) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel("pulse-tasks")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          fetchAllTasks()
            .then(setTasks)
            .catch(() => {});
        }, 500);
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Idle polling (auto only)
  useEffect(() => {
    if (isManual) return;
    const poll = setInterval(async () => {
      const ms = await invoke<number>("get_idle_ms");
      setPaused(ms > IDLE_PAUSE_MS);
    }, IDLE_POLL_MS);
    return () => clearInterval(poll);
  }, [isManual]);

  // Countdown (auto only)
  useEffect(() => {
    if (isManual || paused) return;
    const tick = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { getCurrentWebviewWindow().close().catch(() => {}); return 0; }
        return s - 1;
      });
    }, 1_000);
    return () => clearInterval(tick);
  }, [isManual, paused]);

  function dismiss() { getCurrentWebviewWindow().close().catch(() => {}); }

  function snooze() {
    localStorage.setItem("jot_reminder_snoozed_until", new Date(Date.now() + 3_600_000).toISOString());
    getCurrentWebviewWindow().close().catch(() => {});
  }

  function togglePin() {
    const next = !pin;
    setPin(next);
    if (next) localStorage.removeItem("jot_reminder_pin");
    else      localStorage.setItem("jot_reminder_pin", "false");
  }

  // Re-read hidden areas when Dashboard changes them (storage event fires cross-window)
  const [hiddenAreaIds, setHiddenAreaIds] = useState(loadHiddenAreas);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "jot_hidden_areas") setHiddenAreaIds(loadHiddenAreas());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────────
  const visibleTasks = useMemo(
    () => filterVisibleTasks(tasks, projects, hiddenAreaIds),
    [tasks, projects, hiddenAreaIds],
  );

  const today    = new Date().toISOString().slice(0, 10);
  const todayT   = visibleTasks.filter((t) => t.due_date === today);
  const overdueT = visibleTasks.filter((t) => t.due_date && t.due_date < today);
  const upcomingT= visibleTasks.filter((t) => t.due_date && t.due_date > today);
  const pulseCount = todayT.length + overdueT.length;

  const progress   = loaded ? secondsLeft / duration.current : 1;
  const urgent     = loaded && !paused && secondsLeft <= PULSE_THRESHOLD;
  const color      = paused ? "var(--border-default)" : barColor(progress);
  const isEmpty    = todayT.length === 0 && overdueT.length === 0 && upcomingT.length === 0;
  const pulseStyle: React.CSSProperties = urgent ? { animation: "jot-pulse 0.7s ease-in-out infinite" } : {};

  useEffect(() => {
    if (isManual || !loaded) return;
    const previous = previousPulseCount.current;
    previousPulseCount.current = pulseCount;

    if (previous === null) {
      if (isEmpty) {
        duration.current = EMPTY_AUTO_DURATION;
        setSecondsLeft(EMPTY_AUTO_DURATION);
      }
      return;
    }

    if (previous > 0 && pulseCount === 0) {
      duration.current = CLEARED_DURATION;
      setSecondsLeft(CLEARED_DURATION);
    }
  }, [isManual, loaded, pulseCount, isEmpty]);

  const isDark = getResolvedTheme(loadThemePreference()) === "dark";
  const shellAlpha = 0.12 + opacity * 0.68;
  const surfaceAlpha = 0.18 + opacity * 0.72;
  const shellBg = isDark ? `rgba(29,31,28,${shellAlpha})` : `rgba(244,245,241,${shellAlpha})`;
  const surfaceBg = isDark ? `rgba(37,40,36,${surfaceAlpha})` : `rgba(255,255,255,${surfaceAlpha})`;
  const surfaceBorder = isDark ? "rgba(255,255,255,0.08)" : "#d8dccc";
  const shellShadow = isDark ? "0 18px 42px rgba(0,0,0,0.42)" : "0 10px 28px rgba(0,0,0,0.16)";

  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        padding: 8,
        boxSizing: "border-box",
        background: "transparent",
        fontFamily: "inherit",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          background: shellBg,
          border: `1px solid ${surfaceBorder}`,
          borderRadius: 10,
          boxShadow: shellShadow,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
      {/* Header — drag region */}
      <div
        data-tauri-drag-region
        style={{
          display: "flex", alignItems: "center", gap: 7,
          padding: "8px 10px",
          borderBottom: `1px solid ${surfaceBorder}`,
          flexShrink: 0, userSelect: "none",
          background: surfaceBg,
        }}
      >
        {/* App icon */}
        <img src="/icon.png" alt="Jot" style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0 }} />

        {/* Title */}
        <span data-tauri-drag-region style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", flex: 1, letterSpacing: "-0.01em" }}>
          Today's Pulse
        </span>

        {/* Date — compact */}
        <span data-tauri-drag-region style={{ fontSize: 10, color: "var(--text-tertiary)", flexShrink: 0 }}>
          {new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}
        </span>

        <button
          onClick={dismiss}
          style={{ fontSize: 15, lineHeight: 1, color: "var(--text-tertiary)", padding: "0 2px", cursor: "pointer", flexShrink: 0, zIndex: 1 }}
        >
          ×
        </button>
      </div>

      {/* Task sections */}
      <div style={{ flex: 1, overflowY: "auto", background: surfaceBg }}>
        {!loaded ? (
          <LoadingPulse />
        ) : isEmpty ? (
          !isManual ? (
            <div style={{ padding: "14px 12px 16px", textAlign: "center" }}>
              <img
                src={relax.image}
                alt=""
                style={{
                  width: "100%",
                  height: 150,
                  objectFit: "cover",
                  borderRadius: "var(--radius-md)",
                  marginBottom: 10,
                }}
              />
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
                All clear
              </div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.45 }}>
                {relax.quote}
              </div>
            </div>
          ) : (
            <div style={{ padding: "18px 12px", fontSize: 12, color: "var(--text-tertiary)", textAlign: "center" }}>
            All clear — nothing due today.
            </div>
          )
        ) : (
          <>
            <div style={{ padding: "10px 12px 8px", borderBottom: `1px solid ${surfaceBorder}` }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>
                Morning summary
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.45 }}>
                Today&apos;s focus across overdue and due-today tasks.
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap" }}>
                <span style={{
                  padding: "4px 8px",
                  borderRadius: 999,
                  background: "var(--accent-light)",
                  color: "var(--accent)",
                  fontSize: 11,
                  fontWeight: 700,
                }}>
                  Due today {todayT.length}
                </span>
                <span style={{
                  padding: "4px 8px",
                  borderRadius: 999,
                  background: "rgba(217,119,6,0.12)",
                  color: "var(--priority-medium)",
                  fontSize: 11,
                  fontWeight: 700,
                }}>
                  Overdue {overdueT.length}
                </span>
                <span style={{
                  padding: "4px 8px",
                  borderRadius: 999,
                  background: "var(--bg-secondary)",
                  color: "var(--text-secondary)",
                  fontSize: 11,
                  fontWeight: 700,
                }}>
                  Upcoming {upcomingT.length}
                </span>
              </div>
            </div>
            <Section label="Today"    color="var(--accent)"         tasks={todayT}    projects={projects} areas={areas} onCompleted={(id) => setTasks((prev) => prev.filter((t) => t.id !== id))} />
            <Section label="Overdue"  color="var(--priority-high)"  tasks={overdueT}  projects={projects} areas={areas} divider={todayT.length > 0} onCompleted={(id) => setTasks((prev) => prev.filter((t) => t.id !== id))} />
            <Section label="Upcoming" color="var(--text-secondary)"  tasks={upcomingT} projects={projects} areas={areas} divider={todayT.length + overdueT.length > 0} onCompleted={(id) => setTasks((prev) => prev.filter((t) => t.id !== id))} />
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{ flexShrink: 0, borderTop: `1px solid ${surfaceBorder}`, padding: "7px 12px", background: surfaceBg }}>
        {/* Always-on-top row */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)", flex: 1 }}>Always on top</span>
          <Toggle on={pin} onToggle={togglePin} />
        </div>
        {/* Open on start row */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)", flex: 1 }}>Open on start</span>
          <Toggle on={onStart} onToggle={() => {
            const next = !onStart;
            setOnStart(next);
            if (next) localStorage.setItem("jot_reminder_on_start", "true");
            else      localStorage.removeItem("jot_reminder_on_start");
          }} />
        </div>
        {/* Opacity row */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)", flex: 1 }}>Opacity</span>
            <input
              type="range" min={0.3} max={1} step={0.05}
              value={opacity}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setOpacity(v);
                localStorage.setItem("jot_reminder_opacity", String(v));
              }}
              style={{ width: 70, cursor: "pointer", accentColor: "var(--accent)" }}
            />
            <span style={{ fontSize: 10, color: "var(--text-tertiary)", width: 26, textAlign: "right" }}>
              {Math.round(opacity * 100)}%
            </span>
          </div>

        {isManual ? (
          <button
            onClick={dismiss}
            style={{
              width: "100%", fontSize: 12, padding: "5px 0",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-default)",
              background: "var(--bg-secondary)",
              color: "var(--text-secondary)", cursor: "pointer",
            }}
          >
            Close
          </button>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <button
                onClick={snooze}
                style={{
                  fontSize: 11, padding: "3px 9px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-default)",
                  background: "var(--bg-secondary)",
                  color: "var(--text-secondary)", cursor: "pointer", flexShrink: 0,
                }}
              >
                Snooze 1h
              </button>
              <span style={{
                fontSize: 11, marginLeft: "auto", fontVariantNumeric: "tabular-nums",
                color: paused ? "var(--text-tertiary)" : urgent ? barColor(0) : "var(--text-secondary)",
                ...pulseStyle,
              }}>
                {paused ? "Waiting…" : fmtCountdown(secondsLeft)}
              </span>
            </div>

            <div style={{ width: "100%", height: 3, borderRadius: 2, background: "var(--bg-tertiary)", overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${progress * 100}%`,
                background: color,
                transition: paused ? "none" : "width 1s linear, background 2s ease",
                borderRadius: 2, ...pulseStyle,
              }} />
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  );
}
