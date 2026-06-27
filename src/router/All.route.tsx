import { useNavigate, useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "./AppLayout.route";
import MobileTasksView from "../views/pages/mobile/tasks/MobileTasks.view";

// Route container: reads shared app data from the layout's Outlet and feeds the
// All-tasks view. Opening a task navigates to its detail route.
export default function AllRoute() {
  const { data } = useOutletContext<AppOutletContext>();
  const navigate = useNavigate();

  return (
    <MobileTasksView
      tasks={data.visibleTasks}
      areas={data.areas}
      projects={data.visibleProjects}
      loading={data.loadingData}
      onComplete={data.completeTask}
      onOpenTask={(id) => navigate(`/tasks/${id}`)}
      onDeleteTask={data.deleteTask}
    />
  );
}
