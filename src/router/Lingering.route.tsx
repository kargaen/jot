import { useNavigate, useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "./AppLayout.route";
import MobileLingeringView from "../views/pages/mobile/lingering/MobileLingering.view";
import { loadLingeringDays } from "../utils/preferences/lingering";

// Route container: reads shared app data from the layout's Outlet and feeds the
// Lingering view. Opening a task navigates to its detail route.
export default function LingeringRoute() {
  const { data, onComplete } = useOutletContext<AppOutletContext>();
  const navigate = useNavigate();

  return (
    <MobileLingeringView
      tasks={data.visibleTasks}
      loading={data.loadingData}
      onComplete={onComplete}
      onOpenTask={(id) => navigate(`/tasks/${id}`)}
      areas={data.areas}
      thresholdDays={loadLingeringDays()}
    />
  );
}
