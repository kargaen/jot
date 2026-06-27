import { useNavigate, useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "./AppLayout.route";
import MobileUpcomingView from "../views/pages/mobile/upcoming/MobileUpcoming.view";

// Route container: reads shared app data from the layout's Outlet and feeds the
// Upcoming view. Opening a task navigates to its detail route.
export default function UpcomingRoute() {
  const { data } = useOutletContext<AppOutletContext>();
  const navigate = useNavigate();

  return (
    <MobileUpcomingView
      tasks={data.visibleTasks}
      loading={data.loadingData}
      onComplete={data.completeTask}
      onOpenTask={(id) => navigate(`/tasks/${id}`)}
    />
  );
}
