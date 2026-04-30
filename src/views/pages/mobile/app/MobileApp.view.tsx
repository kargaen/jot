import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import { useAuth } from "../lib/auth";
import {
  acceptInvite,
  closeProject,
  createArea,
  completeTask,
  createTask,
  createProject,
  declineInvite,
  deleteArea,
  deleteTask,
  fetchAreaMembers,
  fetchAllTasks,
  fetchAreas,
  fetchFeedback,
  fetchPendingInvites,
  fetchProjects,
  fetchTags,
  inviteMember,
  removeAreaMember,
  signOutEverywhere,
  submitFeedback,
  updateArea,
  updatePassword,
  updateTask,
  getSession,
} from "../lib/supabase";
import { syncWidgets } from "../lib/widgetSync";
import { projectColor, spaceColor } from "../lib/colors";
import { saveCreateTaskDraft } from "../controllers/tasks/saveCreateTask";
import TaskRow from "../components/TaskRow";
import Toggle from "../components/Toggle";
import type { Area, NlpLanguageMode, Project, Tag, Task, TaskWithTags } from "../types";
import { parseInput } from "../lib/nlp";
import { loadHiddenAreas, saveHiddenAreas } from "../lib/tasks";
import {
  countTasksByProject,
  friendlyDue,
  friendlyRecurrence,
  normalizeTaskLink,
  sectionLabel,
  sortTasksBySchedule,
} from "../models/tasks/taskPresentation";
import { filterVisibleProjects, filterVisibleTasks } from "../models/tasks/taskVisibility";
import {
  type AppThemePreference,
  applyThemePreference,
  loadThemePreference,
  saveThemePreference,
} from "../lib/theme";
import { loadNlpLanguageMode, saveNlpLanguageMode } from "../lib/nlpSettings";

type TabId = "pulse" | "tasks" | "projects" | "capture" | "user";
type TaskFilter = "today" | "inbox" | "upcoming" | "all";
type UserSectionId = "spaces" | "sharing" | "reminders" | "appearance" | "capture" | "feedback" | "account";
type AreaSchedule = { enabled: boolean; start: string; end: string; days: number[] };
type AreaScheduleMap = Record<string, AreaSchedule>;

const MOBILE_AREA_SCHEDULES_KEY = "jot_mobile_area_schedules";
const DEFAULT_AREA_KEY = "jot_default_area";
const TAB_ORDER: TabId[] = ["pulse", "tasks", "projects", "capture", "user"];
const DEFAULT_AREA_SCHEDULE: AreaSchedule = { enabled: false, start: "07:00", end: "17:00", days: [1, 2, 3, 4, 5] };
const WEEKDAY_OPTIONS = [
  { id: 1, label: "M" },
  { id: 2, label: "T" },
  { id: 3, label: "W" },
  { id: 4, label: "T" },
  { id: 5, label: "F" },
  { id: 6, label: "S" },
  { id: 0, label: "S" },
];

function todayISO() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function prettyToday() {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function loadDefaultAreaId(): string | null {
  return localStorage.getItem(DEFAULT_AREA_KEY);
}

function saveDefaultAreaId(id: string | null) {
  if (id) localStorage.setItem(DEFAULT_AREA_KEY, id);
  else localStorage.removeItem(DEFAULT_AREA_KEY);
}

function loadAreaSchedules(): AreaScheduleMap {
  try {
    const parsed = JSON.parse(localStorage.getItem(MOBILE_AREA_SCHEDULES_KEY) ?? "{}") as Record<string, Partial<AreaSchedule>>;
    return Object.fromEntries(
      Object.entries(parsed).map(([id, value]) => [
        id,
        {
          ...DEFAULT_AREA_SCHEDULE,
          ...value,
          days: Array.isArray(value.days) && value.days.length > 0 ? value.days : DEFAULT_AREA_SCHEDULE.days,
        },
      ]),
    );
  } catch {
    return {};
  }
}

function saveAreaSchedules(schedules: AreaScheduleMap) {
  localStorage.setItem(MOBILE_AREA_SCHEDULES_KEY, JSON.stringify(schedules));
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours * 60) + minutes;
}

function isAreaVisibleNow(schedule: AreaSchedule | undefined, now = new Date()) {
  if (!schedule?.enabled) return true;
  if (!schedule.days.includes(now.getDay())) return false;
  const currentMinutes = (now.getHours() * 60) + now.getMinutes();
  const start = timeToMinutes(schedule.start);
  const end = timeToMinutes(schedule.end);
  if (start === end) return true;
  if (start < end) return currentMinutes >= start && currentMinutes < end;
  return currentMinutes >= start || currentMinutes < end;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return JSON.stringify(error);
}

function inputStyle(): CSSProperties {
  return {
    width: "100%",
    padding: "13px 14px",
    borderRadius: 16,
    border: "1px solid var(--border-default)",
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
    fontSize: 14,
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
  };
}

function cardStyle(): CSSProperties {
  return {
    background: "var(--surface-glass)",
    border: "1px solid var(--surface-border-accent)",
    borderRadius: 24,
    boxShadow: "var(--surface-shadow-ambient)",
    backdropFilter: "blur(8px)",
  };
}

function buttonStyle(kind: "primary" | "secondary" | "danger" = "secondary"): CSSProperties {
  return {
    padding: "11px 14px",
    borderRadius: 16,
    border: kind === "secondary" ? "1px solid var(--border-default)" : "none",
    background:
      kind === "primary" ? "linear-gradient(135deg, #5b5bd6, #7a6cff)" :
      kind === "danger" ? "#dc2626" :
      "var(--surface-glass-strong)",
    color:
      kind === "primary" || kind === "danger" ? "#fff" : "var(--text-primary)",
    fontSize: 14,
    fontWeight: 650,
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: kind === "primary" ? "0 10px 24px rgba(91,91,214,0.22)" : "none",
  };
}

function pillStyle(active = false): CSSProperties {
  return {
    padding: "8px 12px",
    borderRadius: 999,
    background: active ? "var(--accent-light)" : "var(--surface-glass-strong)",
    color: active ? "var(--accent)" : "var(--text-secondary)",
    border: active ? "1px solid rgba(91,91,214,0.22)" : "1px solid var(--border-subtle)",
    fontSize: 12,
    fontWeight: active ? 700 : 600,
    whiteSpace: "nowrap",
  };
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "violet" | "sand" | "mint";
}) {
  const tones = {
    violet: { bg: "var(--metric-violet)", ink: "var(--metric-violet-ink)" },
    sand: { bg: "var(--metric-sand)", ink: "var(--metric-sand-ink)" },
    mint: { bg: "var(--metric-mint)", ink: "var(--metric-mint-ink)" },
  } as const;
  const current = tones[tone];
  return (
    <div style={{
      flex: 1,
      minWidth: 0,
      background: current.bg,
      borderRadius: 20,
      padding: 16,
      border: "1px solid rgba(0,0,0,0.03)",
    }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: current.ink }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>{label}</div>
    </div>
  );
}

function statusToneColor(tone: "good" | "today" | "overdue") {
  if (tone === "overdue") return "#dc2626";
  if (tone === "today") return "#b96b00";
  return "#0f8b68";
}

function UserSectionCard({
  title,
  subtitle,
  onClick,
}: {
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...cardStyle(),
        width: "100%",
        textAlign: "left",
        padding: 18,
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 800 }}>{title}</div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.5 }}>
        {subtitle}
      </div>
    </button>
  );
}

