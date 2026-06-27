import { Navigate, createBrowserRouter } from "react-router-dom";
import AppLayout from "./AppLayout.route";
import TodayRoute from "./Today.route";
import UpcomingRoute from "./Upcoming.route";
import AllRoute from "./All.route";
import CaptureRoute from "./Capture.route";
import LogbookRoute from "./Logbook.route";
import MobileApp from "../views/pages/mobile/app/MobileApp.view";

// Renders nothing — a protected surface not yet ported into the router.
// AppShell still draws the title + navbar around it, so the layered layout is
// verifiable before any screen is migrated. Replaced screen-by-screen.
function Pending() {
  return null;
}

export const router = createBrowserRouter([
  // Default landing points at the working reference until the protected
  // screens are ported; then "/" flips to "/today" and "/_legacy" is deleted.
  { path: "/", element: <Navigate to="/_legacy" replace /> },

  // The current app, untouched, kept as a working reference during the port.
  { path: "/_legacy", element: <MobileApp /> },

  // Protected app shell: every child renders into AppShell's scrollable Outlet
  // and inherits the persistent title + navbar. Titles come from `handle`.
  {
    element: <AppLayout />,
    children: [
      { path: "today", handle: { title: "Today" }, element: <TodayRoute /> },
      { path: "upcoming", handle: { title: "Upcoming" }, element: <UpcomingRoute /> },
      { path: "overdue", handle: { title: "Overdue" }, element: <Pending /> },
      { path: "inbox", handle: { title: "Inbox" }, element: <Pending /> },
      { path: "all", handle: { title: "All" }, element: <AllRoute /> },
      { path: "logbook", handle: { title: "Logbook" }, element: <LogbookRoute /> },
      { path: "capture", handle: { title: "Capture" }, element: <CaptureRoute /> },
      { path: "settings", handle: { title: "Settings" }, element: <Pending /> },
      { path: "spaces/:areaId", handle: { title: "Space" }, element: <Pending /> },
      { path: "projects/:projectId", handle: { title: "Project" }, element: <Pending /> },
      { path: "tasks/:taskId", handle: { title: "Task" }, element: <Pending /> },
      {
        path: "projects/:projectId/tasks/:taskId",
        handle: { title: "Task" },
        element: <Pending />,
      },
    ],
  },

  // Anything unmatched falls back to the working reference for now.
  { path: "*", element: <Navigate to="/_legacy" replace /> },
]);
