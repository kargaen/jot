import { useAuth } from "../hooks/useAuth";
import { useMobileAppData } from "../hooks/useMobileApp";
import MobileTodayView from "../views/pages/mobile/today/MobileToday.view";

// Route container: owns the data hook and feeds the Today view. Rendered into
// AppShell's Outlet, so it provides only the screen body — no title or navbar.
// (Shared app data is fetched per-route for now; when a second screen is
// ported this moves up to a shared provider on the layout route.)
export default function TodayRoute() {
  const { user } = useAuth();
  const appData = useMobileAppData(user?.id ?? null);

  return (
    <MobileTodayView
      tasks={appData.visibleTasks}
      loading={appData.loadingData}
      onComplete={appData.completeTask}
    />
  );
}