function SpaceCard({
  area,
  projectCount,
  taskCount,
  expanded,
  onToggle,
}: {
  area: Area;
  projectCount: number;
  taskCount: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      style={{ ...cardStyle(), width: "100%", textAlign: "left", padding: 16 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 12, height: 12, borderRadius: 4, background: spaceColor(area.id), flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{area.name}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
            {projectCount} project{projectCount === 1 ? "" : "s"} · {taskCount} task{taskCount === 1 ? "" : "s"}
          </div>
        </div>
        <div style={{ fontSize: 16, color: "var(--text-secondary)" }}>
          {expanded ? "-" : "+"}
        </div>
      </div>
    </button>
  );
}

function MobileAuthScreen({ launchNotice }: { launchNotice: string | null }) {
  const { signIn, signUp, resendSignupConfirmation } = useAuth();
  const RESEND_COOLDOWN_SECONDS = 30;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [awaitingConfirmation, setAwaitingConfirmation] = useState<{
    email: string;
    password: string;
    rememberMe: boolean;
  } | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (launchNotice) setNotice(launchNotice);
  }, [launchNotice]);

  useEffect(() => {
    if (!awaitingConfirmation || resendCooldown <= 0) return;
    const id = window.setInterval(() => {
      setResendCooldown((current) => (current <= 1 ? 0 : current - 1));
    }, 1_000);
    return () => window.clearInterval(id);
  }, [awaitingConfirmation, resendCooldown]);

  function enterAwaitingConfirmation(nextNotice: string, nextRememberMe: boolean) {
    setAwaitingConfirmation({
      email: email.trim(),
      password,
      rememberMe: nextRememberMe,
    });
    setNotice(nextNotice);
    setError("");
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
  }

  function leaveAwaitingConfirmation() {
    setAwaitingConfirmation(null);
    setNotice("");
    setError("");
    setResendCooldown(0);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    const result = isSignUp
      ? await signUp(email, password)
      : await signIn(email, password, true);
    if (!result.ok) {
      if (result.kind === "email_not_confirmed") {
        enterAwaitingConfirmation("Check your email to continue.", true);
      } else {
        setError(result.message);
      }
    } else if (isSignUp) {
      enterAwaitingConfirmation("Check your email to finish creating your account.", true);
    }
    setLoading(false);
  }

  async function handleResend() {
    const resendEmail = awaitingConfirmation?.email ?? email.trim();
    if (!resendEmail || resendCooldown > 0) return;
    setLoading(true);
    setError("");
    const result = await resendSignupConfirmation(resendEmail);
    if (result.ok) {
      setNotice("Confirmation email sent.");
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    }
    else setError(result.message);
    setLoading(false);
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg-auth-shell)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
      boxSizing: "border-box",
    }}>
      <form
        onSubmit={handleSubmit}
        style={{ ...cardStyle(), width: "100%", maxWidth: 430, padding: 24 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
          <img src="/icon.png" alt="Jot" style={{ width: 58, height: 58, borderRadius: 16 }} />
          <div>
            <div style={{ fontSize: 30, fontWeight: 800, color: "var(--text-primary)" }}>Jot</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
              {awaitingConfirmation ? "Confirm your email to continue" : isSignUp ? "Create your mobile workspace" : "Sign in to your daily flow"}
            </div>
          </div>
        </div>

        {awaitingConfirmation ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ ...cardStyle(), padding: 14, borderRadius: 18 }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Awaiting confirmation for</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{awaitingConfirmation.email}</div>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              style={inputStyle()}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              style={inputStyle()}
            />
          </div>
        )}

        {error && (
          <div style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 12,
            background: "rgba(220,38,38,0.08)",
            color: "#b91c1c",
            fontSize: 13,
          }}>
            {error}
          </div>
        )}
        {notice && (
          <div style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 12,
            background: "rgba(22,163,74,0.10)",
            color: "#166534",
            fontSize: 13,
          }}>
            {notice}
          </div>
        )}

        <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
          {awaitingConfirmation ? (
            <button
              type="button"
              onClick={() => { void handleResend(); }}
              disabled={loading || resendCooldown > 0}
              style={buttonStyle("primary")}
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Send confirmation again"}
            </button>
          ) : (
            <button type="submit" disabled={loading} style={buttonStyle("primary")}>
              {loading ? "Working..." : isSignUp ? "Create account" : "Sign in"}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (awaitingConfirmation) {
                leaveAwaitingConfirmation();
                return;
              }
              setIsSignUp((v) => !v);
            }}
            style={buttonStyle()}
          >
            {awaitingConfirmation ? "Back" : isSignUp ? "I already have an account" : "Create a new account"}
          </button>
        </div>
      </form>
    </div>
  );
}

