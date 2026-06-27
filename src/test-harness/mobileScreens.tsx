import { useState } from "react";
import ReactDOM from "react-dom/client";
import type { Area, Project, Tag, TaskWithTags } from "../models/shared";
import MobileTasksView from "../views/pages/mobile/tasks/MobileTasks.view";
import MobileCaptureView from "../views/pages/mobile/capture/MobileCapture.view";
import MobileTodayView from "../views/pages/mobile/today/MobileToday.view";
import MobileUpcomingView from "../views/pages/mobile/upcoming/MobileUpcoming.view";
import MobileLogbookView from "../views/pages/mobile/logbook/MobileLogbook.view";
import MobileSettingsView from "../views/pages/mobile/settings/MobileSettings.view";
import Button from "../views/components/ui/Button.view";
import Toast from "../views/components/ui/Toast.view";
import { Outlet, RouterProvider, createMemoryRouter, useOutletContext } from "react-router-dom";
import AppShell from "../router/AppShell.view";
import ProjectRoute from "../router/Project.route";
import type { AppOutletContext } from "../router/AppLayout.route";
import { AuthProvider } from "../hooks/useAuth";
import {
  useMobileAccountActions,
  useMobileProjectsActions,
  useMobileSpacesActions,
} from "../hooks/useMobileApp";
import "../styles/global.css";

// Honor ?theme=dark|light so the harness can be reviewed in either theme
// (mirrors how the app sets data-theme on the document root).
const themeParam = new URLSearchParams(location.search).get("theme");
if (themeParam === "dark" || themeParam === "light") {
  document.documentElement.setAttribute("data-theme", themeParam);
}

// ── Mock data ───────────────────────────────────────────────────────────────
const area: Area = {
  id: "a1", user_id: "u1", name: "Work", color: "var(--accent)",
  email: null, sort_order: 0, created_at: "2026-01-01",
};
const project: Project = {
  id: "p1", user_id: "u1", area_id: "a1", name: "jot", color: "#0ea5e9",
  status: "active", sort_order: 0, created_at: "2026-01-01",
};
const tags: Tag[] = [];

function makeTask(over: Partial<TaskWithTags> & { id: string; title: string }): TaskWithTags {
  return {
    user_id: "u1", project_id: "p1", area_id: null, parent_task_id: null,
    description: null, icon: null, notes: null, status: "todo", priority: "none",
    responsible_user_id: null, responsible_email: null, due_date: null, due_time: null,
    scheduled_date: null, recurrence_rule: null, estimated_mins: null, sort_order: 0,
    completed_at: null, created_at: "2026-06-01", updated_at: "2026-06-01", tags: [],
    ...over,
  };
}

const SEED: TaskWithTags[] = [
  makeTask({ id: "t1", title: "Call the dentist", icon: "Phone" }),
  makeTask({ id: "t2", title: "Practice guitar", icon: "Music" }),
  makeTask({ id: "t3", title: "Review the pull request", icon: "Code", due_date: "2026-06-20" }),
  makeTask({ id: "t4", title: "Buy groceries", icon: "ShoppingCart", priority: "high" }),
  makeTask({ id: "t5", title: "A task with no icon at all so we can confirm the fallback renders nothing" }),
  makeTask({ id: "t6", title: "Plan the offsite", icon: "Plane" }),
  makeTask({ id: "t7", title: "Water the plants", icon: "Shovel" }),
  makeTask({ id: "t8", title: "Write the weekly report", icon: "FileText" }),
];

// Future-dated tasks so the Upcoming screen has grouped content (today is ~2026-06-27).
const UPCOMING_SEED: TaskWithTags[] = [
  makeTask({ id: "u1", title: "Dentist appointment", icon: "Phone", due_date: "2026-06-28" }),
  makeTask({ id: "u2", title: "Team sync", icon: "Users", due_date: "2026-06-29", due_time: "10:00" }),
  makeTask({ id: "u3", title: "Submit tax forms", icon: "FileText", due_date: "2026-07-01", priority: "high" }),
  makeTask({ id: "u4", title: "Birthday gift", icon: "Gift", due_date: "2026-07-04" }),
];

