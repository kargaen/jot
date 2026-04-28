import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { spaceColor, projectColor } from "../lib/colors";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { WebviewWindow, getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import Toggle from "../components/Toggle";
import Preferences from "./Preferences";
import {
  fetchAreas,
  fetchAreaMembers,
  fetchProjects,
  fetchProjectMembers,
  fetchTags,
  fetchAllTasks,
  fetchLogbookTasks,
  fetchCompletionDates,
  completeTask,
  updateTask,
  updateProject,
  reorderTasks,
  reorderProjects,
  mergeProjects,
  deleteProject,
  closeProject,
  closeProjectAndCompleteTasks,
  closeProjectAndReleaseTasks,
  createArea,
  inviteMember,
  removeAreaMember,
  inviteProjectMember,
  removeProjectMember,
} from "../lib/supabase";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import TaskRow from "../components/TaskRow";
import LogbookRow from "../components/LogbookRow";
import CreateTask from "../components/CreateTask";
import CompletionHeatmap from "../components/CompletionHeatmap";
import { logger } from "../lib/logger";
import { syncWidgets } from "../lib/widgetSync";
import { loadHiddenAreas, saveHiddenAreas, filterVisibleTasks, filterVisibleProjects } from "../lib/tasks";
import type { Area, AreaMember, Project, ProjectMember, Tag, TaskWithTags } from "../types";

const RELEASES_URL = "https://github.com/kargaen/jot/releases";

type View = "overdue" | "today" | "inbox" | "upcoming" | "project" | "logbook";
type SidebarContextMenu =
  | { x: number; y: number; kind: "area"; areaId: string }
  | { x: number; y: number; kind: "project"; projectId: string };
type ShareTarget =
  | { kind: "area"; id: string; name: string }
  | { kind: "project"; id: string; name: string };

function sortTasks(tasks: TaskWithTags[], byOrder = false): TaskWithTags[] {
  return [...tasks].sort((a, b) => {
    if (byOrder) {
      const diff = a.sort_order - b.sort_order;
      if (diff !== 0) return diff;
      // Fallback when sort_orders are equal (e.g. all 0 initially)
      return a.created_at < b.created_at ? -1 : 1;
    }
    // Default: due date → created_at → title
    const da = a.due_date ?? "9999-99-99";
    const db = b.due_date ?? "9999-99-99";
    if (da !== db) return da < db ? -1 : 1;
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
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

function AuthScreen({ launchNotice }: { launchNotice: string | null }) {
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (launchNotice) setNotice(launchNotice);
  }, [launchNotice]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    const err = isSignUp
      ? await signUp(email, password)
      : await signIn(email, password, rememberMe);
    if (err) setError(err);
    else if (isSignUp) {
      setNotice("Check your email to confirm your account. The link will bring you back to Jot's website after confirmation.");
      setPassword("");
    }
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
        {notice && (
          <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: "var(--radius-sm)", background: "rgba(22,163,74,0.10)", color: "#166534", fontSize: 13 }}>
            {notice}
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

// ─── Task list with drag-and-drop reordering ─────────────────────────────────

function TaskList({
  tasks,
  projects,
  reorderable = false,
  onComplete,
  onOpen,
  onReorder,
  onDragStart,
  onDragEnd,
  onSidebarDrop,
  onSidebarHover,
}: {
  tasks: TaskWithTags[];
  projects: Project[];
  reorderable?: boolean;
  onComplete: (id: string) => void;
  onOpen: (task: TaskWithTags) => void;
  onReorder?: (newOrder: TaskWithTags[]) => void;
  onDragStart?: (task: TaskWithTags) => void;
  onDragEnd?: () => void;
  onSidebarDrop?: (taskId: string, projectId: string | null, areaId: string | null) => void;
  onSidebarHover?: (projectId: string | null, areaId: string | null) => void;
}) {
  // Refs stable across renders — avoid stale closures in document listeners
  const dragIdxRef = useRef<number | null>(null);
  const dropIdxRef = useRef<number | null>(null);
  const ghostOffsetRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  // pending = intent to drag before threshold is met (avoids flash on plain click)
  const pendingRef = useRef<{ idx: number; startX: number; startY: number; h: number; w: number } | null>(null);
  // always-current callbacks/data for use inside document listeners
  const liveRef = useRef({ tasks, onReorder, onDragStart, onDragEnd, onSidebarDrop, onSidebarHover, reorderable });
  useEffect(() => { liveRef.current = { tasks, onReorder, onDragStart, onDragEnd, onSidebarDrop, onSidebarHover, reorderable }; });
  // sidebar target tracked every pointermove frame — read in onUp
  const sidebarDropRef = useRef<{ projectId: string | null; areaId: string | null } | null>(null);

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragHeight, setDragHeight] = useState(44);
  const [dragWidth, setDragWidth] = useState(300);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);

  // Document-level pointer listeners — set up once, always active
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const pending = pendingRef.current;
      if (!pending) return;

      if (dragIdxRef.current === null) {
        // Not dragging yet — wait for threshold
        if (Math.abs(e.clientX - pending.startX) + Math.abs(e.clientY - pending.startY) < 6) return;
        // Commit to drag
        dragIdxRef.current = pending.idx;
        dropIdxRef.current = pending.idx;
        liveRef.current.onDragStart?.(liveRef.current.tasks[pending.idx]);
        setDragHeight(pending.h);
        setDragWidth(pending.w);
        setGhostPos({ x: e.clientX, y: e.clientY });
        setDragIdx(pending.idx);
        setDropIdx(pending.idx);
        document.body.style.cursor = liveRef.current.reorderable ? "grabbing" : "no-drop";
        return;
      }

      // Update ghost
      setGhostPos({ x: e.clientX, y: e.clientY });

      // Track sidebar target every frame (more reliable than elementFromPoint at pointerup)
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      let node: Element | null = hit;
      let foundProject: string | null = null;
      let foundArea: string | null = null;
      while (node) {
        const pid = node.getAttribute("data-drop-project-id");
        if (pid) { foundProject = pid; foundArea = node.getAttribute("data-drop-area-id") || null; break; }
        const aid = node.getAttribute("data-drop-area-id");
        if (aid) { foundArea = aid; break; }
        node = node.parentElement;
      }
      const prev = sidebarDropRef.current;
      if (foundProject !== prev?.projectId || foundArea !== prev?.areaId) {
        sidebarDropRef.current = (foundProject || foundArea) ? { projectId: foundProject, areaId: foundArea } : null;
        liveRef.current.onSidebarHover?.(foundProject, foundArea);
        if (foundProject || foundArea) {
          document.body.style.cursor = "copy";
        } else {
          document.body.style.cursor = liveRef.current.reorderable ? "grabbing" : "no-drop";
        }
      }

      // Hit-test task wrapper divs (marked with data-task-idx) for drop slot
      if (!containerRef.current) return;
      const cy = e.clientY;
      const wrappers = Array.from(containerRef.current.querySelectorAll<HTMLElement>("[data-task-idx]"));
      let target = wrappers.length;
      for (let i = 0; i < wrappers.length; i++) {
        const r = wrappers[i].getBoundingClientRect();
        if (cy < r.top + r.height / 2) { target = i; break; }
      }
      dropIdxRef.current = target;
      setDropIdx(target);
    };

    const onUp = (_e: PointerEvent) => {
      pendingRef.current = null;
      const src = dragIdxRef.current;

      if (src !== null) {
        const sidebar = sidebarDropRef.current;
        sidebarDropRef.current = null;

        if (sidebar) {
          liveRef.current.onSidebarDrop?.(liveRef.current.tasks[src].id, sidebar.projectId, sidebar.areaId);
        } else {
          const insertAt = dropIdxRef.current;
          if (insertAt !== null && insertAt !== src && insertAt !== src + 1) {
            const cur = liveRef.current.tasks;
            const next = [...cur];
            const [moved] = next.splice(src, 1);
            next.splice(insertAt > src ? insertAt - 1 : insertAt, 0, moved);
            liveRef.current.onReorder?.(next);
          }
        }
      }

      dragIdxRef.current = null;
      dropIdxRef.current = null;
      document.body.style.cursor = "";
      setDragIdx(null);
      setDropIdx(null);
      setDragHeight(44);
      setGhostPos(null);
      liveRef.current.onDragEnd?.();
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handlePointerDown(e: React.PointerEvent, idx: number) {
    if (!reorderable || e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    ghostOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    pendingRef.current = { idx, startX: e.clientX, startY: e.clientY, h: rect.height, w: rect.width };
  }

  if (tasks.length === 0) return null;
  return (
    <div ref={containerRef} style={{ display: "flex", flexDirection: "column", userSelect: dragIdx !== null ? "none" : undefined }}>
      {tasks.map((task, idx) => (
        <div key={task.id} data-task-idx={idx}>
          {/* Drop indicator line above this item */}
          {reorderable && dropIdx === idx && dragIdx !== null && dragIdx !== idx && dragIdx !== idx - 1 && (
            <div style={{ height: 2, margin: "1px 14px", borderRadius: 1, background: "var(--accent)", pointerEvents: "none" }} />
          )}
          <div onPointerDown={(e) => handlePointerDown(e, idx)} style={{ touchAction: "none" }}>
            {dragIdx === idx ? (
              <div style={{ height: dragHeight, padding: "4px 8px", boxSizing: "border-box" }}>
                <div style={{
                  height: "100%",
                  borderRadius: "var(--radius-md)",
                  border: "2px dashed var(--border-default)",
                  background: "var(--bg-overlay)",
                }} />
              </div>
            ) : (
              <TaskRow
                task={task}
                projects={projects}
                draggable={reorderable}
                onComplete={() => onComplete(task.id)}
                onClick={() => onOpen(task)}
              />
            )}
          </div>
        </div>
      ))}
      {reorderable && dropIdx === tasks.length && dragIdx !== null && (
        <div style={{ height: 2, margin: "1px 14px", borderRadius: 1, background: "var(--accent)", pointerEvents: "none" }} />
      )}
      {dragIdx !== null && ghostPos !== null && (
        <div style={{
          position: "fixed",
          left: ghostPos.x - ghostOffsetRef.current.x,
          top: ghostPos.y - ghostOffsetRef.current.y,
          width: dragWidth,
          pointerEvents: "none",
          zIndex: 9999,
          borderRadius: "var(--radius-md)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.22)",
          border: "1px solid var(--accent)",
          background: "var(--bg-primary)",
          opacity: 0.88,
          transform: "scale(1.02)",
        }}>
          <TaskRow
            task={tasks[dragIdx]}
            projects={projects}
            draggable={false}
            onComplete={() => {}}
            onClick={() => {}}
          />
        </div>
      )}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

const DEFAULT_AREA_KEY = "jot_default_area";

function loadDefaultAreaId(): string | null {
  return localStorage.getItem(DEFAULT_AREA_KEY);
}

function saveDefaultAreaId(id: string | null) {
  if (id) localStorage.setItem(DEFAULT_AREA_KEY, id);
  else localStorage.removeItem(DEFAULT_AREA_KEY);
}

export default function Dashboard({ launchNotice = null }: { launchNotice?: string | null }) {
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
  const [ctxMenu, setCtxMenu] = useState<SidebarContextMenu | null>(null);
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  const [closeDialog, setCloseDialog] = useState<{ projectId: string; taskCount: number } | null>(null);
  const projectsSeenWithTasks = useRef(new Set<string>());
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingName, setOnboardingName] = useState("Personal");
  const [updateStatus, setUpdateStatus] = useState<"idle" | "available" | "downloading" | "ready" | "failed">("idle");
  const [updateVersion, setUpdateVersion] = useState("");
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateError, setUpdateError] = useState("");
  const updateRef = useRef<Awaited<ReturnType<typeof check>> | null>(null);
  const [, setDraggingTask] = useState<TaskWithTags | null>(null);
  const [sidebarHover, setSidebarHover] = useState<{ projectId: string | null; areaId: string | null } | null>(null);
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null);
  const [projectDropTarget, setProjectDropTarget] = useState<{ id: string; mode: "before" | "after" | "merge" } | null>(null);
  const [suggestClose, setSuggestClose] = useState<{ projectId: string; projectName: string } | null>(null);

  const today = new Date().toISOString().split("T")[0];
  const userId = user?.id ?? null;

  const loadIdRef = useRef(0);
  const loadData = useCallback(async () => {
    const id = ++loadIdRef.current;
    logger.debug("dashboard", `loadData #${id}: fetching…`);
    try {
      const [a, p, t, tasks] = await Promise.all([
        fetchAreas(),
        fetchProjects(),
        fetchTags(),
        fetchAllTasks(),
      ]);
      if (id !== loadIdRef.current) return; // stale — a newer load is in flight
      setAreas(a);
      if (a.length === 0 && !localStorage.getItem("jot_onboarding_done")) {
        setShowOnboarding(true);
      }
      const savedDefaultAreaId = loadDefaultAreaId();
      if (a.length > 0 && (!savedDefaultAreaId || !a.some((area) => area.id === savedDefaultAreaId))) {
        setDefaultAreaId(a[0].id);
        saveDefaultAreaId(a[0].id);
      }
      setProjects(p);
      setTags(t);
      setAllTasks(tasks);
      logger.info("dashboard", `loadData #${id}: ${tasks.length} tasks, ${p.length} projects`);
      syncWidgets();
    } catch (err) {
      if (id !== loadIdRef.current) return;
      logger.error("dashboard", "loadData failed", err instanceof Error ? err.message : err);
    }
  }, []);

  useEffect(() => {
    if (userId) loadData();
  }, [userId, loadData]);

  // Clear stale "suggest close" toast when the user navigates away from the project it refers to
  useEffect(() => {
    setSuggestClose(null);
  }, [selectedProject?.id]);

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

  // Realtime: reload on any change, debounced to avoid flicker on rapid completions
  const realtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("tasks-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
        realtimeTimerRef.current = setTimeout(() => loadData(), 500);
      })
      .subscribe();
    return () => {
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
      supabase.removeChannel(channel);
    };
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
    setUpdateError("");
    setUpdateProgress(0);
    let totalBytes = 0;
    try {
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
    } catch (error) {
      logger.error("dashboard", "update install failed", error instanceof Error ? error.message : error);
      setUpdateStatus("failed");
      setUpdateError(error instanceof Error ? error.message : "Update could not be installed automatically.");
    }
  }

  // ── Reminder scheduler ────────────────────────────────────────────────────

  async function isQuickCaptureOpen(): Promise<boolean> {
    try {
      const qc = await WebviewWindow.getByLabel("quick-capture");
      return qc ? await qc.isVisible() : false;
    } catch { return false; }
  }

  async function openReminderWindow(manual = false) {
    // Don't steal focus from Quick Capture — shouldShowReminder() will retry next tick
    if (!manual && await isQuickCaptureOpen()) return;

    // Mark today's reminder as shown only when it actually opens
    if (!manual) {
      localStorage.setItem("jot_last_reminder_date", new Date().toISOString().slice(0, 10));
    }

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
      shadow: false,
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

      // Snooze expiry
      const snoozedUntil = localStorage.getItem("jot_reminder_snoozed_until");
      if (snoozedUntil && new Date(snoozedUntil) <= now) {
        localStorage.removeItem("jot_reminder_snoozed_until");
        openReminderWindow();
        return;
      }

      // Time-based trigger (at or after configured time, once per day)
      if (snoozedUntil) return;
      if (shouldShowReminder()) {
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
    // If currently viewing a space or project that's now hidden, deselect
    if (selectedInboxAreaId && ids.includes(selectedInboxAreaId)) {
      setSelectedInboxAreaId(null);
      setView("today");
    }
    if (selectedProject?.area_id && ids.includes(selectedProject.area_id)) {
      setSelectedProject(null);
      setView("today");
    }
  }

  // ─── Derived views (all in memory, no extra fetches) ──────────────────────

  // Projects and tasks filtered by visible areas
  const visibleProjects = useMemo(
    () => filterVisibleProjects(projects, hiddenAreaIds),
    [projects, hiddenAreaIds],
  );

  const visibleTasks = useMemo(
    () => filterVisibleTasks(allTasks, projects, hiddenAreaIds),
    [allTasks, projects, hiddenAreaIds],
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

  // Track projects that have been seen with tasks (to detect "became empty")
  useEffect(() => {
    for (const t of allTasks) {
      if (t.project_id) projectsSeenWithTasks.current.add(t.project_id);
    }
  }, [allTasks]);

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
    return view === "logbook" ? raw : sortTasks(raw, view === "project");
  }, [view, overdueTask, todayTasks, inboxTasks, upcomingTasks, projectTasks, logbookTasks, projects, selectedInboxAreaId]);

  // ──────────────────────────────────────────────────────────────────────────

  function handleComplete(taskId: string) {
    const task = allTasks.find((t) => t.id === taskId);
    setAllTasks((prev) => prev.filter((t) => t.id !== taskId));
    completeTask(taskId).catch((err) =>
      logger.error("dashboard", "completeTask failed", err instanceof Error ? err.message : err),
    );
    // If this was the last todo task in a project, offer to close it
    if (task?.project_id) {
      const remaining = allTasks.filter(
        (t) => t.id !== taskId && t.project_id === task.project_id,
      );
      if (remaining.length === 0 && projectsSeenWithTasks.current.has(task.project_id)) {
        const project = projects.find((p) => p.id === task.project_id);
        if (project) setSuggestClose({ projectId: task.project_id, projectName: project.name });
      }
    }
  }

  function handleReorder(newOrder: TaskWithTags[]) {
    const updates = newOrder.map((t, i) => ({ id: t.id, sort_order: (i + 1) * 1000 }));
    // Optimistic update in memory
    setAllTasks((prev) => {
      const map = new Map(updates.map((u) => [u.id, u.sort_order]));
      return prev.map((t) => (map.has(t.id) ? { ...t, sort_order: map.get(t.id)! } : t));
    });
    reorderTasks(updates).catch((err) =>
      logger.error("dashboard", "reorderTasks failed", err instanceof Error ? err.message : err),
    );
  }

  function handleProjectDrop(e: React.DragEvent, targetId: string, group: Project[]) {
    const sourceId = e.dataTransfer.getData("projectId");
    const dropMode = projectDropTarget?.id === targetId ? projectDropTarget.mode : "after";
    setDraggingProjectId(null);
    setProjectDropTarget(null);
    if (!sourceId || sourceId === targetId) return;
    if (dropMode === "merge") {
      const sourceProject = projects.find((p) => p.id === sourceId);
      const targetProject = projects.find((p) => p.id === targetId);
      if (!sourceProject || !targetProject) return;
      const accepted = window.confirm(
        `Merge "${sourceProject.name}" into "${targetProject.name}"?\n\nAll open tasks from "${sourceProject.name}" will move into "${targetProject.name}", and the source project will be deleted.`,
      );
      if (!accepted) return;

      setAllTasks((prev) =>
        prev.map((task) =>
          task.project_id === sourceId
            ? { ...task, project_id: targetId, area_id: null }
            : task,
        ),
      );
      setProjects((prev) => prev.filter((project) => project.id !== sourceId));
      if (selectedProject?.id === sourceId) {
        setSelectedProject(targetProject);
        setView("project");
      }

      mergeProjects(sourceId, targetId)
        .then(() => {
          logger.info("dashboard", `merged project ${sourceId} into ${targetId}`);
          loadData();
        })
        .catch((err) => {
          logger.error("dashboard", "mergeProjects failed", err instanceof Error ? err.message : err);
          loadData();
        });
      return;
    }
    const srcIdx = group.findIndex((p) => p.id === sourceId);
    const tgtIdx = group.findIndex((p) => p.id === targetId);
    if (srcIdx === -1 || tgtIdx === -1) return;
    const insertAt = dropMode === "before" ? tgtIdx : tgtIdx + 1;
    const next = [...group];
    const [moved] = next.splice(srcIdx, 1);
    next.splice(insertAt > srcIdx ? insertAt - 1 : insertAt, 0, moved);
    const updates = next.map((p, i) => ({ id: p.id, sort_order: (i + 1) * 1000 }));
    setProjects((prev) => {
      const map = new Map(updates.map((u) => [u.id, u.sort_order]));
      return [...prev].sort((a, b) => (map.get(a.id) ?? a.sort_order) - (map.get(b.id) ?? b.sort_order));
    });
    reorderProjects(updates).catch((err) =>
      logger.error("dashboard", "reorderProjects failed", err instanceof Error ? err.message : err),
    );
  }

  async function handleMoveTask(taskId: string, projectId: string | null, areaId: string | null) {
    setAllTasks((prev) =>
      prev.map((t) => t.id === taskId ? { ...t, project_id: projectId, area_id: areaId } : t),
    );
    await updateTask(taskId, { project_id: projectId, area_id: areaId });
  }

  async function handleMoveProject(projectId: string, areaId: string) {
    const area = areas.find((a) => a.id === areaId);
    setProjects((prev) => prev.map((p) => p.id === projectId ? { ...p, area_id: areaId } : p));
    if (selectedProject?.id === projectId) {
      setSelectedProject((project) => project ? { ...project, area_id: areaId } : project);
    }
    await updateProject(projectId, { area_id: areaId });
    logger.info("dashboard", `moved project ${projectId} to space ${area?.name ?? areaId}`);
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
    if (!confirm("Permanently delete this project? Its tasks will move to the inbox.")) return;
    await deleteProject(id);
    if (selectedProject?.id === id) { setSelectedProject(null); setView("inbox"); }
    loadData();
  }

  function handleCloseProject(projectId: string) {
    const taskCount = allTasks.filter((t) => t.project_id === projectId).length;
    if (taskCount > 0) {
      setCloseDialog({ projectId, taskCount });
    } else {
      closeProject(projectId).then(() => {
        if (selectedProject?.id === projectId) { setSelectedProject(null); setView("inbox"); }
        loadData();
      });
    }
  }

  async function handleCloseConfirm(action: "complete" | "release") {
    if (!closeDialog) return;
    const { projectId } = closeDialog;
    if (action === "complete") {
      await closeProjectAndCompleteTasks(projectId);
    } else {
      await closeProjectAndReleaseTasks(projectId);
    }
    setCloseDialog(null);
    if (selectedProject?.id === projectId) { setSelectedProject(null); setView("inbox"); }
    loadData();
  }

  function canManageArea(areaId: string) {
    return areas.some((area) => area.id === areaId && area.user_id === userId);
  }

  function canManageProject(projectId: string) {
    const project = projects.find((item) => item.id === projectId);
    return !!project && (project.user_id === userId || (project.area_id ? canManageArea(project.area_id) : false));
  }

  function openShareTarget(target: ShareTarget) {
    setCtxMenu(null);
    setShareTarget(target);
  }

  function renderSidebarContextMenu() {
    if (!ctxMenu) return null;
    const menuStyle: CSSProperties = {
      width: "100%",
      textAlign: "left",
      padding: "7px 14px",
      fontSize: 13,
      color: "var(--text-primary)",
      display: "flex",
      alignItems: "center",
      gap: 8,
    };
    const area = ctxMenu.kind === "area" ? areas.find((item) => item.id === ctxMenu.areaId) ?? null : null;
    const project = ctxMenu.kind === "project" ? projects.find((item) => item.id === ctxMenu.projectId) ?? null : null;
    return (
      <div onClick={() => setCtxMenu(null)} style={{ position: "fixed", inset: 0, zIndex: 300 }}>
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed", left: ctxMenu.x, top: ctxMenu.y,
            background: "var(--bg-primary)", border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)",
            padding: "4px 0", minWidth: 170, zIndex: 301,
          }}
        >
          {ctxMenu.kind === "area" && area && (
            <>
              {canManageArea(area.id) && (
                <button onClick={() => openShareTarget({ kind: "area", id: area.id, name: area.name })} style={menuStyle}>
                  Share space...
                </button>
              )}
              <button
                onClick={() => {
                  setCtxMenu(null);
                  setView("inbox");
                  setSelectedInboxAreaId(area.id);
                  setSelectedProject(null);
                }}
                style={menuStyle}
              >
                Open inbox
              </button>
            </>
          )}
          {ctxMenu.kind === "project" && project && (
            <>
              {canManageProject(project.id) && (
                <button onClick={() => openShareTarget({ kind: "project", id: project.id, name: project.name })} style={menuStyle}>
                  Share project...
                </button>
              )}
              <button
                onClick={() => { const id = project.id; setCtxMenu(null); handleCloseProject(id); }}
                style={menuStyle}
              >
                Close project
              </button>
              {areas.length > 1 && (
                <>
                  <div style={{ padding: "6px 14px 3px", fontSize: 10, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Move to space
                  </div>
                  {areas.map((areaOption) => (
                    <button
                      key={areaOption.id}
                      onClick={() => { const id = project.id; setCtxMenu(null); void handleMoveProject(id, areaOption.id); }}
                      style={menuStyle}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: 3, background: spaceColor(areaOption.id), flexShrink: 0 }} />
                      {areaOption.name}
                    </button>
                  ))}
                </>
              )}
              <button
                onClick={() => { const id = project.id; setCtxMenu(null); handleDeleteProject(id); }}
                style={{ ...menuStyle, color: "var(--priority-high)" }}
              >
                Delete project
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  function renderShareSheet() {
    if (!shareTarget) return null;
    return (
      <ShareSheet
        target={shareTarget}
        onClose={() => setShareTarget(null)}
      />
    );
  }

  const viewTitle =
    view === "overdue"  ? "Overdue" :
    view === "today"    ? "Today" :
    view === "inbox"    ? (areas.find((a) => a.id === selectedInboxAreaId)?.name ?? "Inbox") :
    view === "upcoming" ? "Upcoming" :
    view === "logbook"  ? "Logbook" :
    view === "project" && selectedProject ? selectedProject.name : "";

  if (!user) return <AuthScreen launchNotice={launchNotice} />;

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
                  onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, kind: "area", areaId: area.id }); }}
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
                    onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, kind: "project", projectId: project.id }); }}
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
            />
          </div>
        )}
        {displayTasks.length === 0 ? (
          <EmptyState
            view={view}
            onCloseProject={view === "project" && selectedProject ? () => handleCloseProject(selectedProject!.id) : undefined}
          />
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
            reorderable={view === "project"}
            onComplete={handleComplete}
            onOpen={openTaskWindow}
            onReorder={handleReorder}
            onDragStart={(t) => setDraggingTask(t)}
            onDragEnd={() => { setDraggingTask(null); setSidebarHover(null); }}
            onSidebarDrop={handleMoveTask}
            onSidebarHover={(pid, aid) => setSidebarHover(pid || aid ? { projectId: pid, areaId: aid } : null)}
          />
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
      {renderSidebarContextMenu()}
      {renderShareSheet()}

      {/* Suggest closing a project when its last task is completed */}
      {suggestClose && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "var(--bg-primary)", border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)",
          padding: "12px 16px", display: "flex", alignItems: "center", gap: 12,
          zIndex: 200, fontSize: 13, color: "var(--text-primary)", whiteSpace: "nowrap",
        }}>
          <span>All done in <strong>{suggestClose.projectName}</strong>. Close the project?</span>
          <button
            onClick={() => {
              const { projectId } = suggestClose;
              setSuggestClose(null);
              closeProject(projectId).then(() => {
                if (selectedProject?.id === projectId) { setSelectedProject(null); setView("inbox"); }
                loadData();
              });
            }}
            style={{ padding: "5px 14px", fontSize: 12, fontWeight: 600, borderRadius: "var(--radius-sm)", background: "var(--accent)", color: "#fff", cursor: "pointer" }}
          >
            Close project
          </button>
          <button
            onClick={() => setSuggestClose(null)}
            style={{ padding: "5px 10px", fontSize: 12, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-default)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer" }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Close project dialog */}
      {closeDialog && <CloseProjectDialog taskCount={closeDialog.taskCount} onComplete={() => handleCloseConfirm("complete")} onRelease={() => handleCloseConfirm("release")} onCancel={() => setCloseDialog(null)} />}
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
            { id: "overdue",  label: "Overdue",  count: overdueTask.length },
            { id: "today",    label: "Today",    count: todayTasks.length },
            { id: "upcoming", label: "Upcoming", count: upcomingTasks.length },
            { id: "logbook",  label: "Logbook",  count: 0 },
          ] as const).map(({ id, label, count }) => (
            <NavItem
              key={id}
              label={label}
              count={count}
              active={view === id && !selectedProject}
              onClick={() => { setView(id); setSelectedProject(null); }}
            />
          ))}

          {areas.filter((a) => !hiddenAreaIds.includes(a.id)).length > 0 && <SectionHeader label="Spaces" />}
          {areas.filter((a) => !hiddenAreaIds.includes(a.id)).map((area) => {
            const areaProjects = visibleProjects.filter((p) => p.area_id === area.id);
            return (
              <div key={area.id}>
                <div data-drop-area-id={area.id}>
                <NavItem
                  label={area.name}
                  urgentCount={areaUrgentCounts.get(area.id) ?? 0}
                  dot={spaceColor(area.id)}
                  dotSquare
                  active={view === "inbox" && selectedInboxAreaId === area.id && !selectedProject}
                  highlighted={sidebarHover?.areaId === area.id && sidebarHover.projectId === null}
                  onClick={() => { setView("inbox"); setSelectedInboxAreaId(area.id); setSelectedProject(null); }}
                  onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, kind: "area", areaId: area.id }); }}
                />
                </div>
                {areaProjects.map((project) => (
                  <div key={project.id}>
                    {projectDropTarget?.id === project.id && projectDropTarget.mode === "before" && (
                      <div style={{ height: 2, margin: "1px 28px", borderRadius: 1, background: "var(--accent)", pointerEvents: "none" }} />
                    )}
                    <div
                      data-drop-project-id={project.id}
                      data-drop-area-id={project.area_id ?? ""}
                      draggable
                      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("projectId", project.id); setDraggingProjectId(project.id); }}
                      onDragOver={draggingProjectId ? (e) => {
                        e.preventDefault();
                        const r = e.currentTarget.getBoundingClientRect();
                        const y = e.clientY - r.top;
                        const ratio = r.height > 0 ? y / r.height : 0.5;
                        const mode = ratio < 0.28 ? "before" : ratio > 0.72 ? "after" : "merge";
                        setProjectDropTarget({ id: project.id, mode });
                      } : undefined}
                      onDragLeave={draggingProjectId ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setProjectDropTarget((p) => p?.id === project.id ? null : p); } : undefined}
                      onDrop={draggingProjectId ? (e) => handleProjectDrop(e, project.id, areaProjects) : undefined}
                      onDragEnd={() => { setDraggingProjectId(null); setProjectDropTarget(null); }}
                      style={{
                        opacity: draggingProjectId === project.id ? 0.4 : 1,
                        cursor: "grab",
                        borderRadius: "var(--radius-sm)",
                        background: projectDropTarget?.id === project.id && projectDropTarget.mode === "merge"
                          ? "rgba(34,197,94,0.10)"
                          : "transparent",
                        outline: projectDropTarget?.id === project.id && projectDropTarget.mode === "merge"
                          ? "1px solid rgba(34,197,94,0.35)"
                          : "none",
                      }}
                    >
                      <NavItem
                        label={project.name}
                        urgentCount={projectUrgentCounts.get(project.id) ?? 0}
                        indent
                        dot={projectColor(project.id)}
                        active={selectedProject?.id === project.id}
                        highlighted={sidebarHover?.projectId === project.id}
                        onClick={() => { setSelectedProject(project); setView("project"); }}
                        onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, kind: "project", projectId: project.id }); }}
                      />
                    </div>
                    {projectDropTarget?.id === project.id && projectDropTarget.mode === "after" && (
                      <div style={{ height: 2, margin: "1px 28px", borderRadius: 1, background: "var(--accent)", pointerEvents: "none" }} />
                    )}
                    {projectDropTarget?.id === project.id && projectDropTarget.mode === "merge" && (
                      <div style={{ margin: "2px 28px 4px 44px", fontSize: 10, color: "var(--accent)", pointerEvents: "none" }}>
                        Drop to merge into {project.name}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}

        </nav>

        <div style={{ padding: "12px 12px 0", borderTop: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: 2 }}>
          <button
            onClick={() => setShowPrefs(true)}
            style={{ width: "100%", textAlign: "left", padding: "6px 8px", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text-secondary)", cursor: "pointer" }}
          >
            Preferences
          </button>
          <button
            onClick={async () => {
              const win = await WebviewWindow.getByLabel("about");
              if (win) { await win.show(); await win.setFocus(); }
            }}
            style={{ width: "100%", textAlign: "left", padding: "6px 8px", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text-secondary)", cursor: "pointer" }}
          >
            About Jot
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
            background:
              updateStatus === "downloading" ? "rgba(139,92,246,0.08)"
              : updateStatus === "failed" ? "rgba(220,38,38,0.08)"
              : "rgba(34,197,94,0.08)",
            border: `1px solid ${
              updateStatus === "downloading" ? "rgba(139,92,246,0.2)"
              : updateStatus === "failed" ? "rgba(220,38,38,0.2)"
              : "rgba(34,197,94,0.2)"
            }`,
            display: "flex", alignItems: "center", gap: 10, fontSize: 13,
          }}>
            <span style={{ flex: 1, color: "var(--text-primary)" }}>
              {updateStatus === "available" && `Jot ${updateVersion} is available.`}
              {updateStatus === "downloading" && `Downloading update… ${Math.round(updateProgress)}%`}
              {updateStatus === "ready" && "Update installed. Restarting…"}
              {updateStatus === "failed" && `Automatic update failed. Please download Jot manually from Releases.${updateError ? ` (${updateError})` : ""}`}
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
            {updateStatus === "failed" && (
              <>
                <button onClick={() => shellOpen(RELEASES_URL)} style={{ padding: "4px 12px", fontSize: 12, fontWeight: 600, borderRadius: "var(--radius-sm)", background: "#dc2626", color: "#fff", cursor: "pointer" }}>Download manually</button>
                <button onClick={() => setUpdateStatus("idle")} style={{ padding: "4px 8px", fontSize: 12, color: "var(--text-tertiary)", cursor: "pointer" }}>Dismiss</button>
              </>
            )}
          </div>
        )}

        {launchNotice && (
          <div style={{
            margin: "12px 32px 0",
            padding: "10px 14px",
            borderRadius: "var(--radius-md)",
            background: "rgba(22,197,94,0.08)",
            border: "1px solid rgba(22,197,94,0.18)",
            color: "#166534",
            fontSize: 13,
          }}>
            {launchNotice}
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
              />
            </div>
          )}

          {displayTasks.length === 0 ? (
            <EmptyState
              view={view}
              onCloseProject={view === "project" && selectedProject ? () => handleCloseProject(selectedProject!.id) : undefined}
            />
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
              reorderable={view === "project"}
              onComplete={handleComplete}
              onOpen={openTaskWindow}
              onReorder={handleReorder}
              onDragStart={(t) => setDraggingTask(t)}
              onDragEnd={() => setDraggingTask(null)}
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

      {renderSidebarContextMenu()}
      {renderShareSheet()}

      {/* Suggest closing a project when its last task is completed */}
      {suggestClose && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "var(--bg-primary)", border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)",
          padding: "12px 16px", display: "flex", alignItems: "center", gap: 12,
          zIndex: 200, fontSize: 13, color: "var(--text-primary)", whiteSpace: "nowrap",
        }}>
          <span>All done in <strong>{suggestClose.projectName}</strong>. Close the project?</span>
          <button
            onClick={() => {
              const { projectId } = suggestClose;
              setSuggestClose(null);
              closeProject(projectId).then(() => {
                if (selectedProject?.id === projectId) { setSelectedProject(null); setView("inbox"); }
                loadData();
              });
            }}
            style={{ padding: "5px 14px", fontSize: 12, fontWeight: 600, borderRadius: "var(--radius-sm)", background: "var(--accent)", color: "#fff", cursor: "pointer" }}
          >
            Close project
          </button>
          <button
            onClick={() => setSuggestClose(null)}
            style={{ padding: "5px 10px", fontSize: 12, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-default)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer" }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Close project dialog */}
      {closeDialog && <CloseProjectDialog taskCount={closeDialog.taskCount} onComplete={() => handleCloseConfirm("complete")} onRelease={() => handleCloseConfirm("release")} onCancel={() => setCloseDialog(null)} />}
    </div>
  );
}