function TaskEditor({
  task,
  projects,
  onClose,
  onSave,
  onComplete,
  onDelete,
}: {
  task: TaskWithTags;
  projects: Project[];
  onClose: () => void;
  onSave: (fields: Partial<Pick<Task, "title" | "due_date" | "due_time" | "priority" | "project_id" | "notes">>) => Promise<void>;
  onComplete: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [title, setTitle] = useState(task.title);
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [dueTime, setDueTime] = useState(task.due_time ?? "");
  const [link, setLink] = useState(task.notes ?? "");
  const [priority, setPriority] = useState<Task["priority"]>(task.priority);
  const [projectId, setProjectId] = useState(task.project_id ?? "");
  const [busyAction, setBusyAction] = useState<"save" | "complete" | "delete" | null>(null);
  const saving = busyAction !== null;

  async function handleSave() {
    setBusyAction("save");
    try {
      await onSave({
        title: title.trim() || task.title,
        due_date: dueDate || null,
        due_time: dueTime || null,
        notes: normalizeTaskLink(link),
        priority,
        project_id: projectId || null,
      });
      onClose();
    } finally {
      setBusyAction(null);
    }
  }

  async function handleComplete() {
    setBusyAction("complete");
    try {
      await onSave({
        title: title.trim() || task.title,
        due_date: dueDate || null,
        due_time: dueTime || null,
        notes: normalizeTaskLink(link),
        priority,
        project_id: projectId || null,
      });
      await onComplete();
      onClose();
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDelete() {
    setBusyAction("delete");
    try {
      await onDelete();
      onClose();
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(15, 23, 42, 0.35)",
      zIndex: 30,
      display: "flex",
      alignItems: "flex-end",
    }}>
      <div style={{
        ...cardStyle(),
        width: "100%",
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        padding: 20,
        boxSizing: "border-box",
        maxHeight: "88vh",
        overflow: "auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>Review task</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
              Check the details, make any changes you want, then save.
            </div>
          </div>
          <button onClick={onClose} style={{ ...buttonStyle(), padding: "8px 12px" }}>Close</button>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle()} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 10 }}>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle()} />
            <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} style={inputStyle()} />
          </div>
          <select value={priority} onChange={(e) => setPriority(e.target.value as Task["priority"])} style={inputStyle()}>
            <option value="none">No priority</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Link"
              style={inputStyle()}
            />
            <button
              type="button"
              onClick={() => {
                const url = normalizeTaskLink(link);
                if (url) void shellOpen(url);
              }}
              disabled={!normalizeTaskLink(link)}
              style={{ ...buttonStyle(), opacity: normalizeTaskLink(link) ? 1 : 0.45 }}
            >
              Open
            </button>
          </div>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle()}>
            <option value="">No project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </div>

        <div style={{
          position: "sticky",
          bottom: -20,
          marginTop: 18,
          paddingTop: 14,
          background: "var(--surface-glass-fade)",
        }}>
          <div style={{ display: "grid", gap: 10 }}>
            <button disabled={saving} onClick={handleSave} style={{ ...buttonStyle("primary"), width: "100%", padding: "14px 16px" }}>
              {busyAction === "save" ? "Saving..." : "Save task"}
            </button>
            <button disabled={saving} onClick={handleComplete} style={buttonStyle()}>
              {busyAction === "complete" ? "Completing..." : "Mark complete"}
            </button>
            <button disabled={saving} onClick={handleDelete} style={buttonStyle("danger")}>
              {busyAction === "delete" ? "Deleting..." : "Delete task"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskSection({
  title,
  subtitle,
  tasks,
  projects,
  loading,
  swipeEnabled = false,
  emptyActionLabel,
  onEmptyAction,
  onComplete,
  onOpen,
}: {
  title: string;
  subtitle: string;
  tasks: TaskWithTags[];
  projects: Project[];
  loading: boolean;
  swipeEnabled?: boolean;
  emptyActionLabel?: string;
  onEmptyAction?: () => Promise<void> | void;
  onComplete: (id: string) => Promise<void>;
  onOpen: (task: TaskWithTags) => void;
}) {
  const grouped = tasks.reduce<Record<string, TaskWithTags[]>>((acc, task) => {
    const key = sectionLabel(task.due_date);
    (acc[key] ||= []).push(task);
    return acc;
  }, {});

  return (
    <div data-no-tab-swipe="true" style={{ ...cardStyle(), padding: 14 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>{subtitle}</div>
        {swipeEnabled && (
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 6 }}>
            Swipe right to complete, left to edit.
          </div>
        )}
      </div>

      {loading && <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Refreshing...</div>}
      {!loading && tasks.length === 0 && (
        <div style={{ display: "grid", gap: 10, padding: "10px 4px" }}>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Nothing here right now.
          </div>
          {emptyActionLabel && onEmptyAction && (
            <button onClick={() => void onEmptyAction()} style={{ ...buttonStyle(), justifySelf: "start" }}>
              {emptyActionLabel}
            </button>
          )}
        </div>
      )}

      {!loading && Object.entries(grouped).map(([label, bucket]) => (
        <div key={label} style={{ marginTop: 10 }}>
          <div style={{
            fontSize: 11,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--text-tertiary)",
            padding: "0 6px 4px",
          }}>
            {label}
          </div>
          <div>
            {bucket.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                projects={projects}
                swipeEnabled={swipeEnabled}
                onSwipeLeft={() => onOpen(task)}
                onSwipeRight={() => void onComplete(task.id)}
                onComplete={() => void onComplete(task.id)}
                onClick={() => onOpen(task)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ProjectCard({
  project,
  taskCount,
  area,
  selected,
  onSelect,
}: {
  project: Project;
  taskCount: number;
  area: Area | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const accent = projectColor(project.id);
  return (
    <button
      onClick={onSelect}
      style={{
        width: "100%",
        textAlign: "left",
        padding: 14,
        borderRadius: 18,
        background: selected ? `${accent}18` : "var(--surface-glass-strong)",
        border: `1px solid ${selected ? `${accent}33` : "var(--border-subtle)"}`,
        display: "flex",
        gap: 12,
        alignItems: "center",
      }}
    >
      <div style={{
        width: 14,
        height: 44,
        borderRadius: 999,
        background: accent,
        flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{project.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {taskCount} active task{taskCount === 1 ? "" : "s"}
          </span>
          {area && (
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              color: "var(--text-secondary)",
              background: "var(--surface-glass-soft)",
              borderRadius: 999,
              padding: "4px 8px",
            }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: spaceColor(area.id) }} />
              {area.name}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function CaptureComposer({
  projects,
  tags,
  autofocusToken,
  onCreated,
}: {
  projects: Project[];
  tags: Tag[];
  autofocusToken: number;
  onCreated: (task: TaskWithTags) => Promise<void>;
}) {
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const languageMode = loadNlpLanguageMode();

  const parsed = useMemo(
    () => input.trim() ? parseInput(input, projects, tags, { languageMode }) : null,
    [input, projects, tags, languageMode],
  );

  const dueLabel = friendlyDue(parsed?.dueDate ?? null, parsed?.dueTime ?? null);
  const recurrenceLabel = friendlyRecurrence(parsed?.recurrenceRule ?? null);

  useEffect(() => {
    if (!autofocusToken) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    window.setTimeout(() => {
      textarea.focus();
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    }, 40);
  }, [autofocusToken]);

  async function handleCreate() {
    if (!parsed || !parsed.title.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const { task } = await saveCreateTaskDraft(
        { createProject, createTask },
        {
          projects,
          title: parsed.title.trim(),
          projectId: parsed.project?.id ?? null,
          projectName: parsed.project?.name ?? parsed.suggestedProjectName ?? "",
          dueDate: parsed.dueDate,
          dueTime: parsed.dueTime,
          priority: parsed.priority,
          recurrenceRule: parsed.recurrenceRule,
          tagIds: parsed.tags.map((tag) => tag.id),
          canCreateProjectsAndTags: true,
        },
      );

      const draftTask: TaskWithTags = {
        ...task,
        tags: parsed.tags,
      };

      setInput("");
      await onCreated(draftTask);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Type something like: Review launch checklist tomorrow at 9"
        rows={4}
        style={{
          ...inputStyle(),
          minHeight: 112,
          resize: "vertical",
          lineHeight: 1.45,
        }}
      />

      <div style={{
        padding: 14,
        borderRadius: 18,
        background: "var(--surface-glass-strong)",
        border: "1px solid var(--border-subtle)",
        display: "grid",
        gap: 10,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>What Jot understood</div>
        {!parsed && (
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Preview updates as you type.
          </div>
        )}
        {parsed && (
          <>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.35 }}>
              {parsed.title}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {parsed.project && (
                <span style={pillStyle(true)}>#{parsed.project.name}</span>
              )}
              {!parsed.project && parsed.suggestedProjectName && (
                <span style={pillStyle(true)}>New project: {parsed.suggestedProjectName}</span>
              )}
              {dueLabel && (
                <span style={pillStyle(false)}>
                  {dueLabel}
                </span>
              )}
              {parsed.priority !== "none" && (
                <span style={pillStyle(false)}>
                  {parsed.priority} priority
                </span>
              )}
              {recurrenceLabel && (
                <span style={pillStyle(false)}>{recurrenceLabel}</span>
              )}
            </div>
          </>
        )}
      </div>

      {error && (
        <div style={{
          padding: "10px 12px",
          borderRadius: 12,
          background: "rgba(220,38,38,0.08)",
          color: "#b91c1c",
          fontSize: 13,
        }}>
          {error}
        </div>
      )}

      <button
        onClick={() => void handleCreate()}
        disabled={!parsed || !parsed.title.trim() || saving}
        style={{ ...buttonStyle("primary"), width: "100%" }}
      >
        {saving ? "Creating..." : "Continue to review"}
      </button>
    </div>
  );
}

function MobileUserScreen({
  currentSection,
  onSectionChange,
  areas,
  hiddenAreaIds,
  areaSchedules,
  onSchedulesChange,
  onHiddenChange,
  onAreasChange,
  signOut,
}: {
  currentSection: UserSectionId | null;
  onSectionChange: (section: UserSectionId | null) => void;
  areas: Area[];
  hiddenAreaIds: string[];
  areaSchedules: AreaScheduleMap;
  onSchedulesChange: (schedules: AreaScheduleMap) => void;
  onHiddenChange: (ids: string[]) => void;
  onAreasChange: () => Promise<void>;
  signOut: () => Promise<void>;
}) {
  const { user } = useAuth();

  if (!currentSection) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <UserSectionCard title="Spaces" subtitle="Choose which spaces are active on this device and keep work and life separate." onClick={() => onSectionChange("spaces")} />
        <UserSectionCard title="Sharing" subtitle="Invite people into a space and manage who has access." onClick={() => onSectionChange("sharing")} />
        <UserSectionCard title="Reminders" subtitle="Tune the daily pulse reminder and its timing." onClick={() => onSectionChange("reminders")} />
        <UserSectionCard title="Appearance" subtitle="Choose light, dark, or follow the phone automatically." onClick={() => onSectionChange("appearance")} />
        <UserSectionCard title="Capture" subtitle="Choose whether NLP should stay broad or only understand one language." onClick={() => onSectionChange("capture")} />
        <UserSectionCard title="Feedback" subtitle="Send ideas or bugs and follow what has been planned." onClick={() => onSectionChange("feedback")} />
        <UserSectionCard title="Account" subtitle="Password, sessions, and sign-out live here instead of the top bar." onClick={() => onSectionChange("account")} />
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <button onClick={() => onSectionChange(null)} style={{ ...buttonStyle(), justifySelf: "start" }}>
        Back
      </button>

      {currentSection === "spaces" && (
        <MobileSpacesSettings
          areas={areas}
          hiddenAreaIds={hiddenAreaIds}
          areaSchedules={areaSchedules}
          onSchedulesChange={onSchedulesChange}
          onHiddenChange={onHiddenChange}
          onAreasChange={onAreasChange}
        />
      )}
      {currentSection === "sharing" && (
        <MobileSharingSettings areas={areas} currentUserId={user?.id ?? ""} />
      )}
      {currentSection === "reminders" && (
        <MobileRemindersSettings />
      )}
      {currentSection === "appearance" && (
        <MobileAppearanceSettings />
      )}
      {currentSection === "capture" && (
        <MobileCaptureSettings />
      )}
      {currentSection === "feedback" && (
        <MobileFeedbackSettings currentUserId={user?.id ?? ""} />
      )}
      {currentSection === "account" && (
        <MobileAccountSettings userEmail={user?.email ?? null} signOut={signOut} />
      )}
    </div>
  );
}

function MobileAppearanceSettings() {
  const [theme, setTheme] = useState<AppThemePreference>(loadThemePreference);

  function selectTheme(next: AppThemePreference) {
    setTheme(next);
    saveThemePreference(next);
    applyThemePreference(next);
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ ...cardStyle(), padding: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>Appearance</div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.5 }}>
          Samsung and other Android devices can force strong contrast in odd ways. This lets you pin Jot to light or dark instead of relying on automatic detection.
        </div>
      </div>

      {([
        ["system", "System", "Follow the phone setting."],
        ["light", "Light", "Bright workspace with soft surfaces."],
        ["dark", "Dark", "Higher-contrast dark interface for mobile and desktop."],
      ] as const).map(([value, label, hint]) => {
        const active = theme === value;
        return (
          <button
            key={value}
            onClick={() => selectTheme(value)}
            style={{
              ...cardStyle(),
              padding: 16,
              textAlign: "left",
              border: `1px solid ${active ? "var(--accent)" : "var(--surface-border-accent)"}`,
              background: active ? "var(--accent-light)" : "var(--surface-glass)",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 800, color: active ? "var(--accent)" : "var(--text-primary)" }}>{label}</div>
            <div style={{ fontSize: 12, color: active ? "var(--accent)" : "var(--text-secondary)", marginTop: 6, lineHeight: 1.5 }}>
              {hint}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function MobileCaptureSettings() {
  const [languageMode, setLanguageMode] = useState<NlpLanguageMode>(loadNlpLanguageMode);

  function selectLanguageMode(next: NlpLanguageMode) {
    setLanguageMode(next);
    saveNlpLanguageMode(next);
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ ...cardStyle(), padding: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>Capture language</div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.5 }}>
          Keep quick capture strict. English only and Danish only avoid mixed-language parsing.
        </div>
      </div>

      {([
        ["auto", "Auto", "Use the current broad parser behavior."],
        ["en", "English only", "Only understand English date, time, recurrence, and priority phrases."],
        ["da", "Danish only", "Only understand Danish date, time, recurrence, and priority phrases."],
      ] as const).map(([value, label, hint]) => {
        const active = languageMode === value;
        return (
          <button
            key={value}
            onClick={() => selectLanguageMode(value)}
            style={{
              ...cardStyle(),
              padding: 16,
              textAlign: "left",
              border: `1px solid ${active ? "var(--accent)" : "var(--surface-border-accent)"}`,
              background: active ? "var(--accent-light)" : "var(--surface-glass)",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 800, color: active ? "var(--accent)" : "var(--text-primary)" }}>{label}</div>
            <div style={{ fontSize: 12, color: active ? "var(--accent)" : "var(--text-secondary)", marginTop: 6, lineHeight: 1.5 }}>
              {hint}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function MobileSpacesSettings({
  areas,
  hiddenAreaIds,
  areaSchedules,
  onSchedulesChange,
  onHiddenChange,
  onAreasChange,
}: {
  areas: Area[];
  hiddenAreaIds: string[];
  areaSchedules: AreaScheduleMap;
  onSchedulesChange: (schedules: AreaScheduleMap) => void;
  onHiddenChange: (ids: string[]) => void;
  onAreasChange: () => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [newName, setNewName] = useState("");
  const [defaultAreaId, setDefaultAreaId] = useState<string | null>(loadDefaultAreaId);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (defaultAreaId && !areas.some((area) => area.id === defaultAreaId)) {
      saveDefaultAreaId(null);
      setDefaultAreaId(null);
    }
  }, [areas, defaultAreaId]);

  function toggleVisibility(id: string) {
    onHiddenChange(hiddenAreaIds.includes(id) ? hiddenAreaIds.filter((x) => x !== id) : [...hiddenAreaIds, id]);
  }

  function updateSchedule(id: string, patch: Partial<AreaSchedule>) {
    const current = areaSchedules[id] ?? DEFAULT_AREA_SCHEDULE;
    onSchedulesChange({
      ...areaSchedules,
      [id]: { ...current, ...patch },
    });
  }

  function toggleDay(id: string, day: number) {
    const current = areaSchedules[id] ?? DEFAULT_AREA_SCHEDULE;
    const nextDays = current.days.includes(day)
      ? current.days.filter((value) => value !== day)
      : [...current.days, day].sort((a, b) => a - b);
    updateSchedule(id, { days: nextDays.length > 0 ? nextDays : DEFAULT_AREA_SCHEDULE.days });
  }

  function handleDefaultChange(id: string) {
    const next = defaultAreaId === id ? null : id;
    saveDefaultAreaId(next);
    setDefaultAreaId(next);
  }

  async function handleSaveEdit(id: string) {
    if (!editName.trim()) return;
    setBusy(true);
    await updateArea(id, { name: editName.trim() });
    setEditingId(null);
    setEditName("");
    await onAreasChange();
    setBusy(false);
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this space? Its projects and inbox tasks will move to another space.")) return;
    setBusy(true);
    await deleteArea(id);
    if (defaultAreaId === id) {
      saveDefaultAreaId(null);
      setDefaultAreaId(null);
    }
    onHiddenChange(hiddenAreaIds.filter((x) => x !== id));
    await onAreasChange();
    setBusy(false);
  }

  async function handleAdd() {
    if (!newName.trim()) return;
    setBusy(true);
    const created = await createArea(newName.trim());
    if (!defaultAreaId) {
      saveDefaultAreaId(created.id);
      setDefaultAreaId(created.id);
    }
    setNewName("");
    await onAreasChange();
    setBusy(false);
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ ...cardStyle(), padding: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>Spaces</div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.5 }}>
          Toggle which spaces are visible on this device. This is the mobile foundation for your work/life split.
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 8, lineHeight: 1.5 }}>
          The default space is used for new captures and projects when you do not name a project.
        </div>
      </div>

      {areas.map((area) => (
        <div key={area.id} style={{ ...cardStyle(), padding: 16 }}>
          {editingId === area.id ? (
            <div style={{ display: "grid", gap: 10 }}>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} style={inputStyle()} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => void handleSaveEdit(area.id)} disabled={busy || !editName.trim()} style={buttonStyle("primary")}>Save</button>
                <button onClick={() => setEditingId(null)} style={buttonStyle()}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Toggle on={!hiddenAreaIds.includes(area.id)} onToggle={() => toggleVisibility(area.id)} />
                <span style={{ width: 10, height: 10, borderRadius: 4, background: spaceColor(area.id), flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, opacity: hiddenAreaIds.includes(area.id) ? 0.5 : 1 }}>{area.name}</div>
                    {defaultAreaId === area.id && (
                      <span style={{ ...pillStyle(true), fontSize: 10, padding: "3px 7px" }}>Default</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                    {hiddenAreaIds.includes(area.id) ? "Always hidden on this device" : "Visible on this device"}
                  </div>
                </div>
                <button onClick={() => handleDefaultChange(area.id)} style={buttonStyle()}>
                  {defaultAreaId === area.id ? "Unset default" : "Set default"}
                </button>
                <button onClick={() => { setEditingId(area.id); setEditName(area.name); }} style={buttonStyle()}>Edit</button>
                <button onClick={() => void handleDelete(area.id)} disabled={busy} style={buttonStyle("danger")}>Delete</button>
              </div>

              <div style={{
                display: "grid",
                gap: 10,
                padding: 12,
                borderRadius: 16,
                background: "var(--surface-glass-soft)",
                border: "1px solid var(--border-subtle)",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>Use a schedule on this phone</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                      Hide this space outside the days and hours you choose on mobile.
                    </div>
                  </div>
                  <Toggle on={areaSchedules[area.id]?.enabled ?? false} onToggle={() => updateSchedule(area.id, { enabled: !(areaSchedules[area.id]?.enabled ?? false) })} />
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", opacity: areaSchedules[area.id]?.enabled ? 1 : 0.55 }}>
                  {WEEKDAY_OPTIONS.map((day) => {
                    const selected = (areaSchedules[area.id]?.days ?? DEFAULT_AREA_SCHEDULE.days).includes(day.id);
                    return (
                      <button
                        key={`${area.id}-${day.id}`}
                        onClick={() => toggleDay(area.id, day.id)}
                        disabled={!(areaSchedules[area.id]?.enabled ?? false)}
                        style={pillStyle(selected)}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, opacity: areaSchedules[area.id]?.enabled ? 1 : 0.55 }}>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 6 }}>From</div>
                    <input type="time" value={areaSchedules[area.id]?.start ?? DEFAULT_AREA_SCHEDULE.start} disabled={!(areaSchedules[area.id]?.enabled ?? false)} onChange={(e) => updateSchedule(area.id, { start: e.target.value })} style={inputStyle()} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 6 }}>Until</div>
                    <input type="time" value={areaSchedules[area.id]?.end ?? DEFAULT_AREA_SCHEDULE.end} disabled={!(areaSchedules[area.id]?.enabled ?? false)} onChange={(e) => updateSchedule(area.id, { end: e.target.value })} style={inputStyle()} />
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                  Uses your phone&apos;s time format.
                </div>
              </div>
            </div>
          )}
        </div>
      ))}

      <div style={{ ...cardStyle(), padding: 16, display: "grid", gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>Add space</div>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New space name" style={inputStyle()} />
        <button onClick={() => void handleAdd()} disabled={busy || !newName.trim()} style={buttonStyle("primary")}>
          Add space
        </button>
      </div>

    </div>
  );
}

function MobileSharingSettings({ areas, currentUserId }: { areas: Area[]; currentUserId: string }) {
  const ownedAreas = areas.filter((area) => area.user_id === currentUserId);
  const [selectedAreaId, setSelectedAreaId] = useState<string>(ownedAreas[0]?.id ?? "");
  const [members, setMembers] = useState<Array<{ id: string; invited_email: string; status: "pending" | "accepted" }>>([]);
  const [pendingInvites, setPendingInvites] = useState<Array<{ id: string; area_id: string; invited_email: string }>>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetchPendingInvites().then(setPendingInvites).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedAreaId) return;
    void fetchAreaMembers(selectedAreaId).then(setMembers).catch(() => {});
  }, [selectedAreaId]);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    if (!selectedAreaId || !inviteEmail.trim()) return;
    setBusy(true);
    setError("");
    const err = await inviteMember(selectedAreaId, inviteEmail.trim());
    if (err) {
      setError(err);
    } else {
      setInviteEmail("");
      const nextMembers = await fetchAreaMembers(selectedAreaId);
      setMembers(nextMembers);
    }
    setBusy(false);
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ ...cardStyle(), padding: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>Sharing</div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6 }}>
          Invite people into a space and keep shared areas tidy.
        </div>
      </div>

      {pendingInvites.map((invite) => (
        <div key={invite.id} style={{ ...cardStyle(), padding: 16 }}>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>
            Invited to space <strong>{invite.area_id}</strong>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => void acceptInvite(invite.id).then(() => setPendingInvites((prev) => prev.filter((item) => item.id !== invite.id)))} style={buttonStyle("primary")}>Accept</button>
            <button onClick={() => void declineInvite(invite.id).then(() => setPendingInvites((prev) => prev.filter((item) => item.id !== invite.id)))} style={buttonStyle()}>Decline</button>
          </div>
        </div>
      ))}

      {ownedAreas.length > 0 ? (
        <>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
            {ownedAreas.map((area) => (
              <button key={area.id} onClick={() => setSelectedAreaId(area.id)} style={pillStyle(selectedAreaId === area.id)}>
                {area.name}
              </button>
            ))}
          </div>

          <form onSubmit={handleInvite} style={{ ...cardStyle(), padding: 16, display: "grid", gap: 10 }}>
            <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="Invite by email" style={inputStyle()} />
            {error && <div style={{ fontSize: 12, color: "#b91c1c" }}>{error}</div>}
            <button type="submit" disabled={busy || !inviteEmail.trim()} style={buttonStyle("primary")}>
              {busy ? "Sending..." : "Invite"}
            </button>
          </form>

          {members.map((member) => (
            <div key={member.id} style={{ ...cardStyle(), padding: 16, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{member.invited_email}</div>
                <div style={{ fontSize: 11, color: member.status === "accepted" ? "#16a34a" : "#d97706", marginTop: 4 }}>
                  {member.status === "accepted" ? "Active" : "Pending"}
                </div>
              </div>
              <button onClick={() => void removeAreaMember(member.id).then(() => setMembers((prev) => prev.filter((item) => item.id !== member.id)))} style={buttonStyle("danger")}>
                Remove
              </button>
            </div>
          ))}
        </>
      ) : (
        <div style={{ ...cardStyle(), padding: 18, fontSize: 13, color: "var(--text-secondary)" }}>
          You have no spaces to share yet. Create one in Spaces first.
        </div>
      )}
    </div>
  );
}

function MobileRemindersSettings() {
  const [enabled, setEnabled] = useState(localStorage.getItem("jot_reminder_enabled") !== "false");
  const [time, setTime] = useState(localStorage.getItem("jot_reminder_time") ?? "08:00");
  const [duration, setDuration] = useState(localStorage.getItem("jot_reminder_duration") ?? "180");

  function save(patch: { enabled?: boolean; time?: string; duration?: string }) {
    const nextEnabled = patch.enabled ?? enabled;
    const nextTime = patch.time ?? time;
    const nextDuration = patch.duration ?? duration;
    if (nextEnabled) localStorage.removeItem("jot_reminder_enabled");
    else localStorage.setItem("jot_reminder_enabled", "false");
    localStorage.setItem("jot_reminder_time", nextTime);
    localStorage.setItem("jot_reminder_duration", nextDuration);
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ ...cardStyle(), padding: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>Reminders</div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6 }}>
          Control the daily pulse reminder on mobile.
        </div>
      </div>

      <div style={{ ...cardStyle(), padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Daily reminder</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>Show a pulse reminder each day.</div>
        </div>
        <Toggle on={enabled} onToggle={() => { const next = !enabled; setEnabled(next); save({ enabled: next }); }} />
      </div>

      <div style={{ ...cardStyle(), padding: 16, display: "grid", gap: 10, opacity: enabled ? 1 : 0.55 }}>
        <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Reminder time</label>
        <input type="time" value={time} onChange={(e) => { setTime(e.target.value); save({ time: e.target.value }); }} disabled={!enabled} style={inputStyle()} />
        <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Countdown duration</label>
        <select value={duration} onChange={(e) => { setDuration(e.target.value); save({ duration: e.target.value }); }} disabled={!enabled} style={inputStyle()}>
          <option value="60">1 minute</option>
          <option value="120">2 minutes</option>
          <option value="180">3 minutes</option>
          <option value="300">5 minutes</option>
        </select>
      </div>
    </div>
  );
}

function MobileFeedbackSettings({ currentUserId }: { currentUserId: string }) {
  const [items, setItems] = useState<Array<{ id: string; user_id: string; text: string; status: "new" | "reviewing" | "planned" | "in_progress" | "done" | "declined"; admin_note: string | null; created_at: string }>>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchFeedback().then(setItems).catch(() => {});
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const item = await submitFeedback(text.trim());
      setItems((prev) => [item, ...prev]);
      setText("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <form onSubmit={handleSubmit} style={{ ...cardStyle(), padding: 16, display: "grid", gap: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>Feedback</div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Describe your idea or bug" rows={4} style={{ ...inputStyle(), minHeight: 100, resize: "vertical" }} />
        <button type="submit" disabled={busy || !text.trim()} style={buttonStyle("primary")}>
          {busy ? "Sending..." : "Submit"}
        </button>
      </form>

      {items.map((item) => (
        <div key={item.id} style={{ ...cardStyle(), padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)" }}>{item.status.replace("_", " ")}</span>
            {item.user_id === currentUserId && <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>You</span>}
          </div>
          <div style={{ fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>{item.text}</div>
          {item.admin_note && <div style={{ fontSize: 12, color: "var(--accent)", marginTop: 8 }}>{item.admin_note}</div>}
        </div>
      ))}
    </div>
  );
}

function MobileAccountSettings({
  userEmail,
  signOut,
}: {
  userEmail: string | null;
  signOut: () => Promise<void>;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPwError("");
    setPwSuccess(false);
    if (newPassword.length < 8) {
      setPwError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPw) {
      setPwError("Passwords do not match.");
      return;
    }
    setBusy(true);
    const err = await updatePassword(newPassword);
    if (err) setPwError(err);
    else {
      setPwSuccess(true);
      setNewPassword("");
      setConfirmPw("");
    }
    setBusy(false);
  }

  async function handleSignOutEverywhere() {
    if (!window.confirm("This will sign you out on all devices. Continue?")) return;
    setSignOutBusy(true);
    await signOutEverywhere();
    await signOut();
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ ...cardStyle(), padding: 16 }}>
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Signed in as</div>
        <div style={{ fontSize: 15, fontWeight: 800, marginTop: 6 }}>{userEmail ?? "—"}</div>
      </div>

      <form onSubmit={handlePasswordSubmit} style={{ ...cardStyle(), padding: 16, display: "grid", gap: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>Change password</div>
        <input type="password" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={inputStyle()} />
        <input type="password" placeholder="Confirm new password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} style={inputStyle()} />
        {pwError && <div style={{ fontSize: 12, color: "#b91c1c" }}>{pwError}</div>}
        {pwSuccess && <div style={{ fontSize: 12, color: "#16a34a" }}>Password updated.</div>}
        <button type="submit" disabled={busy || !newPassword} style={buttonStyle("primary")}>
          {busy ? "Saving..." : "Update password"}
        </button>
      </form>

      <div style={{ ...cardStyle(), padding: 16, display: "grid", gap: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>Sessions</div>
        <button onClick={() => void handleSignOutEverywhere()} disabled={signOutBusy} style={buttonStyle("danger")}>
          {signOutBusy ? "Signing out..." : "Sign out everywhere"}
        </button>
        <button onClick={() => void signOut()} style={buttonStyle()}>
          Sign out on this device
        </button>
      </div>
    </div>
  );
}

export default function MobileApp({ launchNotice = null }: { launchNotice?: string | null }) {
  const { loading, user, signOut } = useAuth();
  const [tab, setTab] = useState<TabId>("pulse");
  const [captureAutofocusToken, setCaptureAutofocusToken] = useState(0);
  const [userSection, setUserSection] = useState<UserSectionId | null>(null);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("today");
  const [areas, setAreas] = useState<Area[]>([]);
  const [firstAreaName, setFirstAreaName] = useState("Personal");
  const [firstAreaBusy, setFirstAreaBusy] = useState(false);
  const [firstAreaError, setFirstAreaError] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [tasks, setTasks] = useState<TaskWithTags[]>([]);
  const [hiddenAreaIds, setHiddenAreaIds] = useState<string[]>(() => loadHiddenAreas());
  const [areaSchedules, setAreaSchedules] = useState<AreaScheduleMap>(() => loadAreaSchedules());
  const [expandedAreaId, setExpandedAreaId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<TaskWithTags | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [pulling, setPulling] = useState(false);
  const [tabSwipeOffset, setTabSwipeOffset] = useState(0);
  const [tabSwipeAnimating, setTabSwipeAnimating] = useState(false);
  const touchStartYRef = useRef<number | null>(null);
  const triggeredPullRef = useRef(false);
  const tabSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const today = todayISO();

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoadingData(true);
    setError(null);
    try {
      const [areaRows, projectRows, tagRows, taskRows] = await Promise.all([
        fetchAreas(),
        fetchProjects(),
        fetchTags(),
        fetchAllTasks(),
      ]);
      setAreas(areaRows);
      setProjects(projectRows);
      setTags(tagRows);
      setTasks(sortTasksBySchedule(taskRows));
      syncWidgets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoadingData(false);
    }
  }, [user]);

  const consumeLaunchAction = useCallback(async () => {
    try {
      const action = await invoke<"capture" | "voice" | "pulse" | null>("take_mobile_launch_action");
      if (!action) return;
      if (action === "capture" || action === "voice") {
        setTab("capture");
        setUserSection(null);
        setCaptureAutofocusToken((value) => value + 1);
        return;
      }
      if (action === "pulse") {
        setTab("pulse");
        setUserSection(null);
      }
    } catch {
      // Desktop and non-Android targets can simply ignore launch actions.
    }
  }, []);

  useEffect(() => {
    if (user) void loadData();
  }, [user, loadData]);

  useEffect(() => {
    if (!user) return;
    void consumeLaunchAction();
  }, [user, consumeLaunchAction]);

  useEffect(() => {
    if (!user) return;

    const handleResume = () => {
      if (document.visibilityState === "visible") void consumeLaunchAction();
    };

    window.addEventListener("focus", handleResume);
    document.addEventListener("visibilitychange", handleResume);
    return () => {
      window.removeEventListener("focus", handleResume);
      document.removeEventListener("visibilitychange", handleResume);
    };
  }, [user, consumeLaunchAction]);

  useEffect(() => {
    saveHiddenAreas(hiddenAreaIds);
  }, [hiddenAreaIds]);

  useEffect(() => {
    saveAreaSchedules(areaSchedules);
  }, [areaSchedules]);

  async function handleCreateFirstArea() {
    if (!firstAreaName.trim()) return;
    setFirstAreaBusy(true);
    setFirstAreaError("");
    try {
      const session = await getSession();
      if (!session) {
        setFirstAreaError("Your session is not ready yet. Please sign out and sign back in now that your email is confirmed.");
        return;
      }
      const area = await createArea(firstAreaName.trim());
      saveDefaultAreaId(area.id);
      await loadData();
    } catch (error) {
      const message = errorMessage(error);
      if (message.includes("42501") || message.toLowerCase().includes("row-level security")) {
        setFirstAreaError("Jot could not create your first space because the session was rejected by the server. Please sign out and sign back in, then try again.");
      } else if (message.toLowerCase().includes("not authenticated")) {
        setFirstAreaError("You need to be signed in before creating your first space. Please sign in again and retry.");
      } else {
        setFirstAreaError(message);
      }
    } finally {
      setFirstAreaBusy(false);
    }
  }

  const inactiveScheduledAreaIds = useMemo(
    () => areas.filter((area) => !isAreaVisibleNow(areaSchedules[area.id])).map((area) => area.id),
    [areas, areaSchedules],
  );
  const hiddenOrInactiveAreaIds = useMemo(
    () => [...new Set([...hiddenAreaIds, ...inactiveScheduledAreaIds])],
    [hiddenAreaIds, inactiveScheduledAreaIds],
  );
  const visibleAreas = useMemo(
    () => areas.filter((area) => !hiddenOrInactiveAreaIds.includes(area.id)),
    [areas, hiddenOrInactiveAreaIds],
  );
  const visibleProjects = useMemo(
    () => filterVisibleProjects(projects, hiddenOrInactiveAreaIds),
    [projects, hiddenOrInactiveAreaIds],
  );
  const visibleTasks = useMemo(
    () => filterVisibleTasks(tasks, projects, hiddenOrInactiveAreaIds),
    [tasks, projects, hiddenOrInactiveAreaIds],
  );

  const pulseTasks = useMemo(
    () => visibleTasks.filter((task) => task.due_date && task.due_date <= today),
    [visibleTasks, today],
  );
  const dueTodayCount = useMemo(
    () => visibleTasks.filter((task) => task.due_date === today).length,
    [visibleTasks, today],
  );
  const overdueCount = useMemo(
    () => visibleTasks.filter((task) => !!task.due_date && task.due_date < today).length,
    [visibleTasks, today],
  );
  const inboxTasks = useMemo(
    () => visibleTasks.filter((task) => !task.project_id),
    [visibleTasks],
  );
  const upcomingTasks = useMemo(
    () => visibleTasks.filter((task) => !!task.due_date && task.due_date > today),
    [visibleTasks, today],
  );
  const filteredTasks = useMemo(() => {
    if (taskFilter === "today") return pulseTasks;
    if (taskFilter === "inbox") return inboxTasks;
    if (taskFilter === "upcoming") return upcomingTasks;
    return visibleTasks;
  }, [taskFilter, pulseTasks, inboxTasks, upcomingTasks, visibleTasks]);

  const projectTaskCount = useMemo(() => countTasksByProject(visibleTasks), [visibleTasks]);
  const selectedProjectTasks = useMemo(
    () => visibleTasks.filter((task) => task.project_id === selectedProjectId),
    [visibleTasks, selectedProjectId],
  );
  const areaTaskCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const task of visibleTasks) {
      const effectiveAreaId = task.area_id ?? (task.project_id ? projects.find((project) => project.id === task.project_id)?.area_id ?? null : null);
      if (!effectiveAreaId) continue;
      counts[effectiveAreaId] = (counts[effectiveAreaId] ?? 0) + 1;
    }
    return counts;
  }, [visibleTasks, projects]);
  const areaProjectCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const project of visibleProjects) {
      if (!project.area_id) continue;
      counts[project.area_id] = (counts[project.area_id] ?? 0) + 1;
    }
    return counts;
  }, [visibleProjects]);
  const pulseNavTone: "good" | "today" | "overdue" = overdueCount > 0 ? "overdue" : dueTodayCount > 0 ? "today" : "good";
  const pulseNavCount = overdueCount + dueTodayCount + upcomingTasks.length;

  useEffect(() => {
    if (expandedAreaId && !visibleAreas.find((area) => area.id === expandedAreaId)) {
      setExpandedAreaId(visibleAreas[0]?.id ?? null);
      return;
    }
    if (!expandedAreaId && visibleAreas[0]) setExpandedAreaId(visibleAreas[0].id);
  }, [expandedAreaId, visibleAreas]);

  async function refreshAfterMutation() {
    await loadData();
    syncWidgets();
  }

  const startPull = useCallback((clientY: number) => {
    if (window.scrollY > 0 || loadingData) return;
    touchStartYRef.current = clientY;
    triggeredPullRef.current = false;
    setPulling(true);
  }, [loadingData]);

  const movePull = useCallback((clientY: number) => {
    const start = touchStartYRef.current;
    if (start == null) return;
    const delta = clientY - start;
    if (delta <= 0) {
      setPullDistance(0);
      return;
    }
    const dampened = Math.min(delta * 0.45, 92);
    setPullDistance(dampened);
    if (dampened > 68) triggeredPullRef.current = true;
  }, []);

  const endPull = useCallback(() => {
    if (touchStartYRef.current == null) return;
    const shouldRefresh = triggeredPullRef.current;
    touchStartYRef.current = null;
    triggeredPullRef.current = false;
    setPulling(false);
    setPullDistance(0);
    if (shouldRefresh) void loadData();
  }, [loadData]);

  function handleTabSwipeStart(e: React.TouchEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.closest("[data-no-tab-swipe='true']")) return;
    if (target.closest("button, input, textarea, select, a")) return;
    setTabSwipeAnimating(false);
    tabSwipeStartRef.current = {
      x: e.changedTouches[0].clientX,
      y: e.changedTouches[0].clientY,
    };
  }

  function handleTabSwipeMove(e: React.TouchEvent<HTMLDivElement>) {
    const start = tabSwipeStartRef.current;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < 10 || Math.abs(dx) <= Math.abs(dy) * 1.1) return;
    setTabSwipeOffset(Math.max(-120, Math.min(120, dx * 0.55)));
  }

  function handleTabSwipeEnd(e: React.TouchEvent<HTMLDivElement>) {
    const start = tabSwipeStartRef.current;
    tabSwipeStartRef.current = null;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) <= Math.abs(dy) * 1.2) return;
    const currentIndex = TAB_ORDER.indexOf(tab);
    if (currentIndex === -1) return;
    const nextIndex = dx < 0 ? currentIndex + 1 : currentIndex - 1;
    const nextTab = TAB_ORDER[nextIndex];
    setTabSwipeAnimating(true);
    if (!nextTab) {
      setTabSwipeOffset(0);
      return;
    }
    setTabSwipeOffset(dx < 0 ? -140 : 140);
    window.setTimeout(() => {
      setTab(nextTab);
      if (nextTab !== "user") setUserSection(null);
      setTabSwipeOffset(0);
    }, 140);
  }

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => startPull(e.touches[0].clientY);
    const handleTouchMove = (e: TouchEvent) => movePull(e.touches[0].clientY);
    const handleTouchEnd = () => endPull();

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [startPull, movePull, endPull]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
        Loading...
      </div>
    );
  }

  if (!user) return <MobileAuthScreen launchNotice={launchNotice} />;

  if (!loadingData && areas.length === 0) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "var(--bg-shell)",
        color: "var(--text-primary)",
        display: "grid",
        placeItems: "center",
        padding: 20,
        boxSizing: "border-box",
      }}>
        <div style={{ ...cardStyle(), width: "100%", maxWidth: 420, padding: 22, display: "grid", gap: 14 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.05 }}>Welcome to Jot</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8, lineHeight: 1.6 }}>
              Projects and inbox tasks live inside spaces. Create your first one to start using Jot.
            </div>
          </div>
          {firstAreaError && (
            <div style={{ padding: "10px 12px", borderRadius: 14, background: "rgba(220,38,38,0.08)", color: "#b91c1c", fontSize: 12, lineHeight: 1.5 }}>
              {firstAreaError}
            </div>
          )}
          <input
            autoFocus
            value={firstAreaName}
            onChange={(e) => setFirstAreaName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && firstAreaName.trim() && !firstAreaBusy) void handleCreateFirstArea(); }}
            placeholder="e.g. Personal, Work, Side Project..."
            style={inputStyle()}
          />
          <button
            onClick={() => void handleCreateFirstArea()}
            disabled={!firstAreaName.trim() || firstAreaBusy}
            style={{ ...buttonStyle("primary"), opacity: !firstAreaName.trim() || firstAreaBusy ? 0.7 : 1 }}
          >
            {firstAreaBusy ? "Creating..." : "Create first space"}
          </button>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            You can rename it later and add more spaces in settings.
          </div>
        </div>
      </div>
    );
  }

  const activeProject = visibleProjects.find((project) => project.id === selectedProjectId) ?? null;

  return (
    <div
      onTouchStart={handleTabSwipeStart}
      onTouchMove={handleTabSwipeMove}
      onTouchEnd={handleTabSwipeEnd}
      style={{
      minHeight: "100vh",
      background: "var(--bg-shell)",
      color: "var(--text-primary)",
      paddingBottom: 112,
      boxSizing: "border-box",
      position: "relative",
    }}>
      <div style={{
        height: pullDistance,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        transition: pulling ? "none" : "height 180ms ease",
        overflow: "hidden",
      }}>
        <div style={{
          marginBottom: 10,
          padding: "7px 12px",
          borderRadius: 999,
          background: "var(--surface-glass)",
          border: "1px solid rgba(91,91,214,0.14)",
          color: triggeredPullRef.current ? "var(--accent)" : "var(--text-secondary)",
          fontSize: 12,
          fontWeight: 700,
          boxShadow: "0 10px 24px rgba(38, 38, 72, 0.08)",
        }}>
          {loadingData ? "Refreshing..." : pullDistance > 68 ? "Release to refresh" : "Pull to refresh"}
        </div>
      </div>
      <div style={{
        transform: `translateX(${tabSwipeOffset}px)`,
        transition: tabSwipeAnimating ? "transform 180ms ease" : "none",
        willChange: "transform",
      }}>
      <div style={{ padding: "18px 16px 14px" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-secondary)" }}>{prettyToday()}</div>
          <div style={{ fontSize: 38, lineHeight: 1, fontWeight: 900, marginTop: 6 }}>Jot</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8 }}>
            {tab === "pulse" ? "Today's focus" :
             tab === "tasks" ? "Your active task list" :
             tab === "projects" ? "Projects and spaces" :
             tab === "capture" ? "Capture ideas and tasks" :
             "Your account, spaces, and settings"}
          </div>
        </div>

        {error && (
          <div style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 14,
            background: "rgba(220,38,38,0.08)",
            color: "#b91c1c",
            fontSize: 13,
          }}>
            {error}
          </div>
        )}
        {launchNotice && (
          <div style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 14,
            background: "rgba(22,163,74,0.10)",
            color: "#166534",
            fontSize: 13,
          }}>
            {launchNotice}
          </div>
        )}
      </div>

      <div style={{ padding: "0 16px", display: "grid", gap: 14 }}>
        {tab === "pulse" && (
          <>
            <div style={{ ...cardStyle(), padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Morning summary</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                    Today&apos;s focus across overdue and due-today tasks.
            </div>
                </div>
                <button onClick={() => setTab("capture")} style={{ ...buttonStyle("primary"), padding: "10px 12px" }}>
                  New task
                </button>
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
                <MetricCard label="Due today" value={dueTodayCount} tone="violet" />
                <MetricCard label="Overdue" value={overdueCount} tone="sand" />
                <MetricCard label="Projects active" value={visibleProjects.length} tone="mint" />
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 14, overflowX: "auto" }}>
                <button onClick={() => setTab("tasks")} style={pillStyle(true)}>Review tasks</button>
                <button onClick={() => setTab("capture")} style={pillStyle()}>Quick capture</button>
                <button onClick={() => void loadData()} style={pillStyle()}>Sync now</button>
              </div>
            </div>

            <TaskSection
              title="Pulse tasks"
              subtitle="Due today and overdue"
              tasks={pulseTasks}
              projects={visibleProjects}
              loading={loadingData}
              swipeEnabled
              onComplete={async (id) => { await completeTask(id); await refreshAfterMutation(); }}
              onOpen={(task) => setEditingTask(task)}
            />
          </>
        )}

        {tab === "tasks" && (
          <>
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
              {[
                ["today", `Today ${pulseTasks.length}`],
                ["inbox", `Inbox ${inboxTasks.length}`],
                ["upcoming", `Upcoming ${upcomingTasks.length}`],
                ["all", `All ${visibleTasks.length}`],
              ].map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTaskFilter(id as TaskFilter)}
                  style={pillStyle(taskFilter === id)}
                >
                  {label}
                </button>
              ))}
            </div>

            <TaskSection
              title="Task list"
              subtitle="Tap a task to edit it. Tap the circle to complete it."
              tasks={filteredTasks}
              projects={visibleProjects}
              loading={loadingData}
              swipeEnabled
              onComplete={async (id) => { await completeTask(id); await refreshAfterMutation(); }}
              onOpen={(task) => setEditingTask(task)}
            />
          </>
        )}

        {tab === "projects" && (
          <>
            {areas.length === 0 && !loadingData && (
              <div style={{ ...cardStyle(), padding: 18, display: "grid", gap: 10 }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>Create your first space</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  Projects live inside spaces. Add one space first, then captures and new projects will have a home.
                </div>
                <button onClick={() => { setTab("user"); setUserSection("spaces"); }} style={buttonStyle("primary")}>
                  Add a space
                </button>
              </div>
            )}

            {visibleAreas.length > 0 && (
              <div style={{ display: "grid", gap: 10 }}>
                {visibleAreas.map((area) => (
                  <div key={area.id} style={{ display: "grid", gap: 10 }}>
                    <SpaceCard
                      area={area}
                      projectCount={areaProjectCount[area.id] ?? 0}
                      taskCount={areaTaskCount[area.id] ?? 0}
                      expanded={expandedAreaId === area.id}
                      onToggle={() => {
                        setExpandedAreaId((current) => current === area.id ? null : area.id);
                        setSelectedProjectId(null);
                      }}
                    />
                    {expandedAreaId === area.id && (
                      <div style={{ display: "grid", gap: 10, paddingLeft: 10 }}>
                        {visibleProjects.filter((project) => project.area_id === area.id).map((project) => (
                          <ProjectCard
                            key={project.id}
                            project={project}
                            taskCount={projectTaskCount[project.id] ?? 0}
                            area={area}
                            selected={project.id === selectedProjectId}
                            onSelect={() => setSelectedProjectId(project.id)}
                          />
                        ))}
                        {visibleProjects.filter((project) => project.area_id === area.id).length === 0 && (
                          <div style={{ ...cardStyle(), padding: 16, fontSize: 12, color: "var(--text-secondary)" }}>
                            No projects in this space yet.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button onClick={() => { setTab("user"); setUserSection("spaces"); }} style={buttonStyle()}>
              Manage projects and spaces
            </button>

            {activeProject && (
              <TaskSection
                title={activeProject.name}
                subtitle="Tasks in the selected project"
                tasks={selectedProjectTasks}
                projects={visibleProjects}
                loading={loadingData}
                swipeEnabled
                emptyActionLabel="Close project"
                onEmptyAction={async () => {
                  await closeProject(activeProject.id);
                  setSelectedProjectId(null);
                  await refreshAfterMutation();
                }}
                onComplete={async (id) => { await completeTask(id); await refreshAfterMutation(); }}
                onOpen={(task) => setEditingTask(task)}
              />
            )}
          </>
        )}

        {tab === "capture" && (
          <>
            <div style={{ ...cardStyle(), padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>Quick capture</div>
              </div>
              <div style={{ marginTop: 14 }}>
                <CaptureComposer
                  projects={visibleProjects}
                  tags={tags}
                  autofocusToken={captureAutofocusToken}
                  onCreated={async (task) => {
                    setEditingTask(task);
                    await refreshAfterMutation();
                  }}
                />
              </div>
            </div>
          </>
        )}

      {tab === "user" && (
          <MobileUserScreen
            currentSection={userSection}
            onSectionChange={setUserSection}
            areas={areas}
            hiddenAreaIds={hiddenAreaIds}
            areaSchedules={areaSchedules}
            onSchedulesChange={setAreaSchedules}
            onHiddenChange={setHiddenAreaIds}
            onAreasChange={loadData}
            signOut={signOut}
          />
        )}
      </div>
      </div>

      <div style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        ...cardStyle(),
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        padding: "8px 8px calc(8px + env(safe-area-inset-bottom, 0px))",
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: 8,
        zIndex: 40,
        boxShadow: "0 -8px 30px rgba(38, 38, 72, 0.08)",
      }} data-no-tab-swipe="true">
        {[
          { id: "pulse", label: "Pulse", icon: "◉" },
          { id: "tasks", label: "Tasks", icon: "→" },
          { id: "projects", label: "Projects", icon: "⬡" },
          { id: "capture", label: "Capture", icon: "+" },
          { id: "user", label: "User", icon: "◎" },
        ].map((item) => {
          const active = tab === item.id;
          const count =
            item.id === "pulse" ? pulseNavCount :
            item.id === "tasks" ? visibleTasks.length :
            item.id === "projects" ? visibleProjects.length :
            null;
          const subtleColor =
            item.id === "pulse"
              ? statusToneColor(pulseNavTone)
              : active
                ? "var(--accent)"
                : "var(--text-secondary)";
          return (
            <button
              key={item.id}
              onClick={() => {
                setTab(item.id as TabId);
                if (item.id !== "user") setUserSection(null);
              }}
              style={{
                padding: "10px 4px 8px",
                borderRadius: 16,
                background: active ? "linear-gradient(135deg, rgba(91,91,214,0.12), rgba(91,91,214,0.06))" : "transparent",
                color: active ? "var(--accent)" : "var(--text-secondary)",
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span style={{ fontSize: 16, color: subtleColor }}>{item.icon}</span>
              <span style={{ color: active ? "var(--accent)" : "var(--text-secondary)" }}>
                {item.label}{count != null ? ` (${count})` : ""}
              </span>
            </button>
          );
        })}
      </div>

      {editingTask && (
        <TaskEditor
          task={editingTask}
          projects={visibleProjects}
          onClose={() => setEditingTask(null)}
          onSave={async (fields) => {
            const previousProject = editingTask.project_id
              ? projects.find((project) => project.id === editingTask.project_id) ?? null
              : null;
            await updateTask(editingTask.id, {
              ...fields,
              area_id: fields.project_id
                ? null
                : editingTask.area_id ?? previousProject?.area_id ?? visibleAreas[0]?.id ?? areas[0]?.id ?? null,
            });
            await refreshAfterMutation();
          }}
          onComplete={async () => {
            await completeTask(editingTask.id);
            await refreshAfterMutation();
          }}
          onDelete={async () => {
            await deleteTask(editingTask.id);
            await refreshAfterMutation();
          }}
        />
      )}
    </div>
  );
}