// Completed tasks + dates so the Logbook screen has content and a heatmap.
const DONE_SEED: TaskWithTags[] = [
  makeTask({ id: "d1", title: "Shipped the release", icon: "Rocket", status: "completed", completed_at: "2026-06-27T09:30:00Z" }),
  makeTask({ id: "d2", title: "Reviewed designs", icon: "Eye", status: "completed", completed_at: "2026-06-27T14:10:00Z" }),
  makeTask({ id: "d3", title: "Paid invoices", icon: "CreditCard", status: "completed", completed_at: "2026-06-26T16:00:00Z" }),
];
const COMPLETION_DATES = ["2026-06-27", "2026-06-26", "2026-06-24", "2026-06-23", "2026-06-20"];

// Settings needs the real (pure) action hooks; wrapped so they can be called
// inside a component. Members/invites fetch fails gracefully under dummy env.
function SettingsHarness() {
  const accountActions = useMobileAccountActions();
  const spaceActions = useMobileSpacesActions();
  const projectActions = useMobileProjectsActions();
  return (
    <MobileSettingsView
      email="karga@karga.dk"
      areas={[area]}
      projects={[project]}
      tasks={SEED}
      hiddenAreaIds={[]}
      onHiddenChange={() => {}}
      accountActions={accountActions}
      spaceActions={spaceActions}
      projectActions={projectActions}
      onSignedOut={() => {}}
      onAreasChanged={() => {}}
    />
  );
}

// Maps a ?tab= value to the real screen (with mock data) + its title, so each
// ported tab can be reviewed inside the actual AppShell frame.
function tabChild(tab: string): { path: string; title: string; element: React.ReactNode } {
  switch (tab) {
    case "upcoming":
      return { path: "upcoming", title: "Upcoming", element: <MobileUpcomingView tasks={UPCOMING_SEED} loading={false} onComplete={() => {}} onOpenTask={() => {}} /> };
    case "all":
      return { path: "all", title: "All", element: <MobileTasksView tasks={SEED} areas={[area]} projects={[project]} loading={false} onComplete={() => {}} onOpenTask={() => {}} onDeleteTask={() => {}} onOpenArea={() => {}} onOpenProject={() => {}} /> };
    case "logbook":
      return { path: "logbook", title: "Logbook", element: <MobileLogbookView tasks={DONE_SEED} loading={false} completionDates={COMPLETION_DATES} onRestore={() => {}} /> };
    case "capture":
      return { path: "capture", title: "Capture", element: <MobileCaptureView projects={[project]} tags={tags} onSave={async () => {}} /> };
    case "settings":
      return { path: "settings", title: "Settings", element: <SettingsHarness /> };
    case "today":
    default:
      return { path: "today", title: "Today", element: <MobileTodayView tasks={SEED} loading={false} onComplete={() => {}} /> };
  }
}

function Phone({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", fontFamily: "system-ui" }}>{label}</div>
      <div style={{
        width: 390, height: 760, borderRadius: 28, border: "8px solid #0f172a",
        overflow: "hidden", background: "var(--bg-primary)", boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        display: "flex", flexDirection: "column",
      }}>
        {children}
      </div>
    </div>
  );
}

// A minimal shell that mirrors the real fixed-header / scrolling-body / fixed-nav
// layout so the scroll behavior is visible.
function TasksFrame() {
  const [tasks, setTasks] = useState<TaskWithTags[]>(SEED);
  return (
    <Phone label="Tasks — icons (A) + optimistic complete (F) + scroll">
      <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <header style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)" }}>All</div>
        </header>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }} data-testid="tasks-scroll">
          <MobileTasksView
            tasks={tasks}
            areas={[area]}
            projects={[project]}
            loading={false}
            onComplete={(id) => setTasks((prev) => prev.filter((t) => t.id !== id))}
            onOpenTask={() => {}}
            onDeleteTask={() => {}}
          />
        </div>
        <nav style={{ display: "flex", borderTop: "1px solid var(--border-default)", padding: 10, flexShrink: 0, justifyContent: "space-around", color: "var(--text-secondary)", fontSize: 12 }}>
          <span>Tasks</span><span>All</span><span>Capture</span><span>Settings</span>
        </nav>
      </div>
    </Phone>
  );
}

function CaptureFrame() {
  return (
    <Phone label="Capture — long-title split opt-in (E)">
      <div style={{ height: "100%", overflowY: "auto" }}>
        <MobileCaptureView projects={[project]} tags={tags} onSave={async () => {}} />
      </div>
    </Phone>
  );
}

