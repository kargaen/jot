import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { spaceColor, projectColor } from "../lib/colors";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { WebviewWindow, getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import Toggle from "../components/Toggle";
import Preferences from "./Preferences";
import {
  fetchAreas,
  fetchProjects,
  fetchTags,
  fetchAllTasks,
  fetchLogbookTasks,
  fetchCompletionDates,
  completeTask,
  deleteProject,
  createArea,
} from "../lib/supabase";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import TaskRow from "../components/TaskRow";
import LogbookRow from "../components/LogbookRow";
import CreateTask from "../components/CreateTask";
import CompletionHeatmap from "../components/CompletionHeatmap";
import { logger } from "../lib/logger";
import type { Area, Project, Tag, TaskWithTags } from "../types";

type View = "overdue" | "today" | "inbox" | "upcoming" | "project" | "logbook";

function sortTasks(tasks: TaskWithTags[], _projects: Project[]): TaskWithTags[] {
  return [...tasks].sort((a, b) => {
    // 1. Due date ascending; null sorts last
    const da = a.due_date ?? "9999-99-99";
    const db = b.due_date ?? "9999-99-99";
    if (da !== db) return da < db ? -1 : 1;
    // 2. Created at ascending (oldest first)
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
    // 3. Title as tiebreaker
    return a.title.toLowerCase() < b.title.toLowerCase() ? -1 : 1;
  });
}

async function openTaskWindow(task: TaskWithTags) {
  const label = `task-${task.id}`;
  logger.info("dashboard", `openTaskWindow: "${task.title}" [${task.id}]`);
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.setFocus();
    return;
  }
  const win = new WebviewWindow(label, {
    url: window.location.origin,
    title: task.title,
    width: 700,
    height: 720,
    decorations: true,
    resizable: true,
    center: true,
  });
  win.once("tauri://error", (e) => {
    logger.error("dashboard", `openTaskWindow: failed to create window`, e);
  });
}

// ─── Auth screen ──────────────────────────────────────────────────────────────

function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const err = isSignUp
      ? await signUp(email, password)
      : await signIn(email, password, rememberMe);
    if (err) setError(err);
    setLoading(false);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-secondary)",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: 360,
          background: "var(--bg-primary)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border-default)",
          padding: 32,
          boxShadow: "var(--shadow-md)",
        }}
      >
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>
            Jot
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
            {isSignUp ? "Create an account" : "Sign in to continue"}
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <FormInput label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
          <FormInput label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" />
        </div>

        {!isSignUp && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, cursor: "pointer", userSelect: "none" }}>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              style={{ width: 15, height: 15, cursor: "pointer", accentColor: "var(--accent)" }}
            />
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Keep me signed in</span>
          </label>
        )}

        {error && (
          <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: "var(--radius-sm)", background: "rgba(220,38,38,0.08)", color: "#dc2626", fontSize: 13 }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{ marginTop: 20, width: "100%", padding: "10px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-md)", fontSize: 14, fontWeight: 500, cursor: loading ? "wait" : "pointer", opacity: loading ? 0.7 : 1 }}
        >
          {loading ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
        </button>

        <button
          type="button"
          onClick={() => setIsSignUp((v) => !v)}
          style={{ marginTop: 12, width: "100%", fontSize: 13, color: "var(--text-secondary)", padding: "4px" }}
        >
          {isSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
        </button>
      </form>
    </div>
  );
}

// ─── Task list ────────────────────────────────────────────────────────────────

function TaskList({
  tasks,
  projects,
  onComplete,
  onOpen,
}: {
  tasks: TaskWithTags[];
  projects: Project[];
  onComplete: (id: string) => void;
  onOpen: (task: TaskWithTags) => void;
}) {
  if (tasks.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          projects={projects}
          onComplete={() => onComplete(task.id)}
          onClick={() => onOpen(task)}
        />
      ))}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

const HIDDEN_AREAS_KEY = "jot_hidden_areas";
const DEFAULT_AREA_KEY = "jot_default_area";

function loadHiddenAreas(): string[] {
  try { return JSON.parse(localStorage.getItem(HIDDEN_AREAS_KEY) ?? "[]"); }
  catch { return []; }
}

function saveHiddenAreas(ids: string[]) {
  localStorage.setItem(HIDDEN_AREAS_KEY, JSON.stringify(ids));
}

function loadDefaultAreaId(): string | null {
  return localStorage.getItem(DEFAULT_AREA_KEY);
}

