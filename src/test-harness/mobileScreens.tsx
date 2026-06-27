import { useState } from "react";
import ReactDOM from "react-dom/client";
import type { Area, Project, Tag, TaskWithTags } from "../models/shared";
import MobileTasksView from "../views/pages/mobile/tasks/MobileTasks.view";
import MobileCaptureView from "../views/pages/mobile/capture/MobileCapture.view";
import "../styles/global.css";

// ── Mock data ───────────────────────────────────────────────────────────────
const area: Area = {
  id: "a1", user_id: "u1", name: "Work", color: "#5b5bd6",
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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <div style={{ display: "flex", gap: 32, padding: 32, flexWrap: "wrap", background: "#e2e8f0", minHeight: "100vh" }}>
    <TasksFrame />
    <CaptureFrame />
  </div>,
);
