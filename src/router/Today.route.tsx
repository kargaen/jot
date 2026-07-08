import { useNavigate, useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "./AppLayout.route";
import MobileTodayView from "../views/pages/mobile/today/MobileToday.view";

// Route container: reads shared app data from the layout's Outlet and feeds the
// Today view. Rendered into AppShell's Outlet — body only, no title or navbar.
// Opening a task navigates to its detail route.
export default function TodayRoute() {
  const { data, onComplete } = useOutletContext<AppOutletContext>();
  const navigate = useNavigate();

  return (
    <MobileTodayView
      tasks={data.visibleTasks}
      loading={data.loadingData}
      onComplete={onComplete}
      onOpenTask={(id) => navigate(`/tasks/${id}`)}
      areas={data.areas}
    />
  );
}