function saveDefaultAreaId(id: string | null) {
  if (id) localStorage.setItem(DEFAULT_AREA_KEY, id);
  else localStorage.removeItem(DEFAULT_AREA_KEY);
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [view, setView] = useState<View>("today");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [allTasks, setAllTasks] = useState<TaskWithTags[]>([]);
  const [logbookTasks, setLogbookTasks] = useState<TaskWithTags[]>([]);
  const [heatmapDates, setHeatmapDates] = useState<string[]>([]);
  const [hiddenAreaIds, setHiddenAreaIds] = useState<string[]>(loadHiddenAreas);
  const [defaultAreaId, setDefaultAreaId] = useState<string | null>(loadDefaultAreaId);
  const [selectedInboxAreaId, setSelectedInboxAreaId] = useState<string | null>(null);
  const [showPrefs, setShowPrefs] = useState(false);
  const [compact, setCompact] = useState(() => localStorage.getItem("jot_compact") === "1");
  const [showSpacePicker, setShowSpacePicker] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(() => localStorage.getItem("jot_pin") === "1");
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; projectId: string } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingName, setOnboardingName] = useState("Personal");
  const [updateStatus, setUpdateStatus] = useState<"idle" | "available" | "downloading" | "ready">("idle");
  const [updateVersion, setUpdateVersion] = useState("");
  const [updateProgress, setUpdateProgress] = useState(0);
  const updateRef = useRef<Awaited<ReturnType<typeof check>> | null>(null);

  const today = new Date().toISOString().split("T")[0];
  const userId = user?.id ?? null;

  const loadData = useCallback(async () => {
    logger.debug("dashboard", "loadData: fetching…");
    try {
      const [a, p, t, tasks] = await Promise.all([
        fetchAreas(),
        fetchProjects(),
        fetchTags(),
        fetchAllTasks(),
      ]);
      setAreas(a);
      if (a.length === 0 && !localStorage.getItem("jot_onboarding_done")) {
        setShowOnboarding(true);
      }
      if (!loadDefaultAreaId() && a.length > 0) {
        setDefaultAreaId(a[0].id);
        saveDefaultAreaId(a[0].id);
      }
      setProjects(p);
      setTags(t);
      setAllTasks(tasks);
      logger.info("dashboard", `loadData: ${tasks.length} tasks, ${p.length} projects`);
    } catch (err) {
      logger.error("dashboard", "loadData failed", err instanceof Error ? err.message : err);
    }
  }, []);

  useEffect(() => {
    if (userId) loadData();
  }, [userId, loadData]);

  // Load logbook + heatmap lazily only when that view is active
  useEffect(() => {
    if (!userId || view !== "logbook") return;
    const since = new Date();
    since.setDate(since.getDate() - 16 * 7);
    Promise.all([
      fetchLogbookTasks(),
      fetchCompletionDates(since.toISOString()),
    ]).then(([tasks, dates]) => {
      setLogbookTasks(tasks);
      setHeatmapDates(dates);
    }).catch((err) => logger.error("dashboard", "fetchLogbookTasks failed", err instanceof Error ? err.message : err));
  }, [userId, view]);

  // Realtime: reload allTasks on any change
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("tasks-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, loadData]);

  // Restore window geometry on startup
  useEffect(() => {
    const win = getCurrentWebviewWindow();
    if (compact) {
      win.setResizable(false).catch(() => {});
      win.setSize(new LogicalSize(380, 680)).catch(() => {});
      return;
    }
    const wasMaximized = localStorage.getItem("jot_dashboard_maximized") === "true";
    const savedW = localStorage.getItem("jot_dashboard_width");
    const savedH = localStorage.getItem("jot_dashboard_height");
    const savedX = localStorage.getItem("jot_dashboard_x");
    const savedY = localStorage.getItem("jot_dashboard_y");
    if (savedW && savedH) win.setSize(new LogicalSize(parseInt(savedW, 10), parseInt(savedH, 10))).catch(() => {});
    if (savedX && savedY) win.setPosition(new LogicalPosition(parseInt(savedX, 10), parseInt(savedY, 10))).catch(() => {});
    if (wasMaximized) win.maximize().catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist dashboard size, position, and maximized state
  useEffect(() => {
    if (compact) return;
    let prevX = 0, prevY = 0, prevW = 0, prevH = 0;
    const save = () => {
      const x = window.screenX, y = window.screenY;
      const w = window.outerWidth, h = window.outerHeight;
      if (x !== prevX || y !== prevY) {
        localStorage.setItem("jot_dashboard_x", String(x));
        localStorage.setItem("jot_dashboard_y", String(y));
        prevX = x; prevY = y;
      }
      if (w !== prevW || h !== prevH) {
        localStorage.setItem("jot_dashboard_width", String(w));
        localStorage.setItem("jot_dashboard_height", String(h));
        getCurrentWindow().isMaximized().then((m) => {
          localStorage.setItem("jot_dashboard_maximized", String(m));
        }).catch(() => {});
        prevW = w; prevH = h;
      }
    };
    const id = setInterval(save, 500);
    return () => clearInterval(id);
  }, [compact]);

  // Keep always-on-top in sync — compact mode forces it on
  useEffect(() => {
    getCurrentWebviewWindow().setAlwaysOnTop(alwaysOnTop || compact).catch(() => {});
  }, [alwaysOnTop, compact]);

  // ── Auto-update check ─────────────────────────────────────────────────────
  useEffect(() => {
    check().then((update) => {
      if (update) {
        updateRef.current = update;
        setUpdateVersion(update.version);
        setUpdateStatus("available");
      }
    }).catch(() => {});
  }, []);

  async function handleUpdate() {
    const update = updateRef.current;
    if (!update) return;
    setUpdateStatus("downloading");
    let totalBytes = 0;
    await update.downloadAndInstall((event) => {
      if (event.event === "Started" && event.data.contentLength) {
        totalBytes = event.data.contentLength;
      } else if (event.event === "Progress" && totalBytes > 0) {
        setUpdateProgress((prev) => Math.min(prev + event.data.chunkLength / totalBytes * 100, 100));
      } else if (event.event === "Finished") {
        setUpdateStatus("ready");
      }
    });
    await relaunch();
  }

  // ── Reminder scheduler ────────────────────────────────────────────────────

  async function openReminderWindow(manual = false) {
    const label = manual ? "reminder-manual" : "reminder";
    const existing = await WebviewWindow.getByLabel(label);
    if (existing) { await existing.show(); await existing.setFocus(); return; }
    const savedW = parseInt(localStorage.getItem("jot_reminder_width") ?? "250", 10);
    const savedH = parseInt(localStorage.getItem("jot_reminder_height") ?? "480", 10);
    new WebviewWindow(label, {
      url: window.location.origin,
      title: "Jot — Today's Pulse",
      width: savedW,
      height: savedH,
      decorations: false,
      alwaysOnTop: true,
      resizable: true,
      skipTaskbar: false,
      visible: false,
      transparent: true,
    });
  }

  function shouldShowReminder(): boolean {
    if (localStorage.getItem("jot_reminder_enabled") === "false") return false;
    const snoozedUntil = localStorage.getItem("jot_reminder_snoozed_until");
    if (snoozedUntil && new Date(snoozedUntil) > new Date()) return false;
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem("jot_last_reminder_date") === today) return false;
    const reminderTime = localStorage.getItem("jot_reminder_time") ?? "08:00";
    const [rh, rm] = reminderTime.split(":").map(Number);
    const now = new Date();
    return now.getHours() > rh || (now.getHours() === rh && now.getMinutes() >= rm);
  }

  // On startup: scheduled reminder OR "open on start" pulse
  useEffect(() => {
    if (!userId) return;
    const t = setTimeout(() => {
      if (shouldShowReminder()) {
        localStorage.setItem("jot_last_reminder_date", new Date().toISOString().slice(0, 10));
        openReminderWindow(false);
      } else if (localStorage.getItem("jot_reminder_on_start") === "true") {
        openReminderWindow(true);
      }
    }, 2_000);
    return () => clearTimeout(t);
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Per-minute tick: fires at the exact configured time + handles snooze expiry
  useEffect(() => {
    const tick = () => {
      if (localStorage.getItem("jot_reminder_enabled") === "false") return;
      const now = new Date();
      const today = now.toISOString().slice(0, 10);

      // Snooze expiry
      const snoozedUntil = localStorage.getItem("jot_reminder_snoozed_until");
      if (snoozedUntil && new Date(snoozedUntil) <= now) {
        localStorage.removeItem("jot_reminder_snoozed_until");
        openReminderWindow();
        return;
      }

      // Time-based trigger (exact minute match)
      if (snoozedUntil) return;
      const reminderTime = localStorage.getItem("jot_reminder_time") ?? "08:00";
      const timeNow = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      if (timeNow === reminderTime && localStorage.getItem("jot_last_reminder_date") !== today) {
        localStorage.setItem("jot_last_reminder_date", today);
        openReminderWindow();
      }
    };
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // "Check the Pulse" tray menu item or QuickCapture → open reminder on demand
  useEffect(() => {
    const unlisten = listen("show-reminder", () => openReminderWindow(true));
    return () => { unlisten.then((f) => f()); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // QuickCapture navigation actions → switch view
  useEffect(() => {
    const unlisten = listen<{ view: string }>("navigate", (e) => {
      const v = e.payload.view;
      if (v === "today" || v === "upcoming" || v === "overdue" || v === "inbox" || v === "logbook") {
        setView(v);
      }
    });
    return () => { unlisten.then((f) => f()); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleAlwaysOnTop() {
    const next = !alwaysOnTop;
    setAlwaysOnTop(next);
    if (next) localStorage.setItem("jot_pin", "1");
    else localStorage.removeItem("jot_pin");
  }

  async function toggleCompact() {
    const next = !compact;
    setCompact(next);
    setShowSpacePicker(false);
    if (next) {
      localStorage.setItem("jot_compact", "1");
      // Auto-pin when entering compact mode
      if (!alwaysOnTop) { setAlwaysOnTop(true); localStorage.setItem("jot_pin", "1"); }
    } else {
      localStorage.removeItem("jot_compact");
    }
    const win = getCurrentWebviewWindow();
    if (next) {
      await win.setResizable(false);
      await win.setSize(new LogicalSize(380, 680));
    } else {
      await win.setResizable(true);
      const savedW = parseInt(localStorage.getItem("jot_dashboard_width") ?? "1100", 10);
      const savedH = parseInt(localStorage.getItem("jot_dashboard_height") ?? "780", 10);
      await win.setSize(new LogicalSize(savedW, savedH));
      await win.center();
    }
  }

  function handleHiddenChange(ids: string[]) {
    setHiddenAreaIds(ids);
    saveHiddenAreas(ids);
    // If currently selected project is in a now-hidden area, deselect it
    if (selectedProject) {
      const area = areas.find((a) => a.id === selectedProject.id);
      if (area && ids.includes(area.id)) setSelectedProject(null);
    }
  }

  // ─── Derived views (all in memory, no extra fetches) ──────────────────────

  // Projects and tasks filtered by visible areas
  const visibleProjects = useMemo(
    () => projects.filter((p) => !p.area_id || !hiddenAreaIds.includes(p.area_id)),
    [projects, hiddenAreaIds],
  );

  const visibleProjectIds = useMemo(
    () => new Set(visibleProjects.map((p) => p.id)),
    [visibleProjects],
  );

  // Tasks scoped to visible areas (inbox tasks always shown — they have no project/area)
  const visibleTasks = useMemo(
    () => allTasks.filter((t) => !t.project_id || visibleProjectIds.has(t.project_id)),
    [allTasks, visibleProjectIds],
  );

  const overdueTask = useMemo(
    () => visibleTasks.filter((t) => t.due_date && t.due_date < today),
    [visibleTasks, today],
  );

  const todayTasks = useMemo(
    () => visibleTasks.filter((t) => t.due_date === today || t.scheduled_date === today),
    [visibleTasks, today],
  );

  const inboxTasks = useMemo(
    () => visibleTasks.filter((t) => !t.project_id),
    [visibleTasks],
  );

  const upcomingTasks = useMemo(
    () => visibleTasks
      .filter((t) => {
        const date = t.scheduled_date ?? t.due_date;
        return date && date > today;
      })
      .sort((a, b) => {
        const da = a.scheduled_date ?? a.due_date ?? "";
        const db = b.scheduled_date ?? b.due_date ?? "";
        return da < db ? -1 : da > db ? 1 : 0;
      }),
    [visibleTasks, today],
  );

  const projectTasks = useMemo(
    () => selectedProject ? visibleTasks.filter((t) => t.project_id === selectedProject.id) : [],
    [visibleTasks, selectedProject],
  );

  // Urgent = overdue or due today — used for sidebar attention badges
  const areaUrgentCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of visibleTasks) {
      if (!t.due_date || t.due_date > today) continue;
      const areaId = t.area_id ?? (t.project_id ? projects.find((p) => p.id === t.project_id)?.area_id : null);
      if (areaId) map.set(areaId, (map.get(areaId) ?? 0) + 1);
    }
    return map;
  }, [visibleTasks, projects, today]);

  const projectUrgentCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of visibleTasks) {
      if (t.project_id && t.due_date && t.due_date <= today)
        map.set(t.project_id, (map.get(t.project_id) ?? 0) + 1);
    }
    return map;
  }, [visibleTasks, today]);

  const displayTasks = useMemo((): TaskWithTags[] => {
    const raw = (() => {
      switch (view) {
        case "overdue":  return overdueTask;
        case "today":    return todayTasks;
        case "inbox":    return selectedInboxAreaId
          ? visibleTasks.filter((t) =>
              t.area_id === selectedInboxAreaId ||
              (t.project_id && projects.find((p) => p.id === t.project_id)?.area_id === selectedInboxAreaId)
            )
          : inboxTasks;
        case "upcoming": return upcomingTasks;
        case "project":  return projectTasks;
        case "logbook":  return logbookTasks;
      }
    })();
    return view === "logbook" ? raw : sortTasks(raw, projects);
  }, [view, overdueTask, todayTasks, inboxTasks, upcomingTasks, projectTasks, logbookTasks, projects, selectedInboxAreaId]);

  // ──────────────────────────────────────────────────────────────────────────

  function handleComplete(taskId: string) {
    setAllTasks((prev) => prev.filter((t) => t.id !== taskId));
    completeTask(taskId).catch((err) =>
      logger.error("dashboard", "completeTask failed", err instanceof Error ? err.message : err),
    );
  }

  async function handleOnboardingCreate() {
    if (!onboardingName.trim()) return;
    const area = await createArea(onboardingName.trim());
    setDefaultAreaId(area.id);
    saveDefaultAreaId(area.id);
    localStorage.setItem("jot_onboarding_done", "1");
    setShowOnboarding(false);
    loadData();
  }

  async function handleDeleteProject(id: string) {
    if (!confirm("Delete this project? Its tasks will move to the inbox.")) return;
    await deleteProject(id);
    if (selectedProject?.id === id) { setSelectedProject(null); setView("inbox"); }
    loadData();
  }

  const viewTitle =
    view === "overdue"  ? "Overdue" :
    view === "today"    ? "Today" :
    view === "inbox"    ? (areas.find((a) => a.id === selectedInboxAreaId)?.name ?? "Inbox") :
    view === "upcoming" ? "Upcoming" :
    view === "logbook"  ? "Logbook" :
    view === "project" && selectedProject ? selectedProject.name : "";

  if (!user) return <AuthScreen />;

  // ── Compact / mobile layout ────────────────────────────────────────────────
  if (compact) return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg-secondary)", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "var(--bg-primary)", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
        {view === "inbox" && selectedInboxAreaId && (
          <span style={{ width: 8, height: 8, borderRadius: 3, background: spaceColor(selectedInboxAreaId), flexShrink: 0 }} />
        )}
        <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: view === "inbox" && selectedInboxAreaId ? spaceColor(selectedInboxAreaId) : "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {viewTitle}
        </span>
        <button onClick={() => setShowPrefs(true)} style={{ fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px", cursor: "pointer" }}>⚙</button>
        <Toggle on={alwaysOnTop || compact} onToggle={toggleAlwaysOnTop} />
        <Toggle on={compact} onToggle={toggleCompact} />
      </div>

      {/* Space + project picker sheet */}
      {showSpacePicker && (
        <>
          <div onClick={() => setShowSpacePicker(false)} style={{ position: "fixed", inset: 0, zIndex: 49 }} />
          <div style={{ position: "fixed", bottom: 57, left: 0, right: 0, zIndex: 50, background: "var(--bg-primary)", borderTop: "1px solid var(--border-default)", boxShadow: "0 -4px 20px rgba(0,0,0,0.15)", maxHeight: "60vh", overflowY: "auto" }}>
            {areas.filter((a) => !hiddenAreaIds.includes(a.id)).map((area) => (
              <div key={area.id}>
                <button
                  onClick={() => { setView("inbox"); setSelectedInboxAreaId(area.id); setSelectedProject(null); setShowSpacePicker(false); }}
                  style={{ width: "100%", textAlign: "left", padding: "12px 20px", display: "flex", alignItems: "center", gap: 12, fontSize: 14, color: view === "inbox" && selectedInboxAreaId === area.id && !selectedProject ? spaceColor(area.id) : "var(--text-primary)", background: "transparent", fontWeight: view === "inbox" && selectedInboxAreaId === area.id && !selectedProject ? 600 : 400 }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: spaceColor(area.id), flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{area.name}</span>
                  {(areaUrgentCounts.get(area.id) ?? 0) > 0 && (
                    <span style={{ fontSize: 11, color: "#ef4444", background: "rgba(239,68,68,0.12)", borderRadius: 10, padding: "1px 7px", fontWeight: 600 }}>{areaUrgentCounts.get(area.id)}</span>
                  )}
                </button>
                {visibleProjects.filter((p) => p.area_id === area.id).map((project) => (
                  <button
                    key={project.id}
                    onClick={() => { setSelectedProject(project); setView("project"); setShowSpacePicker(false); }}
                    onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, projectId: project.id }); }}
                    style={{ width: "100%", textAlign: "left", padding: "10px 20px 10px 44px", display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: selectedProject?.id === project.id ? projectColor(project.id) : "var(--text-secondary)", background: "transparent", fontWeight: selectedProject?.id === project.id ? 600 : 400 }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: projectColor(project.id), flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{project.name}</span>
                    {(projectUrgentCounts.get(project.id) ?? 0) > 0 && (
                      <span style={{ fontSize: 11, color: "#ef4444", background: "rgba(239,68,68,0.12)", borderRadius: 10, padding: "1px 7px", fontWeight: 600 }}>{projectUrgentCounts.get(project.id)}</span>
                    )}
                  </button>
                ))}
              </div>
            ))}
            {visibleProjects.filter((p) => !p.area_id).map((project) => (
              <button
                key={project.id}
                onClick={() => { setSelectedProject(project); setView("project"); setShowSpacePicker(false); }}
                onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, projectId: project.id }); }}
                style={{ width: "100%", textAlign: "left", padding: "12px 20px", display: "flex", alignItems: "center", gap: 12, fontSize: 14, color: selectedProject?.id === project.id ? projectColor(project.id) : "var(--text-primary)", background: "transparent" }}
              >
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: projectColor(project.id), flexShrink: 0 }} />
                <span>{project.name}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Update banner (compact) */}
      {updateStatus === "available" && (
        <div style={{
          margin: "0 14px", padding: "8px 12px", borderRadius: "var(--radius-md)",
          background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)",
          display: "flex", alignItems: "center", gap: 8, fontSize: 12,
        }}>
          <span style={{ flex: 1, color: "var(--text-primary)" }}>v{updateVersion} available</span>
          <button onClick={handleUpdate} style={{ padding: "3px 10px", fontSize: 11, fontWeight: 600, borderRadius: "var(--radius-sm)", background: "var(--accent)", color: "#fff", cursor: "pointer" }}>Update</button>
          <button onClick={() => setUpdateStatus("idle")} style={{ fontSize: 11, color: "var(--text-tertiary)", cursor: "pointer" }}>×</button>
        </div>
      )}

      {/* Task list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", minHeight: 0 }}>
        {view !== "logbook" && (
          <div style={{ marginBottom: 12 }}>
            <CreateTask
              projects={projects} allTags={tags}
              projectId={selectedProject?.id ?? null}
              areaId={selectedProject ? null : selectedInboxAreaId ?? defaultAreaId ?? null}
              placeholder="Add task…"
              canCreateProjectsAndTags
              onCreated={() => loadData()}
              onProjectCreated={(p) => setProjects((prev) => [...prev, p])}
              onTagCreated={(t) => setTags((prev) => [...prev, t])}
            />
          </div>
        )}
        {displayTasks.length === 0 ? <EmptyState view={view} /> : view === "logbook" ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {displayTasks.map((task) => (
              <LogbookRow key={task.id} task={task} projects={projects} areas={areas} onClick={() => openTaskWindow(task)} />
            ))}
          </div>
        ) : (
          <TaskList tasks={displayTasks} projects={projects} onComplete={handleComplete} onOpen={openTaskWindow} />
        )}
      </div>

      {/* Logbook heatmap */}
      {view === "logbook" && (
        <div style={{ flexShrink: 0, padding: "0 14px 8px", borderTop: "1px solid var(--border-subtle)", overflowX: "auto" }}>
          <CompletionHeatmap dates={heatmapDates} />
        </div>
      )}

      {/* Bottom navigation */}
      <div style={{ display: "flex", borderTop: "1px solid var(--border-subtle)", background: "var(--bg-primary)", flexShrink: 0 }}>
        {([
          { id: "overdue" as const,  label: "Overdue",  icon: "⚠",  urgent: overdueTask.length },
          { id: "today"  as const,   label: "Today",    icon: "◉",  urgent: todayTasks.length },
          { id: "spaces" as const,   label: "Spaces",   icon: "⬡",  urgent: 0 },
          { id: "upcoming" as const, label: "Upcoming", icon: "→",  urgent: 0 },
          { id: "logbook" as const,  label: "Logbook",  icon: "◎",  urgent: 0 },
        ]).map((tab) => {
          const isActive = tab.id === "spaces"
            ? showSpacePicker
            : (view === tab.id && !selectedProject);
          return (
            <button
              key={tab.id}
              onClick={() => {
                if (tab.id === "spaces") { setShowSpacePicker((v) => !v); return; }
                setShowSpacePicker(false); setView(tab.id); setSelectedProject(null);
              }}
              style={{ flex: 1, padding: "9px 2px 7px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, fontSize: 9, fontWeight: isActive ? 600 : 400, color: isActive ? "var(--accent)" : "var(--text-tertiary)", background: "transparent", cursor: "pointer", position: "relative" }}
            >
              <span style={{ fontSize: 15 }}>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.urgent > 0 && (
                <span style={{ position: "absolute", top: 6, right: "calc(50% - 14px)", fontSize: 8, background: "#ef4444", color: "#fff", borderRadius: 10, padding: "0 4px", fontWeight: 700, lineHeight: "14px" }}>{tab.urgent}</span>
              )}
            </button>
          );
        })}
      </div>

      {showPrefs && (
        <Preferences areas={areas} hiddenAreaIds={hiddenAreaIds} onHiddenChange={handleHiddenChange} onAreasChange={loadData} onClose={() => setShowPrefs(false)} />
      )}

      {/* Project context menu */}
      {ctxMenu && (
        <div
          onClick={() => setCtxMenu(null)}
          style={{ position: "fixed", inset: 0, zIndex: 300 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed", left: ctxMenu.x, top: ctxMenu.y,
              background: "var(--bg-primary)", border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)",
              padding: "4px 0", minWidth: 140, zIndex: 301,
            }}
          >
            <button
              onClick={() => { const id = ctxMenu.projectId; setCtxMenu(null); handleDeleteProject(id); }}
              style={{
                width: "100%", textAlign: "left", padding: "7px 14px", fontSize: 13,
                color: "var(--priority-high)", display: "flex", alignItems: "center", gap: 8,
              }}
            >
              Delete project
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // ── Full desktop layout ────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--bg-secondary)" }}>
      {/* Sidebar */}
      <aside style={{ width: 220, flexShrink: 0, background: "var(--bg-primary)", borderRight: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", padding: "16px 0" }}>
        <div style={{ padding: "0 16px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>Jot</div>
          <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2, letterSpacing: "0.03em" }}>Think it. Jot it. Do it.</div>
        </div>

        <button
          onClick={() => invoke("show_quick_capture").catch(() => {})}
          style={{ margin: "12px 12px 4px", padding: "8px 12px", background: "var(--accent)", color: "#fff", borderRadius: "var(--radius-md)", fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
          New task
          <kbd style={{ marginLeft: "auto", fontSize: 11, background: "rgba(255,255,255,0.2)", borderRadius: 3, padding: "1px 4px", border: "1px solid rgba(255,255,255,0.3)" }}>
            Ctrl+Space
          </kbd>
        </button>

        <nav style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {([
            { id: "inbox",    label: "Inbox",    count: inboxTasks.filter((t) => !t.area_id).length },
            { id: "overdue",  label: "Overdue",  count: overdueTask.length },
            { id: "today",    label: "Today",    count: todayTasks.length },
            { id: "upcoming", label: "Upcoming", count: upcomingTasks.length },
            { id: "logbook",  label: "Logbook",  count: 0 },
          ] as const).map(({ id, label, count }) => (
            <NavItem
              key={id}
              label={label}
              count={count}
              active={view === id && !selectedProject && (id !== "inbox" || !selectedInboxAreaId)}
              onClick={() => { setView(id); setSelectedProject(null); if (id === "inbox") setSelectedInboxAreaId(null); }}
            />
          ))}

          {areas.filter((a) => !hiddenAreaIds.includes(a.id)).length > 0 && <SectionHeader label="Spaces" />}
          {areas.filter((a) => !hiddenAreaIds.includes(a.id)).map((area) => (
            <div key={area.id}>
              <NavItem
                label={area.name}
                urgentCount={areaUrgentCounts.get(area.id) ?? 0}
                dot={spaceColor(area.id)}
                dotSquare
                active={view === "inbox" && selectedInboxAreaId === area.id && !selectedProject}
                onClick={() => { setView("inbox"); setSelectedInboxAreaId(area.id); setSelectedProject(null); }}
              />
              {visibleProjects.filter((p) => p.area_id === area.id).map((project) => (
                <NavItem
                  key={project.id}
                  label={project.name}
                  urgentCount={projectUrgentCounts.get(project.id) ?? 0}
                  indent
                  dot={projectColor(project.id)}
                  active={selectedProject?.id === project.id}
                  onClick={() => { setSelectedProject(project); setView("project"); }}
                  onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, projectId: project.id }); }}
                />
              ))}
            </div>
          ))}

          {visibleProjects.length > 0 && <SectionHeader label="Projects" />}
          {visibleProjects.map((project) => (
            <NavItem
              key={project.id}
              label={project.name}
              urgentCount={projectUrgentCounts.get(project.id) ?? 0}
              dot={projectColor(project.id)}
              active={selectedProject?.id === project.id}
              onClick={() => { setSelectedProject(project); setView("project"); }}
              onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, projectId: project.id }); }}
            />
          ))}
        </nav>

        <div style={{ padding: "12px 12px 0", borderTop: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: 2 }}>
          <button
            onClick={() => setShowPrefs(true)}
            style={{ width: "100%", textAlign: "left", padding: "6px 8px", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text-secondary)", cursor: "pointer" }}
          >
            Preferences
          </button>
          <button
            onClick={() => signOut()}
            style={{ width: "100%", textAlign: "left", padding: "6px 8px", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text-tertiary)", cursor: "pointer" }}
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        <div style={{ padding: "24px 32px 16px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-primary)", flexShrink: 0, zIndex: 10, display: "flex", alignItems: "center", gap: 16 }}>
          {view === "inbox" && selectedInboxAreaId && (
            <span style={{ width: 10, height: 10, borderRadius: 3, background: spaceColor(selectedInboxAreaId), flexShrink: 0 }} />
          )}
          <h1 style={{ fontSize: 22, fontWeight: 600, flex: 1, color: view === "inbox" && selectedInboxAreaId ? spaceColor(selectedInboxAreaId) : "var(--text-primary)" }}>{viewTitle}</h1>
          {selectedProject && (
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: projectColor(selectedProject.id) }} />
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Pin</span>
            <Toggle on={alwaysOnTop || compact} onToggle={toggleAlwaysOnTop} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Compact</span>
            <Toggle on={compact} onToggle={toggleCompact} />
          </label>
          {areas.length > 0 && (
            <AreaFilterDropdown
              areas={areas}
              hiddenAreaIds={hiddenAreaIds}
              defaultAreaId={defaultAreaId}
              onHiddenChange={handleHiddenChange}
              onDefaultChange={(id) => { setDefaultAreaId(id); saveDefaultAreaId(id); }}
            />
          )}
        </div>

        {/* Update banner */}
        {updateStatus !== "idle" && (
          <div style={{
            margin: "0 32px", padding: "10px 14px", borderRadius: "var(--radius-md)",
            background: updateStatus === "downloading" ? "rgba(139,92,246,0.08)" : "rgba(34,197,94,0.08)",
            border: `1px solid ${updateStatus === "downloading" ? "rgba(139,92,246,0.2)" : "rgba(34,197,94,0.2)"}`,
            display: "flex", alignItems: "center", gap: 10, fontSize: 13,
          }}>
            <span style={{ flex: 1, color: "var(--text-primary)" }}>
              {updateStatus === "available" && `Jot ${updateVersion} is available.`}
              {updateStatus === "downloading" && `Downloading update… ${Math.round(updateProgress)}%`}
              {updateStatus === "ready" && "Update installed. Restarting…"}
            </span>
            {updateStatus === "available" && (
              <>
                <button onClick={handleUpdate} style={{ padding: "4px 12px", fontSize: 12, fontWeight: 600, borderRadius: "var(--radius-sm)", background: "var(--accent)", color: "#fff", cursor: "pointer" }}>Update now</button>
                <button onClick={() => setUpdateStatus("idle")} style={{ padding: "4px 8px", fontSize: 12, color: "var(--text-tertiary)", cursor: "pointer" }}>Later</button>
              </>
            )}
            {updateStatus === "downloading" && (
              <div style={{ width: 80, height: 4, borderRadius: 2, background: "var(--bg-tertiary)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${updateProgress}%`, background: "#8b5cf6", borderRadius: 2, transition: "width 0.3s" }} />
              </div>
            )}
          </div>
        )}

        {/* Scrollable task area */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 32px" }}>
          {view !== "logbook" && (
            <div style={{ marginBottom: 16 }}>
              <CreateTask
                projects={projects}
                allTags={tags}
                projectId={selectedProject?.id ?? null}
                areaId={selectedProject ? null : selectedInboxAreaId ?? defaultAreaId ?? null}
                placeholder="Add task… (natural language)"
                canCreateProjectsAndTags
                onCreated={() => loadData()}
                onProjectCreated={(p) => setProjects((prev) => [...prev, p])}
                onTagCreated={(t) => setTags((prev) => [...prev, t])}
              />
            </div>
          )}

          {displayTasks.length === 0 ? (
            <EmptyState view={view} />
          ) : view === "logbook" ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {displayTasks.map((task) => (
                <LogbookRow key={task.id} task={task} projects={projects} areas={areas} onClick={() => openTaskWindow(task)} />
              ))}
            </div>
          ) : (
            <TaskList
              tasks={displayTasks}
              projects={projects}
              onComplete={handleComplete}
              onOpen={openTaskWindow}
            />
          )}
        </div>

        {/* Heatmap pinned to bottom — only visible in Logbook */}
        {view === "logbook" && (
          <div style={{ flexShrink: 0, padding: "0 32px 24px", borderTop: "1px solid var(--border-subtle)" }}>
            <CompletionHeatmap dates={heatmapDates} />
          </div>
        )}
      </main>

      {showPrefs && (
        <Preferences
          areas={areas}
          hiddenAreaIds={hiddenAreaIds}
          onHiddenChange={handleHiddenChange}
          onAreasChange={loadData}
          onClose={() => setShowPrefs(false)}
        />
      )}

      {/* Onboarding — first-run space creation */}
      {showOnboarding && (
        <div style={{ position: "fixed", inset: 0, zIndex: 250, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 380, background: "var(--bg-primary)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-default)", boxShadow: "var(--shadow-lg)", padding: "32px 28px", textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>Welcome to Jot</div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 20 }}>
              Create your first space to organize tasks. You can add more later in Preferences.
            </p>
            <input
              autoFocus
              value={onboardingName}
              onChange={(e) => setOnboardingName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && onboardingName.trim()) handleOnboardingCreate(); }}
              placeholder="e.g. Personal, Work, Side Project…"
              style={{
                width: "100%", padding: "10px 14px", fontSize: 14,
                borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)",
                background: "var(--bg-secondary)", color: "var(--text-primary)",
                fontFamily: "inherit", outline: "none", marginBottom: 16,
                textAlign: "center",
              }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button
                onClick={() => { localStorage.setItem("jot_onboarding_done", "1"); setShowOnboarding(false); }}
                style={{ padding: "8px 18px", fontSize: 13, borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--bg-secondary)", color: "var(--text-secondary)", cursor: "pointer" }}
              >
                Skip
              </button>
              <button
                onClick={handleOnboardingCreate}
                disabled={!onboardingName.trim()}
                style={{ padding: "8px 24px", fontSize: 13, fontWeight: 600, borderRadius: "var(--radius-md)", background: "var(--accent)", color: "#fff", cursor: "pointer", opacity: onboardingName.trim() ? 1 : 0.5 }}
              >
                Create space
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project context menu */}
      {ctxMenu && (
        <div
          onClick={() => setCtxMenu(null)}
          style={{ position: "fixed", inset: 0, zIndex: 300 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed", left: ctxMenu.x, top: ctxMenu.y,
              background: "var(--bg-primary)", border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)",
              padding: "4px 0", minWidth: 140, zIndex: 301,
            }}
          >
            <button
              onClick={() => { const id = ctxMenu.projectId; setCtxMenu(null); handleDeleteProject(id); }}
              style={{
                width: "100%", textAlign: "left", padding: "7px 14px", fontSize: 13,
                color: "var(--priority-high)", display: "flex", alignItems: "center", gap: 8,
              }}
            >
              Delete project
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Area filter dropdown ─────────────────────────────────────────────────────

import { forwardRef } from "react";

const AreaFilterDropdown = forwardRef<HTMLDivElement, {
  areas: Area[];
  hiddenAreaIds: string[];
  defaultAreaId: string | null;
  onHiddenChange: (ids: string[]) => void;
  onDefaultChange: (id: string | null) => void;
}>(function AreaFilterDropdown({ areas, hiddenAreaIds, defaultAreaId, onHiddenChange, onDefaultChange }, ref) {
  const [open, setOpen] = useState(false);
  const hiddenCount = hiddenAreaIds.length;
  const defaultArea = areas.find((a) => a.id === defaultAreaId);

  function toggleVisible(id: string) {
    const next = hiddenAreaIds.includes(id)
      ? hiddenAreaIds.filter((x) => x !== id)
      : [...hiddenAreaIds, id];
    onHiddenChange(next);
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "5px 10px",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border-default)",
          fontSize: 12,
          color: (hiddenCount > 0 || defaultArea) ? "var(--accent)" : "var(--text-secondary)",
          background: (hiddenCount > 0 || defaultArea) ? "var(--accent-light)" : "transparent",
        }}
      >
        {defaultArea
          ? <><span style={{ width: 8, height: 8, borderRadius: 3, background: spaceColor(defaultArea.id), flexShrink: 0 }} />{defaultArea.name}</>
          : "Spaces"
        }
        {hiddenCount > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, background: "var(--accent)", color: "#fff", borderRadius: 10, padding: "0 5px", lineHeight: "16px" }}>
            {areas.length - hiddenCount}/{areas.length}
          </span>
        )}
        <span style={{ fontSize: 10, opacity: 0.6 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 49 }} />
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50,
            background: "var(--bg-primary)", border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-md)",
            minWidth: 220, padding: "6px 0",
          }}>
            {/* Default area section */}
            <div style={{ padding: "4px 14px 2px", fontSize: 10, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
              Default space for new tasks
            </div>
            {areas.map((area) => (
              <button
                key={area.id}
                onClick={() => onDefaultChange(area.id)}
                style={{ width: "100%", textAlign: "left", padding: "6px 14px", display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--text-primary)", background: "transparent" }}
              >
                <span style={{
                  width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
                  border: `2px solid ${defaultAreaId === area.id ? "var(--accent)" : "var(--border-strong)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {defaultAreaId === area.id && (
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", display: "block" }} />
                  )}
                </span>
                <span style={{ width: 8, height: 8, borderRadius: 3, background: spaceColor(area.id), flexShrink: 0 }} />
                {area.name}
              </button>
            ))}

            {/* Visibility section */}
            <div style={{ margin: "6px 0 2px", borderTop: "1px solid var(--border-subtle)", padding: "6px 14px 2px", fontSize: 10, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
              Show in sidebar
            </div>
            {areas.map((area) => {
              const visible = !hiddenAreaIds.includes(area.id);
              return (
                <div
                  key={area.id}
                  style={{ padding: "6px 14px", display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: visible ? "var(--text-primary)" : "var(--text-tertiary)" }}
                >
                  <Toggle on={visible} onToggle={() => toggleVisible(area.id)} />
                  <span style={{ width: 8, height: 8, borderRadius: 3, background: spaceColor(area.id), flexShrink: 0 }} />
                  {area.name}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
});

// ─── Small components ─────────────────────────────────────────────────────────

function NavItem({ label, count, urgentCount, active, onClick, onContextMenu, indent = false, dot, dotSquare = false }: {
  label: string;
  count?: number;
  urgentCount?: number;
  active: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  indent?: boolean;
  dot?: string;
  dotSquare?: boolean;
}) {
  const showUrgent = urgentCount != null && urgentCount > 0;
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={{ width: "100%", textAlign: "left", padding: indent ? "6px 16px 6px 28px" : "6px 16px", fontSize: 13, borderRadius: 0, display: "flex", alignItems: "center", gap: 8, background: active ? "var(--accent-light)" : "transparent", color: active ? "var(--accent)" : "var(--text-secondary)", fontWeight: active ? 500 : 400, cursor: "pointer", transition: "background var(--transition)" }}
    >
      {dot && <span style={{ width: 8, height: 8, borderRadius: dotSquare ? 3 : "50%", background: dot, flexShrink: 0 }} />}
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {showUrgent && (
        <span style={{ fontSize: 11, color: "#ef4444", background: "rgba(239,68,68,0.12)", borderRadius: 10, padding: "1px 6px", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
          {urgentCount}
        </span>
      )}
      {!showUrgent && count != null && count > 0 && (
        <span style={{ fontSize: 11, color: active ? "var(--accent)" : "var(--text-tertiary)", background: active ? "var(--accent-light)" : "var(--bg-overlay)", borderRadius: 10, padding: "1px 6px", fontVariantNumeric: "tabular-nums" }}>
          {count}
        </span>
      )}
    </button>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{ margin: "12px 12px 4px", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
      {label}
    </div>
  );
}

function EmptyState({ view }: { view: View }) {
  const messages: Record<View, { title: string; hint: string }> = {
    overdue:  { title: "Nothing overdue",       hint: "You're all caught up" },
    today:    { title: "Nothing due today",      hint: "Press Ctrl+Space to add a task" },
    inbox:    { title: "Inbox is empty",         hint: "Tasks without a project in this space" },
    upcoming: { title: "Nothing upcoming",       hint: "Tasks with future dates will appear here" },
    logbook:  { title: "No completed tasks yet", hint: "Completed tasks are stored here" },
    project:  { title: "No tasks",              hint: "Add a task to this project" },
  };
  const { title, hint } = messages[view];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "64px 32px", color: "var(--text-tertiary)", gap: 8, textAlign: "center" }}>
      <div style={{ fontSize: 15, fontWeight: 500, color: "var(--text-secondary)" }}>{title}</div>
      <div style={{ fontSize: 13 }}>{hint}</div>
    </div>
  );
}

function FormInput({ label, type, value, onChange, placeholder }: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-default)", background: "var(--bg-secondary)", color: "var(--text-primary)", fontSize: 14, outline: "none", fontFamily: "inherit" }}
      />
    </label>
  );
}
