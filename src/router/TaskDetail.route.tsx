import { Navigate, useNavigate, useOutletContext, useParams } from "react-router-dom";
import type { AppOutletContext } from "./AppLayout.route";
import MobileTaskDetailView from "../views/pages/mobile/tasks/MobileTaskDetail.view";

// Full-screen route (no navbar frame): looks up the task by id in the shared
// data and renders its detail. Redirects to the list if the id isn't found.
// The view brings its own back-button header; back/complete return to the list.
export default function TaskDetailRoute() {
  const { taskId } = useParams();
  const { data } = useOutletContext<AppOutletContext>();
  const navigate = useNavigate();

  const task = data.tasks.find((t) => t.id === taskId) ?? null;
  if (!task) return <Navigate to="/all" replace />;

  const back = () => navigate(-1);

  return (
    <MobileTaskDetailView
      task={task}
      projects={data.projects}
      areas={data.areas}
      allTags={data.tags}
      onUpdated={data.refresh}
      onBack={back}
      onCompleted={() => {
        void data.refresh();
        back();
      }}
    />
  );
}
