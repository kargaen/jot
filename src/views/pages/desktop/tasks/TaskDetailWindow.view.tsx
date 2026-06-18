import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useAuth } from "../../../../hooks/useAuth";
import { useTaskDetailWindow } from "../../../../hooks/useTaskDetailWindow";
import TaskDetail from "../../../components/tasks/TaskDetail.view";

export default function TaskDetailWindow() {
  const taskId = getCurrentWebviewWindow().label.slice(5);
  const { user } = useAuth();
  const { task, projects, areas, tags, error, loadAll } = useTaskDetailWindow(taskId, user?.id ?? null);

  if (!user) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-secondary)",
          color: "var(--text-secondary)",
          fontSize: 14,
        }}
      >
        Please sign in from the main window.
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-secondary)",
          color: "#dc2626",
          fontSize: 14,
        }}
      >
        {error}
      </div>
    );
  }

  if (!task) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-secondary)",
          color: "var(--text-tertiary)",
          fontSize: 14,
        }}
      >
        Loading…
      </div>
    );
  }

  return (
    <TaskDetail
      task={task}
      projects={projects}
      areas={areas}
      allTags={tags}
      onUpdated={loadAll}
    />
  );
}
