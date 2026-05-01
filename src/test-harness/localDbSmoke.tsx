import ReactDOM from "react-dom/client";
import { useEffect, useMemo, useState } from "react";
import CreateTask from "../views/components/tasks/CreateTask.view";
import type { Area, Project, Tag, Task, TaskWithTags } from "../models/shared";
import {
  fetchAllTasks,
  fetchAreas,
  fetchProjects,
  fetchTags,
  signIn,
  signOut,
} from "../services/backend/supabase.service";
import "../styles/global.css";

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function LocalDbHarness() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [tasks, setTasks] = useState<TaskWithTags[]>([]);
  const [status, setStatus] = useState("Connecting to local Supabase...");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const areaId = useMemo(() => areas[0]?.id ?? null, [areas]);

  async function loadAll() {
    const [nextAreas, nextProjects, nextTags, nextTasks] = await Promise.all([
      fetchAreas(),
      fetchProjects(),
      fetchTags(),
      fetchAllTasks(),
    ]);
    setAreas(nextAreas);
    setProjects(nextProjects);
    setTags(nextTags);
    setTasks(nextTasks);
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        await signOut().catch(() => {});
        const { error: signInError } = await signIn(
          import.meta.env.VITE_E2E_TEST_EMAIL,
          import.meta.env.VITE_E2E_TEST_PASSWORD,
        );
        if (signInError) throw signInError;
        await loadAll();
        if (!cancelled) {
          setStatus("Connected to the local seeded test database.");
          setError(null);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(errorMessage(nextError));
          setStatus("Failed to connect to the local test database.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      data-testid="local-db-harness"
      style={{
        minHeight: "100vh",
        background: "var(--bg-secondary)",
        color: "var(--text-primary)",
        padding: "32px 24px 48px",
      }}
    >
      <div style={{ maxWidth: 880, margin: "0 auto", display: "grid", gap: 20 }}>
        <header style={{ display: "grid", gap: 8 }}>
          <h1 style={{ fontSize: 28, margin: 0 }}>Local DB Harness</h1>
          <p data-testid="local-db-status" style={{ margin: 0, color: "var(--text-secondary)" }}>
            {status}
          </p>
          {error && (
            <div
              data-testid="local-db-error"
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                background: "rgba(220,38,38,0.08)",
                color: "#dc2626",
              }}
            >
              {error}
            </div>
          )}
        </header>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          <Metric label="Areas" value={areas.length} testId="metric-areas" />
          <Metric label="Projects" value={projects.length} testId="metric-projects" />
          <Metric label="Tags" value={tags.length} testId="metric-tags" />
          <Metric label="Open Tasks" value={tasks.length} testId="metric-tasks" />
        </section>

        <section
          style={{
            background: "var(--bg-primary)",
            borderRadius: 18,
            border: "1px solid var(--border-default)",
            padding: 20,
            display: "grid",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>Create a real local task</div>
              <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                This writes to the local Supabase stack, then reloads the list below.
              </div>
            </div>
            <button
              data-testid="local-db-refresh"
              onClick={() => {
                void loadAll();
              }}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid var(--border-default)",
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
                cursor: "pointer",
              }}
            >
              Refresh
            </button>
          </div>

          {!loading && areaId && (
            <CreateTask
              areaId={areaId}
              projects={projects}
              allTags={tags}
              placeholder="Create a local test task..."
              canCreateProjectsAndTags
              onCreated={(_task: Task) => {
                void loadAll();
              }}
              onSaved={() => {
                void loadAll();
              }}
            />
          )}
        </section>

        <section
          style={{
            background: "var(--bg-primary)",
            borderRadius: 18,
            border: "1px solid var(--border-default)",
            padding: 20,
            display: "grid",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 600 }}>Seeded and created tasks</div>
          <ul
            data-testid="local-db-task-list"
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "grid",
              gap: 8,
            }}
          >
            {tasks.map((task) => (
              <li
                key={task.id}
                data-testid={`local-db-task-${task.id}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <span>{task.title}</span>
                <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>
                  {task.project_id ? "project" : "area"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  testId,
}: {
  label: string;
  value: number;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      style={{
        background: "var(--bg-primary)",
        borderRadius: 16,
        border: "1px solid var(--border-default)",
        padding: "16px 18px",
        display: "grid",
        gap: 4,
      }}
    >
      <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>{label}</span>
      <strong style={{ fontSize: 24 }}>{value}</strong>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<LocalDbHarness />);
