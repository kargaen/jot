import { Navigate, createBrowserRouter } from "react-router-dom";
import AppLayout from "./AppLayout.route";
import AppShell from "./AppShell.view";
import IndexRoute from "./Index.route";
import TodayRoute from "./Today.route";
import UpcomingRoute from "./Upcoming.route";
import InboxRoute from "./Inbox.route";
import AllRoute from "./All.route";
import CaptureRoute from "./Capture.route";
import LogbookRoute from "./Logbook.route";
import SettingsRoute from "./Settings.route";
import TaskDetailRoute from "./TaskDetail.route";
import SpaceRoute from "./Space.route";
import ProjectRoute from "./Project.route";
import AuthRoute from "./Auth.route";
import OnboardingRoute from "./Onboarding.route";
import type { AppOutletContext } from "./AppLayout.route";
import MobileApp from "../views/pages/mobile/app/MobileApp.view";
import { isDueToday, isInbox, isOverdue, isUpcoming } from "../models/tasks/taskVisibility";

// Export resolvers mirror each screen's own visibility grouping (same pure
// model predicates the views use) so "copy as JSON" matches what's on screen.
function todayExport(ctx: unknown) {
  const { data } = ctx as AppOutletContext;
  const today = new Date().toISOString().split("T")[0];
  return data.visibleTasks.filter((t) => isOverdue(t, today) || isDueToday(t, today));
}

function upcomingExport(ctx: unknown) {
  const { data } = ctx as AppOutletContext;
  const today = new Date().toISOString().split("T")[0];
  return data.visibleTasks.filter((t) => isUpcoming(t, today));
}

function inboxExport(ctx: unknown) {
  return (ctx as AppOutletContext).data.visibleTasks.filter(isInbox);
}

function allExport(ctx: unknown) {
  return (ctx as AppOutletContext).data.visibleTasks;
}

function logbookExport(ctx: unknown) {
  return (ctx as AppOutletContext).data.logbookTasks;
}

function spaceExport(ctx: unknown, params: Record<string, string | undefined>) {
  const { data } = ctx as AppOutletContext;
  return data.visibleTasks.filter(
    (t) =>
      t.area_id === params.areaId ||
      (t.project_id != null &&
        data.projects.find((p) => p.id === t.project_id)?.area_id === params.areaId),
  );
}

function projectExport(ctx: unknown, params: Record<string, string | undefined>) {
  const { data } = ctx as AppOutletContext;
  return data.visibleTasks.filter((t) => t.project_id === params.projectId);
}

// Renders nothing — a protected surface not yet ported into the router.
// AppShell still draws the title + navbar around it, so the layered layout is
// verifiable before any screen is migrated. Replaced screen-by-screen.
function Pending() {
  return null;
}

export const router = createBrowserRouter([
  // Default landing is now the routed app. The index resolver honors a pending
  // widget launch action (deterministically, no redirect race) before landing.
  { path: "/", element: <IndexRoute /> },

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
          { path: "today", handle: { title: "Today", exportTasks: todayExport }, element: <TodayRoute /> },
          { path: "upcoming", handle: { title: "Upcoming", exportTasks: upcomingExport }, element: <UpcomingRoute /> },
          { path: "overdue", handle: { title: "Overdue" }, element: <Pending /> },
          { path: "inbox", handle: { title: "Inbox", exportTasks: inboxExport }, element: <InboxRoute /> },
          { path: "all", handle: { title: "All", exportTasks: allExport }, element: <AllRoute /> },
          { path: "logbook", handle: { title: "Logbook", exportTasks: logbookExport }, element: <LogbookRoute /> },
          { path: "capture", handle: { title: "Capture" }, element: <CaptureRoute /> },
          { path: "settings", handle: { title: "Settings" }, element: <SettingsRoute /> },
          {
            path: "spaces/:areaId",
            handle: {
              title: (ctx: unknown, params: Record<string, string | undefined>) =>
                (ctx as AppOutletContext).data.areas.find((a) => a.id === params.areaId)?.name ?? "Space",
              exportTasks: spaceExport,
            },
            element: <SpaceRoute />,
          },
          {
            path: "projects/:projectId",
            handle: {
              title: (ctx: unknown, params: Record<string, string | undefined>) =>
                (ctx as AppOutletContext).data.projects.find((p) => p.id === params.projectId)?.name ?? "Project",
              exportTasks: projectExport,
            },
            element: <ProjectRoute />,
          },
        ],
      },
      { path: "tasks/:taskId", element: <TaskDetailRoute /> },
      { path: "projects/:projectId/tasks/:taskId", element: <TaskDetailRoute /> },
    ],
  },

  // Anything unmatched falls back to the routed app.
  { path: "*", element: <Navigate to="/today" replace /> },
]);
