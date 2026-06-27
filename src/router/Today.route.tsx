import { useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "./AppLayout.route";
import MobileTodayView from "../views/pages/mobile/today/MobileToday.view";

// Route container: reads shared app data from the layout's Outlet and feeds the
// Today view. Rendered into AppShell's Outlet — body only, no title or navbar.
export default function TodayRoute() {
  const { data, onComplete } = useOutletContext<AppOutletContext>();

  return (
    <MobileTodayView
      tasks={data.visibleTasks}
      loading={data.loadingData}
      onComplete={onComplete}
    />
  );
}