// ─── Area filter dropdown ─────────────────────────────────────────────────────


function ShareSheet({ target, onClose }: { target: ShareTarget; onClose: () => void }) {
  const [members, setMembers] = useState<Array<AreaMember | ProjectMember>>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadMembers = useCallback(async () => {
    const next = target.kind === "area"
      ? await fetchAreaMembers(target.id)
      : await fetchProjectMembers(target.id);
    setMembers(next);
  }, [target]);

  useEffect(() => {
    void loadMembers().catch(() => {});
  }, [loadMembers]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setBusy(true);
    setInviteError("");
    const err = target.kind === "area"
      ? await inviteMember(target.id, inviteEmail.trim())
      : await inviteProjectMember(target.id, inviteEmail.trim());
    setBusy(false);
    if (err) {
      setInviteError(err);
      return;
    }
    setInviteEmail("");
    await loadMembers();
  }

  async function handleRemove(memberId: string) {
    if (target.kind === "area") await removeAreaMember(memberId);
    else await removeProjectMember(memberId);
    setMembers((prev) => prev.filter((member) => member.id !== memberId));
  }

  const copy = target.kind === "area"
    ? {
        title: "Share space",
        subtitle: "People invited here can see this space and collaborate on its inbox and projects.",
      }
    : {
        title: "Share project",
        subtitle: "People invited here can see this project and its tasks without exposing the whole space.",
      };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 320, background: "rgba(10,12,20,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 460, maxWidth: "100%", background: "var(--bg-primary)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", overflow: "hidden" }}
      >
        <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid var(--border-subtle)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)", flex: 1 }}>{copy.title}</div>
            <button onClick={onClose} style={{ fontSize: 18, color: "var(--text-tertiary)", lineHeight: 1, padding: "0 4px" }}>×</button>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.5 }}>
            <strong style={{ color: "var(--text-primary)" }}>{target.name}</strong>. {copy.subtitle}
          </div>
        </div>

        <div style={{ padding: 22, display: "grid", gap: 16 }}>
          <form onSubmit={handleInvite} style={{ display: "grid", gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Invite someone
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => { setInviteEmail(e.target.value); setInviteError(""); }}
                placeholder="person@example.com"
                style={{ flex: 1, padding: "9px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-default)", background: "var(--bg-secondary)", color: "var(--text-primary)", fontFamily: "inherit", outline: "none" }}
              />
              <button
                type="submit"
                disabled={busy || !inviteEmail.trim()}
                style={{ padding: "9px 14px", borderRadius: "var(--radius-sm)", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: busy || !inviteEmail.trim() ? 0.6 : 1 }}
              >
                {busy ? "Sending..." : "Invite"}
              </button>
            </div>
            {inviteError && <div style={{ fontSize: 12, color: "var(--priority-high)" }}>{inviteError}</div>}
          </form>

          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Members
            </div>
            {members.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--text-secondary)", padding: "10px 0" }}>No one has been invited here yet.</div>
            ) : (
              members.map((member) => (
                <div key={member.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {member.invited_email}
                    </div>
                    <div style={{ fontSize: 11, color: member.status === "accepted" ? "#16a34a" : "#d97706", marginTop: 3 }}>
                      {member.status === "accepted" ? "Active" : "Pending"}
                    </div>
                  </div>
                  <button
                    onClick={() => { void handleRemove(member.id); }}
                    style={{ padding: "5px 10px", borderRadius: "var(--radius-sm)", border: "1px solid rgba(220,38,38,0.18)", background: "rgba(220,38,38,0.08)", color: "var(--priority-high)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

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

function NavItem({ label, count, urgentCount, active, onClick, onContextMenu, onDrop, indent = false, dot, dotSquare = false, highlighted = false }: {
  label: string;
  count?: number;
  urgentCount?: number;
  active: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  indent?: boolean;
  dot?: string;
  dotSquare?: boolean;
  highlighted?: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const showUrgent = urgentCount != null && urgentCount > 0;
  const isDropTarget = !!onDrop;
  const lit = dragOver || highlighted;
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDragOver={isDropTarget ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOver(true); } : undefined}
      onDragLeave={isDropTarget ? () => setDragOver(false) : undefined}
      onDrop={isDropTarget ? (e) => { setDragOver(false); onDrop(e); } : undefined}
      style={{
        width: "100%", textAlign: "left",
        padding: indent ? "6px 16px 6px 28px" : "6px 16px",
        fontSize: 13, borderRadius: 0, display: "flex", alignItems: "center", gap: 8,
        background: lit ? "var(--accent-light)" : active ? "var(--accent-light)" : "transparent",
        color: lit ? "var(--accent)" : active ? "var(--accent)" : "var(--text-secondary)",
        fontWeight: active || lit ? 500 : 400,
        cursor: "pointer", transition: "background var(--transition)",
        outline: lit ? "2px solid var(--accent)" : "none",
        outlineOffset: "-2px",
      }}
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

const ZEN_QUOTES = [
  { text: "All quiet on the western front.",                    from: "All Quiet on the Western Front" },
  { text: "After all, tomorrow is another day.",                from: "Gone with the Wind" },
  { text: "I think this is the beginning of a beautiful friendship.", from: "Casablanca" },
  { text: "Life moves pretty fast. If you don't stop and look around once in a while, you could miss it.", from: "Ferris Bueller's Day Off" },
  { text: "Just keep swimming.",                                from: "Finding Nemo" },
  { text: "To infinity and beyond!",                            from: "Toy Story" },
  { text: "It's not our abilities that show what we truly are. It is our choices.", from: "Harry Potter" },
  { text: "The stuff that dreams are made of.",                 from: "The Maltese Falcon" },
  { text: "Carpe diem. Seize the day, boys.",                   from: "Dead Poets Society" },
  { text: "My mama always said life was like a box of chocolates.", from: "Forrest Gump" },
  { text: "Why so serious?",                                   from: "The Dark Knight" },
  { text: "I'm the king of the world!",                        from: "Titanic" },
  { text: "Roads? Where we're going, we don't need roads.",     from: "Back to the Future" },
  { text: "Perfectly balanced, as all things should be.",       from: "Avengers: Infinity War" },
  { text: "It's only after we've lost everything that we're free to do anything.", from: "Fight Club" },
  { text: "Do, or do not. There is no try.",                    from: "The Empire Strikes Back" },
  { text: "I find your lack of tasks disturbing.",              from: "A galaxy far, far away" },
  { text: "You had me at zero tasks.",                          from: "Jerry Maguire (sort of)" },
  { text: "Here's looking at you, empty inbox.",                from: "Casablanca (sort of)" },
  { text: "I'll be back. But not with more tasks.",             from: "The Terminator (hopefully)" },
];

const ZEN_IMAGES = [
  "/zen-beach1.png", "/zen-beach2.png", "/zen-beach3.png",
  "/zen-beach4.png", "/zen-beach5.png", "/zen-beach6.png", "/zen-beach7.png",
];

function ZenIllustration() {
  const [imgOk, setImgOk] = useState(true);
  const [src] = useState(() => ZEN_IMAGES[Math.floor(Math.random() * ZEN_IMAGES.length)]);
  if (!imgOk) return null;
  return (
    <img
      src={src}
      alt="Relaxing on the beach"
      onError={() => setImgOk(false)}
      style={{ width: "100%", maxWidth: 400, borderRadius: 12, objectFit: "contain" }}
    />
  );
}

function EmptyState({ view, onCloseProject }: { view: View; onCloseProject?: () => void }) {
  const messages: Record<View, { title: string; hint: string }> = {
    overdue:  { title: "Nothing overdue",       hint: "You're all caught up" },
    today:    { title: "Nothing due today",      hint: "Press Ctrl+Space to add a task" },
    inbox:    { title: "",                       hint: "" },
    upcoming: { title: "Nothing upcoming",       hint: "Tasks with future dates will appear here" },
    logbook:  { title: "No completed tasks yet", hint: "Completed tasks are stored here" },
    project:  { title: "No tasks",              hint: "Add a task to this project" },
  };

  // Zen mode for empty spaces
  const [zenQuote] = useState(() => ZEN_QUOTES[Math.floor(Math.random() * ZEN_QUOTES.length)]);
  if (view === "inbox") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 32px", gap: 16, textAlign: "center" }}>
        <ZenIllustration />
        <div style={{ maxWidth: 300 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: "var(--text-secondary)", fontStyle: "italic", lineHeight: 1.5 }}>
            "{zenQuote.text}"
          </div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
            — {zenQuote.from}
          </div>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>
          Nothing here. Enjoy the silence.
        </div>
      </div>
    );
  }

  const { title, hint } = messages[view];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "64px 32px", color: "var(--text-tertiary)", gap: 8, textAlign: "center" }}>
      <div style={{ fontSize: 15, fontWeight: 500, color: "var(--text-secondary)" }}>{title}</div>
      <div style={{ fontSize: 13 }}>{hint}</div>
      {onCloseProject && (
        <button
          onClick={onCloseProject}
          style={{
            marginTop: 16, padding: "7px 18px", fontSize: 13, fontWeight: 500,
            color: "var(--text-secondary)", background: "var(--bg-tertiary)",
            borderRadius: "var(--radius-md)", cursor: "pointer",
            transition: "background var(--transition)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-light)"; e.currentTarget.style.color = "var(--accent)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-tertiary)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
        >
          Close project
        </button>
      )}
    </div>
  );
}

function CloseProjectDialog({ taskCount, onComplete, onRelease, onCancel }: {
  taskCount: number;
  onComplete: () => void;
  onRelease: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 250, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 380, background: "var(--bg-primary)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-default)", boxShadow: "var(--shadow-lg)", padding: "28px 24px" }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>Close project</div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 20 }}>
          This project has {taskCount} remaining task{taskCount !== 1 ? "s" : ""}. What should happen to {taskCount !== 1 ? "them" : "it"}?
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            onClick={onComplete}
            style={{ width: "100%", padding: "10px 16px", fontSize: 13, fontWeight: 500, borderRadius: "var(--radius-md)", background: "var(--accent)", color: "#fff", cursor: "pointer", textAlign: "left" }}
          >
            Complete all tasks and close
            <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.8, marginTop: 2 }}>Mark all tasks as done</div>
          </button>
          <button
            onClick={onRelease}
            style={{ width: "100%", padding: "10px 16px", fontSize: 13, fontWeight: 500, borderRadius: "var(--radius-md)", background: "var(--bg-tertiary)", color: "var(--text-primary)", cursor: "pointer", textAlign: "left" }}
          >
            Move tasks out and close
            <div style={{ fontSize: 11, fontWeight: 400, color: "var(--text-tertiary)", marginTop: 2 }}>Tasks stay in their space, unlinked from project</div>
          </button>
          <button
            onClick={onCancel}
            style={{ width: "100%", padding: "8px 16px", fontSize: 13, color: "var(--text-tertiary)", cursor: "pointer", textAlign: "center", marginTop: 4 }}
          >
            Cancel
          </button>
        </div>
      </div>
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
