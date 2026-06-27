import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import type { AppOutletContext } from "./AppLayout.route";
import MobileTasksView from "../views/pages/mobile/tasks/MobileTasks.view";

// Drill-down route: the tasks of a single project (mirrors the desktop
// "project" view filter). Title resolves to the project name via the route's
// handle. Renders in the AppShell frame.
export default function ProjectRoute() {
  const { projectId } = useParams();
  const { data, onComplete } = useOutletContext<AppOutletContext>();
  const navigate = useNavigate();

  const tasks = data.visibleTasks.filter((t) => t.project_id === projectId);

  return (
    <MobileTasksView
      tasks={tasks}
      areas={data.areas}
      projects={data.visibleProjects}
      loading={data.loadingData}
      onComplete={onComplete}
      onOpenTask={(id) => navigate(`/tasks/${id}`)}
      onDeleteTask={data.deleteTask}
    />
  );
}
