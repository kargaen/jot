import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { UserAttentionType, availableMonitors, type Monitor } from "@tauri-apps/api/window";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import type { Project, TaskWithTags } from "../models/shared";
import { filterVisibleTasks } from "../models/tasks/taskVisibility";
import { getResolvedTheme, loadThemePreference } from "../utils/presentation/theme";
import { loadHiddenAreas } from "../utils/preferences/hiddenAreas";
import { randomRelax } from "../utils/presentation/relax";

const WINDOW_WIDTH = 250;
const MARGIN_X = 16;
const IDLE_PAUSE_MS = 30_000;
const IDLE_POLL_MS = 3_000;
const PULSE_THRESHOLD = 10;
const FALLBACK_WINDOW_HEIGHT = 480;
const EMPTY_AUTO_DURATION = 30;
const CLEARED_DURATION = 10;

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

function barColor(progress: number): string {
  return `hsl(${Math.round(progress * 120)}, 72%, 42%)`;
}

interface Options {
  userPresent: boolean;
  isManual: boolean;
  loaded: boolean;
  tasks: TaskWithTags[];
  projects: Project[];
}

export function useReminderWindowShell({ userPresent, isManual, loaded, tasks, projects }: Options) {
  const [pin, setPin] = useState(loadPin);
  const [onStart, setOnStart] = useState(loadOnStart);
  const [opacity, setOpacity] = useState(loadOpacity);
  const duration = useRef(loadDuration());
  const previousPulseCount = useRef<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(duration.current);
  const [paused, setPaused] = useState(false);
  const [relax] = useState(randomRelax);
  const [hiddenAreaIds, setHiddenAreaIds] = useState(loadHiddenAreas);

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

  useEffect(() => {
    if (userPresent) return;
    getCurrentWebviewWindow().close().catch(() => {});
  }, [userPresent]);

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

  useEffect(() => {
    const win = getCurrentWebviewWindow();
    win.setAlwaysOnTop(pin).catch(() => {});
    win.setSkipTaskbar(pin).catch(() => {});
    if (!pin) {
      setTimeout(() => win.requestUserAttention(UserAttentionType.Informational).catch(() => {}), 400);
    }
  }, [pin]);

  useEffect(() => {
    if (isManual) return;
    let inflight = false;
    const poll = setInterval(() => {
      if (inflight) return;
      inflight = true;
      invoke<number>("get_idle_ms")
        .then((ms) => { setPaused(ms > IDLE_PAUSE_MS); })
        .catch(() => {})
        .finally(() => { inflight = false; });
    }, IDLE_POLL_MS);
    return () => clearInterval(poll);
  }, [isManual]);

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

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "jot_hidden_areas") setHiddenAreaIds(loadHiddenAreas());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (isManual || !loaded) return;
    const visibleTasks = filterVisibleTasks(tasks, projects, hiddenAreaIds);
    const today = new Date().toISOString().slice(0, 10);
    const todayCount = visibleTasks.filter((task) => task.due_date === today).length;
    const overdueCount = visibleTasks.filter((task) => task.due_date && task.due_date < today).length;
    const upcomingCount = visibleTasks.filter((task) => task.due_date && task.due_date > today).length;
    const nextPulseCount = todayCount + overdueCount;
    const nextIsEmpty = todayCount === 0 && overdueCount === 0 && upcomingCount === 0;
    const previous = previousPulseCount.current;
    previousPulseCount.current = nextPulseCount;

    if (previous === null) {
      if (nextIsEmpty) {
        duration.current = EMPTY_AUTO_DURATION;
        setSecondsLeft(EMPTY_AUTO_DURATION);
      }
      return;
    }

    if (previous > 0 && nextPulseCount === 0) {
      duration.current = CLEARED_DURATION;
      setSecondsLeft(CLEARED_DURATION);
    }
  }, [hiddenAreaIds, isManual, loaded, projects, tasks]);

  function dismiss() { getCurrentWebviewWindow().close().catch(() => {}); }

  function snooze() {
    localStorage.setItem("jot_reminder_snoozed_until", new Date(Date.now() + 3_600_000).toISOString());
    getCurrentWebviewWindow().close().catch(() => {});
  }

  function togglePin() {
    const next = !pin;
    setPin(next);
    if (next) localStorage.removeItem("jot_reminder_pin");
    else localStorage.setItem("jot_reminder_pin", "false");
  }

  function toggleOnStart() {
    const next = !onStart;
    setOnStart(next);
    if (next) localStorage.setItem("jot_reminder_on_start", "true");
    else localStorage.removeItem("jot_reminder_on_start");
  }

  function setOpacityPreference(next: number) {
    setOpacity(next);
    localStorage.setItem("jot_reminder_opacity", String(next));
  }

  const progress = loaded ? secondsLeft / duration.current : 1;
  const urgent = loaded && !paused && secondsLeft <= PULSE_THRESHOLD;
  const color = paused ? "var(--border-default)" : barColor(progress);
  const pulseStyle: React.CSSProperties = urgent ? { animation: "jot-pulse 0.7s ease-in-out infinite" } : {};
  const isDark = getResolvedTheme(loadThemePreference()) === "dark";
  const shellAlpha = 0.12 + opacity * 0.68;
  const surfaceAlpha = 0.18 + opacity * 0.72;

  return {
    pin,
    onStart,
    opacity,
    secondsLeft,
    paused,
    relax,
    hiddenAreaIds,
    progress,
    urgent,
    color,
    pulseStyle,
    shellBg: isDark ? `rgba(29,31,28,${shellAlpha})` : `rgba(244,245,241,${shellAlpha})`,
    surfaceBg: isDark ? `rgba(37,40,36,${surfaceAlpha})` : `rgba(255,255,255,${surfaceAlpha})`,
    surfaceBorder: isDark ? "rgba(255,255,255,0.08)" : "#d8dccc",
    shellShadow: isDark ? "0 18px 42px rgba(0,0,0,0.42)" : "0 10px 28px rgba(0,0,0,0.16)",
    dismiss,
    snooze,
    togglePin,
    toggleOnStart,
    setOpacityPreference,
  };
}