function ButtonsFrame() {
  const variants = ["primary", "secondary", "danger", "ghost"] as const;
  const sizes = ["sm", "md", "lg"] as const;
  return (
    <Phone label="Components — Button (variants × sizes)">
      <div style={{ height: "100%", overflowY: "auto", padding: 20, display: "grid", gap: 16, background: "var(--bg-primary)" }}>
        {variants.map((v) => (
          <div key={v} style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{v}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {sizes.map((s) => (
                <Button key={s} variant={v} size={s}>{s}</Button>
              ))}
            </div>
          </div>
        ))}
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>states</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button loading>Saving…</Button>
            <Button disabled>Disabled</Button>
          </div>
          <Button variant="primary" fullWidth>Full width</Button>
        </div>
      </div>
    </Phone>
  );
}

// AppShell layout route exercised through a real data router so useMatches /
// handle.title / NavLink behave exactly as in production. The child is the real
// screen chosen by ?tab= (default today), rendered into the scrollable Outlet so
// the title + navbar stay fixed while the middle scrolls. Mounted full-bleed
// (?frame=shell) at a phone-sized viewport so 100dvh resolves to the phone.
const tabParam = new URLSearchParams(location.search).get("tab") ?? "today";
const tab = tabChild(tabParam);
const shellRouter = createMemoryRouter(
  [
    {
      element: <AppShell />,
      children: [{ path: tab.path, handle: { title: tab.title }, element: tab.element }],
    },
  ],
  { initialEntries: [`/${tab.path}`] },
);

// Verifies that shared context provided on a layout's Outlet flows through the
// AppShell sub-layout down to a nested screen (the exact nav-screen data path).
// A passing probe renders the marker text below.
function ContextProbe() {
  const ctx = useOutletContext<{ marker?: string }>();
  return <div style={{ padding: 20, color: "var(--text-primary)" }}>{ctx?.marker ?? "NO_CONTEXT"}</div>;
}
const shellDataRouter = createMemoryRouter(
  [
    {
      element: <Outlet context={{ marker: "CONTEXT_OK" }} />,
      children: [{ element: <AppShell />, children: [{ index: true, element: <ContextProbe /> }] }],
    },
  ],
  { initialEntries: ["/"] },
);

// Drill-down (project) review: provides a full mock outlet context so the
// ProjectRoute filter + AppShell's dynamic (function) title resolve as in the
// app. Title should show the project name ("jot").
const mockDrillContext = {
  user: null,
  data: {
    visibleTasks: SEED,
    areas: [area],
    visibleProjects: [project],
    projects: [project],
    loadingData: false,
    deleteTask: () => {},
  },
  onComplete: () => {},
  notify: () => {},
} as unknown as AppOutletContext;
const drillRouter = createMemoryRouter(
  [
    {
      element: <Outlet context={mockDrillContext} />,
      children: [
        {
          element: <AppShell />,
          children: [
            {
              path: "projects/:projectId",
              handle: {
                title: (ctx: unknown, params: Record<string, string | undefined>) =>
                  (ctx as AppOutletContext).data.projects.find((p) => p.id === params.projectId)?.name ?? "Project",
              },
              element: <ProjectRoute />,
            },
          ],
        },
      ],
    },
  ],
  { initialEntries: ["/projects/p1"] },
);

const root = ReactDOM.createRoot(document.getElementById("root")!);
const frame = new URLSearchParams(location.search).get("frame");

const showToast = new URLSearchParams(location.search).get("toast") === "1";

if (frame === "shell") {
  root.render(
    <AuthProvider>
      <RouterProvider router={shellRouter} />
      {showToast ? <Toast message="Nice — one less thing on your plate" badge="3 done today" /> : null}
    </AuthProvider>,
  );
} else if (frame === "shelldata") {
  root.render(<RouterProvider router={shellDataRouter} />);
} else if (frame === "drill") {
  root.render(<RouterProvider router={drillRouter} />);
} else {
  root.render(
    <div style={{ display: "flex", gap: 32, padding: 32, flexWrap: "wrap", background: "#e2e8f0", minHeight: "100vh" }}>
      <TasksFrame />
      <CaptureFrame />
      <ButtonsFrame />
    </div>,
  );
}
