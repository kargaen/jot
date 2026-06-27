import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import type { AppOutletContext } from "./AppLayout.route";
import MobileTasksView from "../views/pages/mobile/tasks/MobileTasks.view";

// Drill-down route: the tasks of a single space/area — directly assigned, or
// belonging to a project in that area (mirrors the desktop area "inbox" filter).
// Title resolves to the area name via the route's handle.
export default function SpaceRoute() {
  const { areaId } = useParams();
  const { data, onComplete } = useOutletContext<AppOutletContext>();
  const navigate = useNavigate();

  const tasks = data.visibleTasks.filter(
    (t) =>
      t.area_id === areaId ||
      (t.project_id != null &&
        data.projects.find((p) => p.id === t.project_id)?.area_id === areaId),
  );

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
