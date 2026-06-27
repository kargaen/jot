import { useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "./AppLayout.route";
import MobileLogbookView from "../views/pages/mobile/logbook/MobileLogbook.view";

// Route container: reads shared app data and feeds the Logbook view. The
// logbook is fetched lazily on mount (it isn't part of the initial app load).
export default function LogbookRoute() {
  const { data } = useOutletContext<AppOutletContext>();
  const { loadLogbook } = data;

  useEffect(() => {
    void loadLogbook();
  }, [loadLogbook]);

  return (
    <MobileLogbookView
      tasks={data.logbookTasks}
      loading={data.logbookLoading}
      completionDates={data.completionDates}
      onRestore={data.reopenTask}
    />
  );
}
