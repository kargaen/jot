import { Navigate, createBrowserRouter } from "react-router-dom";
import AppLayout from "./AppLayout.route";
import AppShell from "./AppShell.view";
import TodayRoute from "./Today.route";
import UpcomingRoute from "./Upcoming.route";
import AllRoute from "./All.route";
import CaptureRoute from "./Capture.route";
import LogbookRoute from "./Logbook.route";
import SettingsRoute from "./Settings.route";
import TaskDetailRoute from "./TaskDetail.route";
import AuthRoute from "./Auth.route";
import OnboardingRoute from "./Onboarding.route";
import MobileApp from "../views/pages/mobile/app/MobileApp.view";

// Renders nothing — a protected surface not yet ported into the router.
// AppShell still draws the title + navbar around it, so the layered layout is
// verifiable before any screen is migrated. Replaced screen-by-screen.
function Pending() {
  return null;
}

export const router = createBrowserRouter([
  // Default landing is now the routed app. "/_legacy" stays reachable as a
  // safety net until the routed app is confirmed on device, then it's removed.
  { path: "/", element: <Navigate to="/today" replace /> },

  // The current app, untouched, kept as a working reference during the port.
  { path: "/_legacy", element: <MobileApp /> },

  // Public / pre-app routes (no navbar frame, outside the protected layout).
  { path: "/auth", element: <AuthRoute /> },
  { path: "/onboarding", element: <OnboardingRoute /> },

  // Protected app: AppLayout owns the shared data fetch. Nav screens nest under
  // the AppShell sub-layout (persistent title + navbar, titles from `handle`);
  // full-screen routes (task detail) are direct children — same shared data, no
  // navbar frame.
  {
    element: <AppLayout />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: "today", handle: { title: "Today" }, element: <TodayRoute /> },
          { path: "upcoming", handle: { title: "Upcoming" }, element: <UpcomingRoute /> },
          { path: "overdue", handle: { title: "Overdue" }, element: <Pending /> },
          { path: "inbox", handle: { title: "Inbox" }, element: <Pending /> },
          { path: "all", handle: { title: "All" }, element: <AllRoute /> },
          { path: "logbook", handle: { title: "Logbook" }, element: <LogbookRoute /> },
          { path: "capture", handle: { title: "Capture" }, element: <CaptureRoute /> },
          { path: "settings", handle: { title: "Settings" }, element: <SettingsRoute /> },
          { path: "spaces/:areaId", handle: { title: "Space" }, element: <Pending /> },
          { path: "projects/:projectId", handle: { title: "Project" }, element: <Pending /> },
        ],
      },
      { path: "tasks/:taskId", element: <TaskDetailRoute /> },
      { path: "projects/:projectId/tasks/:taskId", element: <TaskDetailRoute /> },
    ],
  },

  // Anything unmatched falls back to the routed app.
  { path: "*", element: <Navigate to="/today" replace /> },
]);
