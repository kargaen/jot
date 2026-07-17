import { useNavigate, useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "./AppLayout.route";
import MobileTasksView from "../views/pages/mobile/tasks/MobileTasks.view";
import { isInbox } from "../models/tasks/taskVisibility";

// Route container: the Inbox is the built-in no-project open-task view.
// It shares the same grouped task presentation and drill-down affordances as All.
export default function InboxRoute() {
  const { data, onComplete } = useOutletContext<AppOutletContext>();
  const navigate = useNavigate();
  const tasks = data.visibleTasks.filter(isInbox);

  return (
    <MobileTasksView
      tasks={tasks}
      areas={data.areas}
      projects={data.visibleProjects}
      loading={data.loadingData}
      onComplete={onComplete}
      onOpenTask={(id) => navigate(`/tasks/${id}`)}
      onDeleteTask={data.deleteTask}
      onOpenArea={(id) => navigate(`/spaces/${id}`)}
      onOpenProject={(id) => navigate(`/projects/${id}`)}
    />
  );
}
